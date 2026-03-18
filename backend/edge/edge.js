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
// Default to the first edge port from shared config so the
// file stays in sync with `backend/config.js` when no
// `PORT` env var is provided.
const PORT    = process.env.PORT    || config.edges[0].port;
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

/**
 * Check if a resource exists in cache and return it
 * @param {string} path - Cache key (normalized path)
 * @returns {object|null} Cache entry if found, null otherwise
 */
function serveFromCache(path) {
  if (cache.has(path)) {
    const entry = cache.get(path);
    console.log(`[${EDGE_ID}] ⚡ CACHE HIT  → "${path}"`);
    return entry;
  }
  console.log(`[${EDGE_ID}] ❌ CACHE MISS → "${path}"`);
  return null;
}

/**
 * Fetch a resource from the Origin Server
 * @param {string} path - Normalized cache key (normalized path)
 * @returns {object|null} { body, contentType, status } or null on error
 */
async function fetchFromOrigin(path) {
  try {
    const originURL = `${ORIGIN_URL}${path}`;
    console.log(`[${EDGE_ID}] 🔄 Fetching from Origin: ${originURL}`);

    const originResponse = await axios.get(originURL, {
      responseType: 'arraybuffer',
      validateStatus: (status) => status < 500,
    });

    const contentType = originResponse.headers['content-type'] || 'application/octet-stream';
    const body        = originResponse.data;

    return {
      body,
      contentType,
      status: originResponse.status,
    };
  } catch (err) {
    console.error(`[${EDGE_ID}] 🚨 Error fetching from Origin:`, err.message);
    return null;
  }
}

/**
 * Store an entry in the cache
 * @param {object} entry - Cache entry { path, body, contentType }
 * @returns {boolean} True if stored successfully
 */
function putCache(entry) {
  if (!entry || !entry.path) {
    console.warn('[${EDGE_ID}] Invalid cache entry');
    return false;
  }

  cache.set(entry.path, {
    body: entry.body,
    contentType: entry.contentType,
    cachedAt: new Date().toISOString(),
  });

  console.log(`[${EDGE_ID}] 💾 Stored in cache: "${entry.path}"`);
  return true;
}

/**
 * Handle TTL expiration for cached entries
 * (Currently a placeholder for future TTL implementation)
 * @returns {void}
 */
function expireTTL() {
  // TODO: Implement TTL-based cache expiration
  console.log(`[${EDGE_ID}] ⏰ TTL expiration check (not yet implemented)`);
}
// ── Main Fetch Route ─────────────────────────────────────────
//    Anything under /fetch/* is treated as a cacheable request.
//    The part after /fetch is forwarded to the Origin Server as-is.
//    Example: GET /fetch/content/hello.txt
//         →   Origin GET /content/hello.txt
app.get('/fetch/*', async (req, res) => {
  const startTime = Date.now();

  // Strip the leading "/fetch" to get the origin path
  const originPath = req.params[0];          // e.g. "content/hello.txt"
  const cacheKey   = `/${originPath}`;       // normalised key

  // ── Step 1: Check Cache ──────────────────────────────────
  let cacheEntry = serveFromCache(cacheKey);
  if (cacheEntry) {
    const elapsed = Date.now() - startTime;
    res.set('Content-Type', cacheEntry.contentType);
    res.set('X-Cache', 'HIT');
    res.set('X-Edge-Id', EDGE_ID);
    res.set('X-Response-Time', `${elapsed}ms`);
    console.log(`[${EDGE_ID}] ⚡ Served from cache in ${elapsed}ms`);
    return res.send(cacheEntry.body);
  }

  // ── Step 2: Fetch from Origin ────────────────────────────
  const originResponse = await fetchFromOrigin(cacheKey);
  if (!originResponse) {
    const elapsed = Date.now() - startTime;
    console.error(`[${EDGE_ID}] 🚨 Failed to fetch from Origin | ${elapsed}ms`);
    return res.status(502).json({
      error: 'Bad Gateway – could not reach Origin Server',
      edge: EDGE_ID,
    });
  }

  // If Origin returns 404, forward that to the client
  if (originResponse.status === 404) {
    const elapsed = Date.now() - startTime;
    console.log(`[${EDGE_ID}] ⚠️  Origin returned 404 for "${cacheKey}" | ${elapsed}ms`);
    return res.status(404).json({ error: 'Not found on Origin', edge: EDGE_ID });
  }

  // ── Step 3: Store in Cache ─────────────────────────────
  putCache({
    path: cacheKey,
    body: originResponse.body,
    contentType: originResponse.contentType,
  });

  // ── Step 4: Return to Client ───────────────────────────
  const elapsed = Date.now() - startTime;
  console.log(`[${EDGE_ID}] ❌ CACHE MISS → "${cacheKey}" | Served in ${elapsed}ms (fetched from Origin)`);
  res.set('Content-Type', originResponse.contentType);
  res.set('X-Cache', 'MISS');
  res.set('X-Edge-Id', EDGE_ID);
  res.set('X-Response-Time', `${elapsed}ms`);
  return res.send(originResponse.body);
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
