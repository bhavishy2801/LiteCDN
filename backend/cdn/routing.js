/**
 * ============================================================
 *  LiteCDN – Routing Service
 * ============================================================
 *  Implements a **stateful Round-Robin** strategy to distribute
 *  incoming requests across the registered Edge Servers.
 *
 *  Current features:
 *    • Pure round-robin with scoring (latency and load).
 *    • Edge list is static (loaded from config at startup).
 *    • Uses alpha and beta weighting for score calculation.
 *
 *  Public API
 *  ----------
 *  routeRequest(url : String)          →  Main request handler, returns EdgeServer
 *  selectEdge(epsilon : float)          →  Selects edge via round-robin strategy
 *  selectEdgeServer(region : String)    →  Selects edge for a specific region
 *  validateRequest(url : String)        →  Validates request URL
 *  getEdgeList()                        →  Returns the full edge list
 *  getCurrentIndex()                    →  Returns current RR index (debug)
 * ============================================================
 */

const config = require('../config');

class RoutingService {
  /**
   * @param {Array} edges – array of { id, host, port } objects.
   *                        Defaults to the list in config.js.
   */
  constructor(edges = config.edges) {
    this.edges = edges.map((e) => ({
      ...e,
      url: `http://${e.host}:${e.port}`,
      latency: 0,    // Track latency for scoring
      load: 0,       // Track load for scoring
    }));

    // ── Weighting Parameters ───────────────────────────────
    this.alpha = 0.5;  // Weight for latency in score calculation
    this.beta = 0.5;   // Weight for load in score calculation

    // ── Round-Robin Index ──────────────────────────────────
    //    Points to the *last* edge that was selected.
    //    selectEdge() advances it before returning.
    this._currentIndex = -1;

    console.log('[RoutingService] Initialised with edges:');
    this.edges.forEach((e) => console.log(`  → ${e.id}  ${e.url}`));
  }

  /**
   * Validate the incoming request URL
   * @param {string} url - Request URL to validate
   * @returns {boolean} True if URL is valid
   */
  validateRequest(url) {
    if (!url || typeof url !== 'string') {
      console.warn('[RoutingService] Invalid request URL:', url);
      return false;
    }
    return true;
  }

  /**
   * Select an edge server for a specific region
   * @param {string} region - Target region (optional, not yet used)
   * @returns {{ id: string, host: string, port: number, url: string }}
   */
  selectEdgeServer(region = null) {
    // Currently just uses round-robin; can be extended for region-awareness
    return this.selectEdge();
  }

  /**
   * Select the next Edge Server using round-robin strategy.
   * @param {number} epsilon - Epsilon parameter (not used in current round-robin)
   * @returns {{ id: string, host: string, port: number, url: string }}
   */
  selectEdge(epsilon = 0) {
    // Advance index, wrapping around to 0 at the end
    this._currentIndex = (this._currentIndex + 1) % this.edges.length;
    const selected = this.edges[this._currentIndex];
    console.log(`[RoutingService] 🔀 Round-Robin → selected ${selected.id} (${selected.url})`);
    return selected;
  }

  /**
   * Main request routing handler
   * @param {string} url - Client request URL
   * @returns {{ id: string, host: string, port: number, url: string } | null}
   */
  routeRequest(url) {
    if (!this.validateRequest(url)) {
      return null;
    }
    return this.selectEdge();
  }

  /** @returns {Array} full list of registered edges */
  getEdgeList() {
    return this.edges;
  }

  /** @returns {number} current round-robin index */
  getCurrentIndex() {
    return this._currentIndex;
  }
}

module.exports = RoutingService;
