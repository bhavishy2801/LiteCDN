/**
 * ============================================================
 *  LiteCDN – Routing Service
 * ============================================================
 *  Implements a **stateful Round-Robin** strategy to distribute
 *  incoming requests across the registered Edge Servers.
 *
 *  Current features:
 *    • Pure round-robin (no latency scoring, no α-β, no ε-greedy).
 *    • Edge list is static (loaded from config at startup).
 *
 *  Public API
 *  ----------
 *  getNextEdge()         →  Returns the next EdgeServer object
 *  getEdgeList()         →  Returns the full edge list
 *  getCurrentIndex()     →  Returns current RR index (debug)
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
    }));

    // ── Round-Robin Index ──────────────────────────────────
    //    Points to the *last* edge that was selected.
    //    getNextEdge() advances it before returning.
    this._currentIndex = -1;

    console.log('[RoutingService] Initialised with edges:');
    this.edges.forEach((e) => console.log(`  → ${e.id}  ${e.url}`));
  }

  /**
   * Select the next Edge Server in round-robin order.
   * @returns {{ id: string, host: string, port: number, url: string }}
   */
  getNextEdge() {
    // Advance index, wrapping around to 0 at the end
    this._currentIndex = (this._currentIndex + 1) % this.edges.length;
    const selected = this.edges[this._currentIndex];
    console.log(`[RoutingService] 🔀 Round-Robin → selected ${selected.id} (${selected.url})`);
    return selected;
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
