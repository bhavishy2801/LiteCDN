/**
 * ============================================================
 *  LiteCDN – CDN System / Gateway Router
 * ============================================================
 *  This is the **main entry-point** that clients hit.
 *  It acts as a reverse-proxy: for every incoming request it
 *  uses the RoutingService to pick an Edge Server via
 *  round-robin, then proxies the request to that edge and
 *  streams the response back to the client.
 *
 *  Endpoints
 *  ---------
 *  GET /cdn/*      →  Routed to an Edge Server
 *  GET /health     →  Gateway health-check
 *  GET /status     →  Shows edge list & current RR index
 *
 *  Flow: Client → CDNSystem → EdgeServer → (cache / Origin)
 * ============================================================
 */

const express        = require('express');
const axios          = require('axios');
const cors           = require('cors');
const config         = require('../config');
const RoutingService = require('./routing');

// ── Initialise ───────────────────────────────────────────────
const app     = express();
const PORT    = config.cdn.port;
const router  = new RoutingService();    // uses config.edges by default

// Enable CORS so the frontend (if any) can call the gateway
app.use(cors());

// ── Logging Middleware ───────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`\n[CDNSystem] ════════════════════════════════════`);
  console.log(`[CDNSystem] 📥  Request received: ${req.method} ${req.url}`);
  next();
});

// ── Main CDN Route ───────────────────────────────────────────
//    Everything under /cdn/* is forwarded to an Edge Server.
//    Example: GET /cdn/content/hello.txt
//         →   Edge  GET /fetch/content/hello.txt
app.get('/cdn/*', async (req, res) => {
  // 1. Determine the origin-style path from the URL
  const resourcePath = req.params[0];          // e.g. "content/hello.txt"

  // 2. Use RoutingService to pick the next Edge Server
  const edge = router.getNextEdge();
  console.log(`[CDNSystem] 🔀 Routed to ${edge.id} (${edge.url})`);

  // 3. Build the URL to the Edge Server's /fetch endpoint
  const edgeURL = `${edge.url}/fetch/${resourcePath}`;
  console.log(`[CDNSystem] ➡️  Forwarding to: ${edgeURL}`);

  try {
    // 4. Proxy the request to the Edge Server
    const edgeResponse = await axios.get(edgeURL, {
      responseType: 'arraybuffer',
      validateStatus: (status) => status < 500,
    });

    // 5. Relay headers back to the client
    const contentType = edgeResponse.headers['content-type'] || 'application/octet-stream';
    const cacheStatus = edgeResponse.headers['x-cache'] || 'UNKNOWN';
    const edgeId      = edgeResponse.headers['x-edge-id'] || edge.id;

    res.set('Content-Type', contentType);
    res.set('X-Cache', cacheStatus);
    res.set('X-Edge-Id', edgeId);
    res.set('X-CDN', 'LiteCDN');

    console.log(`[CDNSystem] ✅  Response from ${edgeId} | Cache: ${cacheStatus}`);

    return res.status(edgeResponse.status).send(edgeResponse.data);

  } catch (err) {
    console.error(`[CDNSystem] 🚨 Error contacting ${edge.id}:`, err.message);
    return res.status(502).json({
      error: `Bad Gateway – could not reach ${edge.id}`,
      details: err.message,
    });
  }
});

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'UP', server: 'CDNSystem', port: PORT });
});

// ── Status / Debug ───────────────────────────────────────────
app.get('/status', (_req, res) => {
  res.json({
    server: 'CDNSystem',
    port: PORT,
    routingStrategy: 'Round-Robin',
    currentIndex: router.getCurrentIndex(),
    edges: router.getEdgeList(),
  });
});

// ── Catch-All 404 ────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found – use /cdn/<path> to fetch content' });
});

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('='.repeat(56));
  console.log(`  [CDNSystem] ✅  Gateway running on http://localhost:${PORT}`);
  console.log(`  [CDNSystem] 🔗  Edges: ${router.getEdgeList().map(e => e.id).join(', ')}`);
  console.log('='.repeat(56));
});

module.exports = app;
