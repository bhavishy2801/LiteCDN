/**
 * =============================================================
 *  TestCache.js
 * =============================================================
 *  Deterministic per-edge cache behavior test.
 *  - Uses /status to compute which request maps to which edge
 *  - Sends edgesCount * REQUESTS_PER_EDGE sequential requests so
 *    each edge deterministically receives REQUESTS_PER_EDGE requests
 *  - Verifies that the first access per edge is MISS and subsequent accesses are HIT
 *
 *  Usage:
 *    node testing/testCache.js
 *
 *  Environment:
 *    GATEWAY_BASE (optional) - base URL of gateway, default http://localhost:3000
 * =============================================================
 */

const axios = require('axios');

const GATEWAY_BASE = process.env.GATEWAY_BASE || 'http://localhost:3000';
const STATUS_URL = `${GATEWAY_BASE}/status`;
const CDN_CONTENT_BASE = `${GATEWAY_BASE}/cdn/content`;

const REQUESTS_PER_EDGE = 4;
const TEST_FILE = 'hello.txt';
const REQUEST_DELAY_MS = 100;

/**
 * Sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch /status from gateway.
 * @returns {Promise<Object>}
 */
async function getStatus() {
  const res = await axios.get(STATUS_URL, { timeout: 3000, validateStatus: () => true });
  if (res.status !== 200) throw new Error('/status not available');
  return res.data;
}

/**
 * Main test runner.
 */
async function runCacheTest() {
  try {
    console.log('=== TestCache: deterministic per-edge cache test ===');

    const status = await getStatus();
    const edges = status.edges || [];
    if (!Array.isArray(edges) || edges.length === 0) {
      console.error('No edges reported by /status');
      process.exit(1);
    }

    const n = edges.length;
    const currentIndex = Number.isFinite(status.currentIndex) ? status.currentIndex : -1;
    const totalRequests = n * REQUESTS_PER_EDGE;

    console.log(`Detected ${n} edges. Will send ${totalRequests} requests (${REQUESTS_PER_EDGE} per edge)`);

    const records = [];

    for (let i = 1; i <= totalRequests; i++) {
      try {
        const res = await axios.get(`${CDN_CONTENT_BASE}/${TEST_FILE}`, { timeout: 5000, validateStatus: () => true });
        const edgeId = res.headers['x-edge-id'] || 'UNKNOWN';
        const cacheStatus = (res.headers['x-cache'] || 'UNKNOWN').toUpperCase();
        records.push({ idx: i, edgeId, cacheStatus });
        console.log(`[${i}] → ${edgeId} | ${cacheStatus}`);
      } catch (err) {
        records.push({ idx: i, edgeId: 'ERR', cacheStatus: 'ERR' });
        console.log(`[${i}] → ERROR: ${err.message}`);
      }
      if (i < totalRequests) await sleep(REQUEST_DELAY_MS);
    }

    // Aggregate results by edge in chronological order
    const statsMap = {};
    for (const r of records) {
      if (!statsMap[r.edgeId]) statsMap[r.edgeId] = { total: 0, hits: 0, misses: 0, seq: [] };
      statsMap[r.edgeId].total++;
      if (r.cacheStatus === 'HIT') statsMap[r.edgeId].hits++;
      if (r.cacheStatus === 'MISS') statsMap[r.edgeId].misses++;
      statsMap[r.edgeId].seq.push(r.cacheStatus);
    }

    console.log('\nPer-edge cache stats:');
    // Print edges in server order
    for (const edge of edges) {
      const id = edge.id;
      const s = statsMap[id] || { total: 0, hits: 0, misses: 0, seq: [] };
      const hitRate = s.total ? ((s.hits / s.total) * 100).toFixed(1) : '0.0';
      console.log(` ${id}: total=${s.total}, hits=${s.hits}, misses=${s.misses}, hitRate=${hitRate}%`);
      console.log(`   seq: ${s.seq.join(' → ')}`);
    }

    console.log('\nExpected: first access on each edge should be MISS, subsequent accesses HIT (subject to TTL/eviction).');
    process.exit(0);
  } catch (err) {
    console.error('TestCache failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) runCacheTest();