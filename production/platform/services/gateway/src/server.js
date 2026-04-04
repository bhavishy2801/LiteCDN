const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const { AlphaBetaEpsilonRouter } = require('./router');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));

const PORT = Number(process.env.PORT || 8081);
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://control-plane:8080';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 5000);

const router = new AlphaBetaEpsilonRouter({
  alpha: Number(process.env.ROUTING_ALPHA || 0.7),
  beta: Number(process.env.ROUTING_BETA || 0.3),
  epsilon: Number(process.env.ROUTING_EPSILON || 0.1),
  minAlpha: Number(process.env.ROUTING_MIN_ALPHA || 0.05),
  maxAlpha: Number(process.env.ROUTING_MAX_ALPHA || 0.95),
  varianceEps: Number(process.env.ROUTING_VARIANCE_EPS || 1e-6),
  loadScaleMs: Number(process.env.ROUTING_LOAD_SCALE_MS || 80),
  ewmaLambda: Number(process.env.ROUTING_EWMA_LAMBDA || 0.2),
  loadCurrentWeight: Number(process.env.ROUTING_LOAD_W_CURRENT || 0.5),
  loadPrevWeight: Number(process.env.ROUTING_LOAD_W_PREV || 0.35),
  loadCacheWeight: Number(process.env.ROUTING_LOAD_W_CACHE || 0.15),
  maxPerturbation: Number(process.env.ROUTING_MAX_PERTURBATION || 0.08),
  priorBlend: Number(process.env.ROUTING_PRIOR_BLEND || 0.25)
});
let requestCounter = 0;

const telemetry = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  strategyUsage: {
    ALPHA_BETA_EPSILON: 0
  },
  recentFlow: []
};

function pushFlowEvent(event) {
  telemetry.recentFlow.push(event);
  if (telemetry.recentFlow.length > 40) {
    telemetry.recentFlow.shift();
  }
}

async function fetchTopology() {
  const response = await axios.get(`${CONTROL_PLANE_URL}/v1/topology`, { timeout: REQUEST_TIMEOUT_MS });
  return response.data;
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    service: 'gateway',
    routing: router.getParameters()
  });
});

app.get('/api/topology', async (_req, res) => {
  try {
    const topology = await fetchTopology();
    return res.json(topology);
  } catch (error) {
    return res.status(502).json({ error: 'control-plane unavailable', detail: error.message });
  }
});

app.get('/api/metrics', (_req, res) => {
  const totalCache = telemetry.cacheHits + telemetry.cacheMisses;
  res.json({
    ...telemetry,
    cacheHitRatio: totalCache === 0 ? 0 : telemetry.cacheHits / totalCache,
    routing: router.getParameters()
  });
});

app.post('/api/admin/flow/reset', (_req, res) => {
  telemetry.recentFlow = [];
  return res.json({ message: 'recent flow cleared' });
});

app.get('/api/admin/routing-policy', (_req, res) => {
  res.json(router.getParameters());
});

app.post('/api/admin/routing-policy', (req, res) => {
  const alpha = Number(req.body.alpha);
  const beta = Number(req.body.beta);
  const epsilon = Number(req.body.epsilon);

  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(epsilon)) {
    return res.status(400).json({ error: 'alpha, beta, and epsilon must be numeric' });
  }

  if (alpha < 0 || beta < 0) {
    return res.status(400).json({ error: 'alpha and beta must be >= 0' });
  }

  if (epsilon < 0 || epsilon > 1) {
    return res.status(400).json({ error: 'epsilon must be in range [0, 1]' });
  }

  router.setParameters({ alpha, beta, epsilon });
  return res.json({ message: 'routing policy updated', routing: router.getParameters() });
});

app.post('/api/admin/origin/state', async (req, res) => {
  try {
    const response = await axios.post(`${CONTROL_PLANE_URL}/v1/origin/state`, req.body, {
      timeout: REQUEST_TIMEOUT_MS
    });
    return res.json(response.data);
  } catch (error) {
    return res.status(error.response?.status || 502).json(error.response?.data || { error: error.message });
  }
});

app.post('/api/admin/edge/:edgeId/state', async (req, res) => {
  const { edgeId } = req.params;

  try {
    await axios.post(`${CONTROL_PLANE_URL}/v1/edges/${edgeId}/state`, req.body, {
      timeout: REQUEST_TIMEOUT_MS
    });

    const topology = await fetchTopology();
    const edge = topology.edges.find((e) => e.id === edgeId);

    if (edge) {
      await axios.post(`${edge.url}/v1/admin/state`, req.body, { timeout: REQUEST_TIMEOUT_MS });
    }

    return res.json({ message: 'edge state propagated', edgeId, enabled: req.body.enabled });
  } catch (error) {
    return res.status(error.response?.status || 502).json(error.response?.data || { error: error.message });
  }
});

app.post('/api/admin/cache-policy', async (req, res) => {
  if (req.body.policy && String(req.body.policy).toUpperCase() !== 'SEGMENTED') {
    return res.status(400).json({ error: 'Only SEGMENTED cache policy is supported' });
  }

  try {
    const topology = await fetchTopology();
    const healthyEdges = topology.edges.filter((e) => e.health === 'UP');

    const updates = await Promise.allSettled(
      healthyEdges.map((edge) =>
        axios.post(`${edge.url}/v1/admin/cache-policy`, req.body, { timeout: REQUEST_TIMEOUT_MS })
      )
    );

    const summary = updates.map((result, index) => ({
      edgeId: healthyEdges[index].id,
      ok: result.status === 'fulfilled',
      detail: result.status === 'fulfilled' ? result.value.data : result.reason.message
    }));

    return res.json({ message: 'cache policy update attempted on active edges', summary });
  } catch (error) {
    return res.status(502).json({ error: 'failed to update cache policy', detail: error.message });
  }
});

app.post('/api/admin/cache/purge', async (_req, res) => {
  try {
    const topology = await fetchTopology();
    const healthyEdges = topology.edges.filter((e) => e.health === 'UP');

    const updates = await Promise.allSettled(
      healthyEdges.map((edge) =>
        axios.post(`${edge.url}/v1/admin/cache/purge`, {}, { timeout: REQUEST_TIMEOUT_MS })
      )
    );

    const summary = updates.map((result, index) => ({
      edgeId: healthyEdges[index].id,
      ok: result.status === 'fulfilled',
      detail: result.status === 'fulfilled' ? result.value.data : result.reason.message
    }));

    return res.json({ message: 'cache purge attempted on active edges', summary });
  } catch (error) {
    return res.status(502).json({ error: 'failed to purge edge caches', detail: error.message });
  }
});

app.get('/api/origin/files', async (_req, res) => {
  try {
    const topology = await fetchTopology();
    const origin = topology.origin;
    const response = await axios.get(`${origin.baseUrl}/files`, { timeout: REQUEST_TIMEOUT_MS });
    return res.json(response.data);
  } catch (error) {
    return res.status(502).json({ error: 'failed to list origin files', detail: error.message });
  }
});

app.delete('/api/origin/files/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (!filename || filename.includes('/')) {
    return res.status(400).json({ error: 'invalid filename' });
  }

  try {
    const topology = await fetchTopology();
    const origin = topology.origin;
    const response = await axios.delete(`${origin.baseUrl}/content/${encodeURIComponent(filename)}`, {
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    return res.status(502).json({ error: 'failed to delete origin file', detail: error.message });
  }
});

app.get('/api/content/:filename', async (req, res) => {
  const startedAt = Date.now();
  requestCounter += 1;

  try {
    const topology = await fetchTopology();
    const selection = router.choose(topology.edges);

    if (!selection) {
      return res.status(503).json({ error: 'no healthy edge available' });
    }

    const { edge, strategyUsed } = selection;
    telemetry.strategyUsage[strategyUsed] += 1;

    const upstream = await axios.get(`${edge.url}/v1/content/${encodeURIComponent(req.params.filename)}`, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    const cacheHeader = upstream.headers['x-litecdn-cache'] || 'BYPASS';
    if (cacheHeader === 'HIT') telemetry.cacheHits += 1;
    if (cacheHeader === 'MISS') telemetry.cacheMisses += 1;

    telemetry.totalRequests += 1;

    const event = {
      id: requestCounter,
      timestamp: new Date().toISOString(),
      filename: req.params.filename,
      strategyUsed,
      edgeId: edge.id,
      edgeUrl: edge.url,
      cache: cacheHeader,
      latencyMs: Date.now() - startedAt,
      statusCode: upstream.status
    };
    pushFlowEvent(event);

    res.setHeader('x-litecdn-selected-edge', edge.id);
    res.setHeader('x-litecdn-routing', strategyUsed);
    res.setHeader('x-litecdn-routing-params', JSON.stringify(router.getParameters()));
    res.setHeader('x-litecdn-cache', cacheHeader);
    res.setHeader('x-litecdn-latency-ms', String(event.latencyMs));
    if (upstream.headers['content-type']) {
      res.setHeader('content-type', upstream.headers['content-type']);
    }

    return res.status(upstream.status).send(Buffer.from(upstream.data));
  } catch (error) {
    telemetry.totalRequests += 1;
    return res.status(502).json({ error: 'gateway fetch failed', detail: error.message });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const topology = await fetchTopology();
    const origin = topology.origin;

    const upstream = await axios.post(`${origin.baseUrl}/upload`, req, {
      timeout: REQUEST_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: {
        'content-type': req.headers['content-type'] || 'application/octet-stream',
        'content-length': req.headers['content-length']
      },
      validateStatus: () => true
    });

    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return res.status(502).json({ error: 'failed to upload via gateway', detail: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[gateway] running on :${PORT}`);
});
