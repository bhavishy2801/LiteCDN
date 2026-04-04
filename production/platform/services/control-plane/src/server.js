const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));

const PORT = Number(process.env.PORT || 8080);
const EDGE_HEARTBEAT_TTL_MS = Number(process.env.EDGE_HEARTBEAT_TTL_MS || 15000);

const state = {
  origin: {
    baseUrl: process.env.ORIGIN_BASE_URL || 'http://origin:4000',
    enabled: true,
    updatedAt: new Date().toISOString()
  },
  edges: new Map()
};

function pruneInactiveEdges() {
  const now = Date.now();
  for (const [id, edge] of state.edges.entries()) {
    if (now - edge.lastHeartbeatAtMs > EDGE_HEARTBEAT_TTL_MS) {
      edge.health = 'DOWN';
      state.edges.set(id, edge);
    }
  }
}

setInterval(pruneInactiveEdges, 1000);

app.get('/health', (_req, res) => {
  res.json({ status: 'UP', service: 'control-plane' });
});

app.get('/v1/origin/config', (_req, res) => {
  res.json(state.origin);
});

app.post('/v1/origin/config', (req, res) => {
  const { baseUrl } = req.body;
  if (!baseUrl || typeof baseUrl !== 'string') {
    return res.status(400).json({ error: 'baseUrl is required' });
  }
  state.origin.baseUrl = baseUrl;
  state.origin.updatedAt = new Date().toISOString();
  return res.json({ message: 'Origin config updated', origin: state.origin });
});

app.post('/v1/origin/state', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean' });
  }
  state.origin.enabled = enabled;
  state.origin.updatedAt = new Date().toISOString();
  return res.json({ message: 'Origin state updated', origin: state.origin });
});

app.post('/v1/edges/heartbeat', (req, res) => {
  const { id, url, region, metrics, capabilities, enabled } = req.body;
  if (!id || !url) {
    return res.status(400).json({ error: 'id and url are required' });
  }

  const now = Date.now();
  const existing = state.edges.get(id) || {};
  const merged = {
    id,
    url,
    region: region || existing.region || 'unknown',
    enabled: typeof enabled === 'boolean' ? enabled : existing.enabled ?? true,
    metrics: metrics || existing.metrics || {},
    capabilities: capabilities || existing.capabilities || {},
    health: 'UP',
    lastHeartbeatAtMs: now,
    lastHeartbeatAt: new Date(now).toISOString()
  };

  state.edges.set(id, merged);
  return res.json({ message: 'Heartbeat recorded', edge: merged });
});

app.get('/v1/edges', (_req, res) => {
  pruneInactiveEdges();
  return res.json({
    edges: Array.from(state.edges.values()).sort((a, b) => a.id.localeCompare(b.id))
  });
});

app.post('/v1/edges/:edgeId/state', (req, res) => {
  const edge = state.edges.get(req.params.edgeId);
  if (!edge) {
    return res.status(404).json({ error: 'edge not found' });
  }
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean' });
  }
  edge.enabled = enabled;
  state.edges.set(edge.id, edge);
  return res.json({ message: 'Edge state updated', edge });
});

app.get('/v1/topology', (_req, res) => {
  pruneInactiveEdges();
  const edges = Array.from(state.edges.values()).sort((a, b) => a.id.localeCompare(b.id));
  res.json({
    origin: state.origin,
    summary: {
      totalEdges: edges.length,
      activeEdges: edges.filter((e) => e.health === 'UP' && e.enabled).length,
      disabledEdges: edges.filter((e) => !e.enabled).length
    },
    edges
  });
});

app.listen(PORT, () => {
  console.log(`[control-plane] running on :${PORT}`);
});
