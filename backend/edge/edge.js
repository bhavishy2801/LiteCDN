/**
 * ============================================================
 *  LiteCDN – Edge Server
 * ============================================================
 *  An Edge Server sits close to the end-user.  It maintains a
 *  **basic in-memory cache** (a plain JS Map) and tries to
 *  serve requests from cache before reaching back to the
 *  Origin Server.
 *
 *  Current features:
 *    • Cache is a simple Map (no TTL, no segmentation).
 *    • No eviction policy yet.
 *
 *  Environment Variables (set before starting):
 *    PORT     – port this edge listens on  (default 3001)
 *    EDGE_ID  – human-readable name        (default "Edge-X")
 *
 *  Endpoints
 *  ---------
 *  GET /fetch/*   →  Cache-aware proxy to the Origin Server
 *  GET /health    →  Health-check
 *  GET /cache     →  Dump current cache keys (debug helper)
 * ============================================================
 */

const express = require('express');
const axios   = require('axios');
const config  = require('../config');

// ── Configuration ────────────────────────────────────────────
const PORT    = process.env.PORT    || 3001;
const EDGE_ID = process.env.EDGE_ID || `Edge-${PORT}`;

const ORIGIN_URL = config.origin.url;   // e.g. http://localhost:4000

// ── In-Memory Cache (simple Map) ─────────────────
//    key   = request path  (e.g. "/content/hello.txt")
//    value = { body, contentType, cachedAt }
const cache = new Map();

// ── Create Express App ───────────────────────────────────────
const app = express();

// ── Logging Middleware ───────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${EDGE_ID}] 📥  ${req.method} ${req.url}`);
  next();
});

// ── Main Fetch Route ─────────────────────────────────────────
//    Anything under /fetch/* is treated as a cacheable request.
//    The part after /fetch is forwarded to the Origin Server as-is.
//    Example: GET /fetch/content/hello.txt
//         →   Origin GET /content/hello.txt
app.get('/fetch/*', async (req, res) => {
  // Strip the leading "/fetch" to get the origin path
  const originPath = req.params[0];          // e.g. "content/hello.txt"
  const cacheKey   = `/${originPath}`;       // normalised key

  // ── Step 1: Check Cache ──────────────────────────────────
  if (cache.has(cacheKey)) {
    const entry = cache.get(cacheKey);
    console.log(`[${EDGE_ID}] ⚡ CACHE HIT  → "${cacheKey}"`);
    res.set('Content-Type', entry.contentType);
    res.set('X-Cache', 'HIT');
    res.set('X-Edge-Id', EDGE_ID);
    return res.send(entry.body);
  }

  console.log(`[${EDGE_ID}] ❌ CACHE MISS → "${cacheKey}"`);

  // ── Step 2: Fetch from Origin ────────────────────────────
  try {
    const originURL = `${ORIGIN_URL}${cacheKey}`;
    console.log(`[${EDGE_ID}] 🔄 Fetching from Origin: ${originURL}`);

    const originResponse = await axios.get(originURL, {
      // Receive the raw data so we can cache it faithfully
      responseType: 'arraybuffer',
      validateStatus: (status) => status < 500,   // let 4xx through
    });

    // If Origin returns 404, forward that to the client
    if (originResponse.status === 404) {
      console.log(`[${EDGE_ID}] ⚠️  Origin returned 404 for "${cacheKey}"`);
      return res.status(404).json({ error: 'Not found on Origin', edge: EDGE_ID });
    }

    const contentType = originResponse.headers['content-type'] || 'application/octet-stream';
    const body        = originResponse.data;

    // ── Step 3: Store in Cache ─────────────────────────────
    cache.set(cacheKey, {
      body,
      contentType,
      cachedAt: new Date().toISOString(),
    });
    console.log(`[${EDGE_ID}] 💾 Stored in cache: "${cacheKey}"`);

    // ── Step 4: Return to Client ───────────────────────────
    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.set('X-Edge-Id', EDGE_ID);
    return res.send(body);

  } catch (err) {
    console.error(`[${EDGE_ID}] 🚨 Error fetching from Origin:`, err.message);
    return res.status(502).json({
      error: 'Bad Gateway – could not reach Origin Server',
      edge: EDGE_ID,
      details: err.message,
    });
  }
});

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'UP',
    server: EDGE_ID,
    port: Number(PORT),
    cacheSize: cache.size,
  });
});

// ── Debug: Dump Cache Keys ───────────────────────────────────
app.get('/cache', (_req, res) => {
  const keys = [...cache.keys()];
  res.json({ edge: EDGE_ID, cacheSize: cache.size, keys });
});

// ── Catch-All 404 ────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', edge: EDGE_ID });
});

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('='.repeat(56));
  console.log(`  [${EDGE_ID}] ✅  Running on http://localhost:${PORT}`);
  console.log(`  [${EDGE_ID}] 🔗  Origin URL: ${ORIGIN_URL}`);
  console.log('='.repeat(56));
});

module.exports = app;
