/**
 * ============================================================
 *  LiteCDN – Shared Configuration
 * ============================================================
 *  Central place for all port numbers and server URLs so every
 *  module stays in sync.  Modify ports here if you have
 *  conflicts on your machine.
 * ============================================================
 */

const config = {
  // ── Origin Server ──────────────────────────────────────────
  origin: {
    host: 'localhost',
    port: 4000,
    get url() {
      return `http://${this.host}:${this.port}`;
    },
  },

  // ── Edge Servers ───────────────────────────────────────────
  //    Each edge runs on its own port.  The CDN gateway uses
  //    this list for round-robin routing.
  edges: [
    { id: 'Edge-1', host: 'localhost', port: 3001 },
    { id: 'Edge-2', host: 'localhost', port: 3002 },
    { id: 'Edge-3', host: 'localhost', port: 3003 },
  ],

  // ── CDN Gateway / Router ───────────────────────────────────
  cdn: {
    host: 'localhost',
    port: 3000,
    get url() {
      return `http://${this.host}:${this.port}`;
    },
  },
};

module.exports = config;
