class AlphaBetaEpsilonRouter {
  constructor(options = {}) {
    this.alpha = Number(options.alpha ?? 0.7);
    this.beta = Number(options.beta ?? 0.3);
    this.epsilon = Number(options.epsilon ?? 0.1);

    this.minAlpha = Number(options.minAlpha ?? 0.05);
    this.maxAlpha = Number(options.maxAlpha ?? 0.95);
    this.varianceEps = Number(options.varianceEps ?? 1e-6);
    this.loadScaleMs = Number(options.loadScaleMs ?? 80);

    this.ewmaLambda = Number(options.ewmaLambda ?? 0.2);
    this.loadCurrentWeight = Number(options.loadCurrentWeight ?? 0.5);
    this.loadPrevWeight = Number(options.loadPrevWeight ?? 0.35);
    this.loadCacheWeight = Number(options.loadCacheWeight ?? 0.15);

    this.maxPerturbation = Number(options.maxPerturbation ?? 0.08);
    this.priorBlend = Number(options.priorBlend ?? 0.25);

    this.smoothedLoadByEdge = new Map();
    this.lastComputation = null;
  }

  setParameters(options = {}) {
    if (options.alpha !== undefined) this.alpha = Number(options.alpha);
    if (options.beta !== undefined) this.beta = Number(options.beta);
    if (options.epsilon !== undefined) this.epsilon = Number(options.epsilon);
  }

  getParameters() {
    return {
      strategy: 'ALPHA_BETA_EPSILON',
      alpha: this.alpha,
      beta: this.beta,
      epsilon: this.epsilon,
      adaptive: this.lastComputation || null
    };
  }

  static clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  static variance(values) {
    if (!Array.isArray(values) || values.length <= 1) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  }

  static safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  getCachePressure(edge) {
    const entries = AlphaBetaEpsilonRouter.safeNumber(edge.metrics?.cache?.entries, 0);
    const maxEntries = AlphaBetaEpsilonRouter.safeNumber(edge.metrics?.cache?.maxEntries, 0);
    if (maxEntries <= 0) return 0;
    return AlphaBetaEpsilonRouter.clamp(entries / maxEntries, 0, 1);
  }

  computeSmoothedLoad(edge, maxCurrentLoad) {
    const edgeId = edge.id;
    const currentLoad = AlphaBetaEpsilonRouter.safeNumber(edge.metrics?.inFlightRequests, 0);
    const prevLoad = AlphaBetaEpsilonRouter.safeNumber(this.smoothedLoadByEdge.get(edgeId), currentLoad);

    const cachePressure = this.getCachePressure(edge);
    const cacheScaledLoad = cachePressure * Math.max(1, maxCurrentLoad);

    const blendedSignal =
      (this.loadCurrentWeight * currentLoad) +
      (this.loadPrevWeight * prevLoad) +
      (this.loadCacheWeight * cacheScaledLoad);

    const smoothedLoad = (this.ewmaLambda * blendedSignal) + ((1 - this.ewmaLambda) * prevLoad);
    this.smoothedLoadByEdge.set(edgeId, smoothedLoad);

    return {
      currentLoad,
      prevLoad,
      cachePressure,
      cacheScaledLoad,
      blendedSignal,
      smoothedLoad
    };
  }

  computeAdaptiveWeights(latencies, smoothedLoads) {
    const latencyVariance = AlphaBetaEpsilonRouter.variance(latencies);
    const scaledLoads = smoothedLoads.map((load) => load * this.loadScaleMs);
    const loadVariance = AlphaBetaEpsilonRouter.variance(scaledLoads);

    const totalVariance = latencyVariance + loadVariance + this.varianceEps;
    const alphaTargetRaw = latencyVariance / totalVariance;
    const alphaTarget = AlphaBetaEpsilonRouter.clamp(alphaTargetRaw, this.minAlpha, this.maxAlpha);

    const varianceSpread = Math.abs(latencyVariance - loadVariance) / totalVariance;
    const perturbWindow = this.maxPerturbation * varianceSpread;
    const perturbation = (Math.random() * 2 - 1) * perturbWindow;

    const alphaPerturbed = AlphaBetaEpsilonRouter.clamp(alphaTarget + perturbation, this.minAlpha, this.maxAlpha);

    const baseAlpha = AlphaBetaEpsilonRouter.clamp(this.alpha, this.minAlpha, this.maxAlpha);
    const blendedAlpha = (this.priorBlend * baseAlpha) + ((1 - this.priorBlend) * alphaPerturbed);
    const alphaAdaptive = AlphaBetaEpsilonRouter.clamp(blendedAlpha, this.minAlpha, this.maxAlpha);
    const betaAdaptive = 1 - alphaAdaptive;

    this.lastComputation = {
      alphaTarget: Number(alphaTarget.toFixed(4)),
      alphaPerturbed: Number(alphaPerturbed.toFixed(4)),
      alphaAdaptive: Number(alphaAdaptive.toFixed(4)),
      betaAdaptive: Number(betaAdaptive.toFixed(4)),
      latencyVariance: Number(latencyVariance.toFixed(4)),
      loadVariance: Number(loadVariance.toFixed(4)),
      varianceSpread: Number(varianceSpread.toFixed(4)),
      perturbWindow: Number(perturbWindow.toFixed(4)),
      perturbation: Number(perturbation.toFixed(4)),
      ewmaLambda: this.ewmaLambda,
      loadScaleMs: this.loadScaleMs
    };

    return { alphaAdaptive, betaAdaptive };
  }

  choose(edges) {
    if (!Array.isArray(edges) || edges.length === 0) {
      return null;
    }

    const healthy = edges.filter((e) => e.health === 'UP' && e.enabled);
    if (!healthy.length) return null;

    const maxCurrentLoad = Math.max(
      1,
      ...healthy.map((edge) => AlphaBetaEpsilonRouter.safeNumber(edge.metrics?.inFlightRequests, 0))
    );

    const withSignals = healthy.map((edge) => {
      const latency = AlphaBetaEpsilonRouter.safeNumber(edge.metrics?.avgLatencyMs, 100);
      const loadSignals = this.computeSmoothedLoad(edge, maxCurrentLoad);
      return { edge, latency, ...loadSignals };
    });

    const { alphaAdaptive, betaAdaptive } = this.computeAdaptiveWeights(
      withSignals.map((entry) => entry.latency),
      withSignals.map((entry) => entry.smoothedLoad)
    );

    const scored = withSignals.map((entry) => {
      const loadScoreMs = entry.smoothedLoad * this.loadScaleMs;
      const score = (alphaAdaptive * entry.latency) + (betaAdaptive * loadScoreMs);
      return {
        edge: entry.edge,
        score,
        latency: entry.latency,
        smoothedLoad: entry.smoothedLoad,
        loadScoreMs
      };
    });

    scored.sort((a, b) => a.score - b.score);

    let selected = scored[0].edge;
    if (this.epsilon > 0 && scored.length > 1 && Math.random() < this.epsilon) {
      const randomIndex = 1 + Math.floor(Math.random() * (scored.length - 1));
      selected = scored[randomIndex].edge;
    }

    return { edge: selected, strategyUsed: 'ALPHA_BETA_EPSILON' };
  }
}

module.exports = { AlphaBetaEpsilonRouter };
