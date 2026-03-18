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

/**
 * Serve static content files from the ./static/ directory
 * @returns {express.Router} Configured router for static file serving
 */
function serveStaticContent() {
  console.log('[OriginServer] 📂 Static content handler initialized');
  return express.static(path.join(__dirname, 'static'), {
    fallthrough: false,
  });
}
/**
 * Handle mock JSON API requests
 * @param {object} _req - Express request object
 * @param {object} res - Express response object
 * @returns {void}
 */
function serveMockAPI(_req, res) {
  console.log('[OriginServer] 📤 Serving mock JSON data');
  res.json({
    source: 'OriginServer',
    timestamp: new Date().toISOString(),
    data: {
      message: 'Hello from the Origin!  This is mock API data.',
      items: ['alpha', 'beta', 'gamma'],
    },
  });
}

/**
 * Handle health check requests
 * @param {object} _req - Express request object
 * @param {object} res - Express response object
 * @returns {void}
 */
function handleHealthCheck(_req, res) {
  console.log('[OriginServer] 💚 Health check requested');
  res.json({ status: 'UP', server: 'OriginServer', port: PORT });
}

/**
 * Handle static file errors (e.g., 404 for missing files)
 * @param {object} err - Error object
 * @param {object} _req - Express request object
 * @param {object} res - Express response object
 * @param {object} _next - Express next function
 * @returns {void}
 */

function handleStaticError(err, _req, res, _next) {
  if (err.status === 404 || err.statusCode === 404) {
    console.log('[OriginServer] ⚠️  File not found');
    return res.status(404).json({ error: 'File not found on Origin' });
  }
  return res.status(500).json({ error: 'Internal Origin error' });
}

/**
 * Handle catch-all 404 requests
 * @param {object} _req - Express request object
 * @param {object} res - Express response object
 * @returns {void}
 */
function handleNotFound(_req, res) {
  console.log('[OriginServer] ❌ Endpoint not found');
  res.status(404).json({ error: 'Not found on Origin' });
}

// ────────────────────────────────────────────────────────────
// ── Express Routes ───────────────────────────────────────────
// ────────────────────────────────────────────────────────────

// ── Serve Static Files ───────────────────────────────────────
//    Any file placed inside ./static/ can be requested via
//    GET /content/<filename>
app.use('/content', serveStaticContent());
app.use('/content', handleStaticError);
app.get('/mock/api', serveMockAPI);
app.get('/health', handleHealthCheck);
app.use(handleNotFound);

// ── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('='.repeat(56));
  console.log(`  [OriginServer] ✅  Running on http://localhost:${PORT}`);
  console.log('='.repeat(56));
});

module.exports = app;   // export for testing if needed
