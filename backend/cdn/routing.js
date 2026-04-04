class RoutingService {
  constructor(edges) {
    this.edges = edges;
    this.mode = 'round-robin';
    this.options = {
      alpha: 1,
      beta: 0,
      epsilon: 0,
      perturb: false,
      ewmaLambda: 0.2,
      loadScaleMs: 80,
      minAlpha: 0.05,
      maxAlpha: 0.95,
      varianceEps: 1e-6,
      maxPerturbation: 0.08,
      priorBlend: 0.25
    };
    this.currentIndex = 0;
    this.smoothedLoadByEdge = new Map();
    this.lastRoutingComputation = null;
  }

  setMode(mode, options = {}) {
    if (!['round-robin', 'alpha-beta'].includes(mode)) {
      throw new Error(`Unsupported mode: ${mode}`);
    }
    this.mode = mode;
    this.options = { ...this.options, ...options };
    this.currentIndex = 0;
  }

  static clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  static variance(values) {
    if (!Array.isArray(values) || values.length <= 1) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  }

  getDiagnostics() {
    return this.lastRoutingComputation;
  }

  route(req, edgeMetrics, inFlight = {}) {
    const available = this.edges.filter((e) => edgeMetrics[e.id]?.status === 'UP');
    if (available.length === 0) return null;

    if (this.mode === 'round-robin') {
      const edge = available[this.currentIndex % available.length];
      this.currentIndex++;
      return edge;
    }

    if (this.mode === 'alpha-beta') {
      const {
        alpha,
        beta,
        epsilon,
        perturb,
        ewmaLambda,
        loadScaleMs,
        minAlpha,
        maxAlpha,
        varianceEps,
        maxPerturbation,
        priorBlend
      } = this.options;

      const withSignals = available.map((edge) => {
        const metrics = edgeMetrics[edge.id] || {};
        const lat = Number(metrics.latency || 100);

        // Predictive Local Tracking: combine polled load and local in-flight estimate.
        const effectiveLoad = Number(metrics.load || 0) + Number(inFlight[edge.id] || 0);

        const prevSmoothed = Number(this.smoothedLoadByEdge.get(edge.id) ?? effectiveLoad);
        const smoothedLoad = (ewmaLambda * effectiveLoad) + ((1 - ewmaLambda) * prevSmoothed);
        this.smoothedLoadByEdge.set(edge.id, smoothedLoad);

        return { edge, lat, effectiveLoad, smoothedLoad };
      });

      const latencyValues = withSignals.map((row) => row.lat);
      const loadScoreValues = withSignals.map((row) => row.smoothedLoad * loadScaleMs);

      const latencyVariance = RoutingService.variance(latencyValues);
      const loadVariance = RoutingService.variance(loadScoreValues);
      const totalVariance = latencyVariance + loadVariance + varianceEps;

      const alphaTarget = RoutingService.clamp(latencyVariance / totalVariance, minAlpha, maxAlpha);

      const varianceSpread = Math.abs(latencyVariance - loadVariance) / totalVariance;
      const perturbWindow = maxPerturbation * varianceSpread;
      const perturbation = perturb ? ((Math.random() * 2 - 1) * perturbWindow) : 0;

      const alphaPerturbed = RoutingService.clamp(alphaTarget + perturbation, minAlpha, maxAlpha);
      const baseAlpha = RoutingService.clamp(alpha, minAlpha, maxAlpha);
      const alphaAdaptive = RoutingService.clamp(
        (priorBlend * baseAlpha) + ((1 - priorBlend) * alphaPerturbed),
        minAlpha,
        maxAlpha
      );
      const betaAdaptive = 1 - alphaAdaptive;

      this.lastRoutingComputation = {
        mode: this.mode,
        alphaBase: Number(alpha.toFixed(4)),
        betaBase: Number(beta.toFixed(4)),
        alphaTarget: Number(alphaTarget.toFixed(4)),
        alphaAdaptive: Number(alphaAdaptive.toFixed(4)),
        betaAdaptive: Number(betaAdaptive.toFixed(4)),
        latencyVariance: Number(latencyVariance.toFixed(4)),
        loadVariance: Number(loadVariance.toFixed(4)),
        varianceSpread: Number(varianceSpread.toFixed(4)),
        perturbEnabled: Boolean(perturb),
        perturbWindow: Number(perturbWindow.toFixed(4)),
        perturbation: Number(perturbation.toFixed(4)),
        ewmaLambda: Number(ewmaLambda),
        loadScaleMs: Number(loadScaleMs)
      };

      const scoredEdges = withSignals.map((row) => {
        const loadScoreMs = row.smoothedLoad * loadScaleMs;
        const score = (alphaAdaptive * row.lat) + (betaAdaptive * loadScoreMs);
        return {
          edge: row.edge,
          score,
          lat: row.lat,
          effectiveLoad: row.effectiveLoad,
          smoothedLoad: row.smoothedLoad,
          loadScoreMs
        };
      });

      scoredEdges.sort((x, y) => x.score - y.score);

      if (epsilon > 0 && Math.random() < epsilon) {
        if (scoredEdges.length > 1) {
          const randomIndex = 1 + Math.floor(Math.random() * (scoredEdges.length - 1));
          return scoredEdges[randomIndex].edge;
        }
      }

      return scoredEdges[0].edge;
    }
  }
}

module.exports = RoutingService;
