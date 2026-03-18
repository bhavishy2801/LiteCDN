/**
 * =============================================================
 *  TestLoad.js
 * =============================================================
 *  Sends a number of requests and reports per-edge request counts.
 *  - Queries /status to determine available edges
 *  - Sends NUM_REQUESTS requests with a controlled concurrency
 *  - Prints distribution and a simple imbalance metric
 *
 *  Usage:
 *    node testing/testLoad.js
 *
 *  Environment:
 *    GATEWAY_BASE (optional) - base URL of gateway, default http://localhost:3000
 * =============================================================
 */

const axios = require('axios');

const GATEWAY_BASE = process.env.GATEWAY_BASE || 'http://localhost:3000';
const STATUS_URL = `${GATEWAY_BASE}/status`;
const CDN_CONTENT_BASE = `${GATEWAY_BASE}/cdn/content`;

const NUM_REQUESTS = 300;
const CONCURRENCY = 12;

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
 * Promise pool runner to limit concurrency.
 * @param {Array<Function>} tasks - functions returning Promises
 * @param {number} concurrency
 * @returns {Promise<Array>}
 */
async function runPromisePool(tasks, concurrency) {
  const results = [];
  let i = 0;
  const workers = new Array(concurrency).fill(null).map(async () => {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        results[idx] = { error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Main test runner.
 */
async function runLoadTest() {
  try {
    console.log('=== TestLoad: load distribution ===');

    const status = await getStatus();
    const edges = status.edges || [];
    if (!Array.isArray(edges) || edges.length === 0) {
      console.error('No edges reported by /status');
      process.exit(1);
    }
    console.log(`Found ${edges.length} edges. Sending ${NUM_REQUESTS} requests (concurrency ${CONCURRENCY})`);

    const tasks = [];
    for (let i = 0; i < NUM_REQUESTS; i++) {
      tasks.push(async () => {
        try {
          const res = await axios.get(`${CDN_CONTENT_BASE}/hello.txt`, { timeout: 5000, validateStatus: () => true });
          return { status: 'ok', edgeId: res.headers['x-edge-id'] || 'UNKNOWN' };
        } catch (err) {
          return { status: 'error', error: err.message };
        }
      });
    }

    const results = await runPromisePool(tasks, CONCURRENCY);

    const distribution = {};
    let success = 0;
    let failure = 0;
    for (const r of results) {
      if (!r) continue;
      if (r.status === 'ok') {
        distribution[r.edgeId] = (distribution[r.edgeId] || 0) + 1;
        success++;
      } else {
        failure++;
      }
    }

    // Fill zeros for edges not seen
    for (const e of edges) {
      if (!distribution[e.id]) distribution[e.id] = 0;
    }

    const edgeIds = Object.keys(distribution).sort();
    const counts = edgeIds.map((id) => distribution[id]);
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const avg = total / edgeIds.length;
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const imbalancePercent = (((max - min) / (avg || 1)) * 100).toFixed(2);

    console.log('\nRequests per edge:');
    edgeIds.forEach((id) => {
      const c = distribution[id];
      const pct = ((c / total) * 100).toFixed(1);
      console.log(`  ${id}: ${c} (${pct}%)`);
    });

    console.log('\nSummary:');
    console.log(`  Successful requests: ${success}`);
    console.log(`  Failed requests: ${failure}`);
    console.log(`  Avg per edge: ${avg.toFixed(2)}`);
    console.log(`  Min: ${min}, Max: ${max}`);
    console.log(`  Imbalance: ${imbalancePercent}%`);
    console.log(imbalancePercent < 15 ? '✅ Reasonable balance' : '⚠️ Consider investigating imbalance');

    process.exit(0);
  } catch (err) {
    console.error('TestLoad failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) runLoadTest();