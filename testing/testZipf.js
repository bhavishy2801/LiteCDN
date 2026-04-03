/**
 * =============================================================
 *  TestZipf.js
 * =============================================================
 *  Simulates a Zipf-like (skewed) workload and reports per-file
 *  hit/miss statistics and edge distribution.
 *
 *  Usage:
 *    node testing/testZipf.js
 *
 *  Environment:
 *    GATEWAY_BASE (optional) - base URL of gateway, default http://localhost:3000
 * =============================================================
 */

const axios = require('axios');

const GATEWAY_BASE = process.env.GATEWAY_BASE || 'http://localhost:3000';
const STATUS_URL = `${GATEWAY_BASE}/status`;
const CDN_CONTENT_BASE = `${GATEWAY_BASE}/cdn/content`;

const NUM_REQUESTS = 100;
const REQUEST_DELAY_MS = 50;

/**
 * Files and weights (Zipf-like approximation)
 * Higher weight = more popular.
 */
const FILES = [
  { name: 'hello.txt', weight: 50 },
  { name: 'sample.txt', weight: 30 },
  { name: 'data.json', weight: 20 },
];

/**
 * Sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Select a file by weight.
 * @returns {string}
 */
function selectFileByWeight() {
  const total = FILES.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FILES) {
    r -= f.weight;
    if (r <= 0) return f.name;
  }
  return FILES[FILES.length - 1].name;
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
 * Main runner for Zipf-like workload.
 */
async function runZipfTest() {
  try {
    console.log('=== TestZipf: Zipf-like workload ===');
    const status = await getStatus();
    console.log(`Found ${status.edges?.length || 0} edges; sending ${NUM_REQUESTS} requests.`);

    const results = [];

    for (let i = 1; i <= NUM_REQUESTS; i++) {
      const file = selectFileByWeight();
      try {
        const res = await axios.get(`${CDN_CONTENT_BASE}/${file}`, { timeout: 5000, validateStatus: () => true });
        const edgeId = res.headers['x-edge-id'] || 'UNKNOWN';
        const cacheStatus = (res.headers['x-cache'] || 'UNKNOWN').toUpperCase();
        results.push({ file, edgeId, cacheStatus });
        const indicator = cacheStatus === 'HIT' ? 'HIT' : 'MISS';
        console.log(`[${i}] ${file} → ${indicator} @ ${edgeId}`);
      } catch (err) {
        console.log(`[${i}] ${file} → ERROR: ${err.message}`);
        results.push({ file, edgeId: 'ERR', cacheStatus: 'ERR' });
      }
      if (i < NUM_REQUESTS) await sleep(REQUEST_DELAY_MS);
    }

    const fileStats = {};
    for (const f of FILES) fileStats[f.name] = { total: 0, hits: 0, misses: 0 };
    const edgeCounts = {};

    for (const r of results) {
      if (!fileStats[r.file]) fileStats[r.file] = { total: 0, hits: 0, misses: 0 };
      fileStats[r.file].total++;
      if (r.cacheStatus === 'HIT') fileStats[r.file].hits++;
      if (r.cacheStatus === 'MISS') fileStats[r.file].misses++;
      edgeCounts[r.edgeId] = (edgeCounts[r.edgeId] || 0) + 1;
    }

    console.log('\nFile stats:');
    Object.entries(fileStats).forEach(([name, s]) => {
      const hitRate = s.total ? ((s.hits / s.total) * 100).toFixed(1) : '0.0';
      console.log(` ${name}: total=${s.total}, hits=${s.hits}, misses=${s.misses}, hitRate=${hitRate}%`);
    });

    console.log('\nEdge distribution:');
    Object.entries(edgeCounts).forEach(([e, c]) => console.log(` ${e}: ${c}`));

    process.exit(0);
  } catch (err) {
    console.error('TestZipf failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) runZipfTest();