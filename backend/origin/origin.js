/**
 * ============================================================
 *  LiteCDN – Origin Server
 * ============================================================
 *  The Origin Server is the **source of truth** for all
 *  content.  In a production CDN this would be the customer's
 *  web-server.  Here it simply serves static files from the
 *  `static/` directory and a handful of JSON mock endpoints.
 *
 *  Endpoints
 *  ---------
 *  GET /content/:filename   →  Serves a file from ./static/
 *  GET /mock/api            →  Returns a small JSON payload
 *  GET /health              →  Health-check endpoint
 * ============================================================
 */

const express = require('express');
const path    = require('path');
const config  = require('../config');

// ── Create Express App ───────────────────────────────────────
const app  = express();
const PORT = config.origin.port;

// ── Logging Middleware ───────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[OriginServer] 📥  ${req.method} ${req.url}`);
  next();
});

// ── Serve Static Files ───────────────────────────────────────
//    Any file placed inside ./static/ can be requested via
//    GET /content/<filename>
app.use(
  '/content',
  express.static(path.join(__dirname, 'static'), {
    // Send proper 404 when the file doesn't exist
    fallthrough: false,
  })
);

// Friendly error for missing static files
app.use('/content', (err, _req, res, _next) => {
  if (err.status === 404 || err.statusCode === 404) {
    console.log('[OriginServer] ⚠️  File not found');
    return res.status(404).json({ error: 'File not found on Origin' });
  }
  return res.status(500).json({ error: 'Internal Origin error' });
});

// ── Mock JSON API Endpoint ───────────────────────────────────
app.get('/mock/api', (_req, res) => {
  console.log('[OriginServer] 📤  Serving mock JSON data');
  res.json({
    source: 'OriginServer',
    timestamp: new Date().toISOString(),
    data: {
      message: 'Hello from the Origin!  This is mock API data.',
      items: ['alpha', 'beta', 'gamma'],
    },
  });
});

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'UP', server: 'OriginServer', port: PORT });
});

// ── Catch-All 404 ────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found on Origin' });
});

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('='.repeat(56));
  console.log(`  [OriginServer] ✅  Running on http://localhost:${PORT}`);
  console.log('='.repeat(56));
});

module.exports = app;   // export for testing if needed
