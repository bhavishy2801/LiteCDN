const os = require('os');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');
const { SegmentedCache } = require('./cache');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

const PORT = Number(process.env.PORT || 3001);
const EDGE_ID = process.env.EDGE_ID || os.hostname();
const EDGE_REGION = process.env.EDGE_REGION || 'unknown';
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://control-plane:8080';
const EDGE_ADVERTISE_HOST = process.env.EDGE_ADVERTISE_HOST || os.hostname();
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 3000);

let isEnabled = true;
let inFlightRequests = 0;
const rollingLatencies = [];

const cache = new SegmentedCache({
  maxEntries: Number(process.env.CACHE_MAX_ENTRIES || 200),
  ttlMs: Number(process.env.CACHE_TTL_MS || 600000)
});

function avgLatency() {
  if (!rollingLatencies.length) return 0;
  return rollingLatencies.reduce((a, b) => a + b, 0) / rollingLatencies.length;
}

async function getOriginConfig() {
  const response = await axios.get(`${CONTROL_PLANE_URL}/v1/origin/config`, { timeout: 2000 });
  return response.data;
}

function getMetrics() {
  const cacheSnapshot = cache.snapshot();
  const totalRequests = cacheSnapshot.stats.hits + cacheSnapshot.stats.misses;
  return {
    edgeId: EDGE_ID,
    region: EDGE_REGION,
    health: 'UP',
    inFlightRequests,
    avgLatencyMs: Number(avgLatency().toFixed(2)),
    requestCount: totalRequests,
    hitRatio: Number((cacheSnapshot.stats.hitRatio || 0).toFixed(4)),
    cache: cacheSnapshot
  };
}

async function sendHeartbeat() {
  const payload = {
    id: EDGE_ID,
    url: `http://${EDGE_ADVERTISE_HOST}:${PORT}`,
    region: EDGE_REGION,
    enabled: isEnabled,
    capabilities: {
      policies: ['SEGMENTED']
    },
    metrics: getMetrics()
  };

  try {
    await axios.post(`${CONTROL_PLANE_URL}/v1/edges/heartbeat`, payload, { timeout: 2000 });
  } catch (error) {
    console.error('[edge] heartbeat failed:', error.message);
  }
}

setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

app.get('/health', (_req, res) => {
  res.json({ status: 'UP', service: 'edge', id: EDGE_ID, enabled: isEnabled });
});

app.get('/v1/metrics', (_req, res) => {
  res.json(getMetrics());
});

app.post('/v1/admin/state', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean' });
  }
  isEnabled = enabled;
  return res.json({ message: 'edge state updated', enabled: isEnabled, id: EDGE_ID });
});

app.post('/v1/admin/cache-policy', (req, res) => {
  const { policy, maxEntries, ttlMs } = req.body;
  if (policy && String(policy).toUpperCase() !== 'SEGMENTED') {
    return res.status(400).json({ error: 'Only SEGMENTED cache policy is supported' });
  }

  cache.setPolicy({ maxEntries, ttlMs });
  return res.json({ message: 'cache policy updated', cache: cache.snapshot() });
});

app.post('/v1/admin/cache/purge', (_req, res) => {
  cache.clear();
  return res.json({ message: 'cache purged', cache: cache.snapshot() });
});

app.get('/v1/content/:filename', async (req, res) => {
  if (!isEnabled) {
    return res.status(503).json({ error: 'edge is disabled' });
  }

  const filename = req.params.filename;
  const key = `/content/${filename}`;
  const startedAt = Date.now();
  inFlightRequests += 1;

  try {
    const cached = cache.get(key);
    if (cached !== null) {
      const latencyMs = Date.now() - startedAt;
      rollingLatencies.push(latencyMs);
      if (rollingLatencies.length > 50) rollingLatencies.shift();

      res.setHeader('x-litecdn-edge-id', EDGE_ID);
      res.setHeader('x-litecdn-cache', 'HIT');
      return res.status(200).send(cached);
    }

    const origin = await getOriginConfig();
    if (!origin.enabled) {
      return res.status(503).json({ error: 'origin is disabled by control-plane' });
    }

    const upstream = await axios.get(`${origin.baseUrl}/content/${filename}`, {
      timeout: 3000,
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    const body = Buffer.from(upstream.data);
    if (upstream.status === 200) {
      cache.set(key, body);
    }

    const latencyMs = Date.now() - startedAt;
    rollingLatencies.push(latencyMs);
    if (rollingLatencies.length > 50) rollingLatencies.shift();

    res.setHeader('x-litecdn-edge-id', EDGE_ID);
    res.setHeader('x-litecdn-cache', upstream.status === 200 ? 'MISS' : 'BYPASS');
    if (upstream.headers['content-type']) {
      res.setHeader('content-type', upstream.headers['content-type']);
    }
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).json({ error: 'failed to fetch from origin', detail: error.message });
  } finally {
    inFlightRequests = Math.max(0, inFlightRequests - 1);
  }
});

app.listen(PORT, async () => {
  console.log(`[edge] ${EDGE_ID} listening on :${PORT}`);
  await sendHeartbeat();
});
