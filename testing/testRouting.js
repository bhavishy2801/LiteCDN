/**
 * =============================================================
 *  TestRouting.js
 * =============================================================
 *  Verifies deterministic round-robin routing.
 *  - Loads runtime edge list and currentIndex from /status
 *  - Sends NUM_REQUESTS sequential requests to the gateway
 *  - Compares observed edges to the expected round-robin sequence
 *
 *  Usage:
 *    node testing/testRouting.js
 *
 *  Environment:
 *    GATEWAY_BASE (optional) - base URL of gateway, default http://localhost:3000
 * =============================================================
 */

const axios = require('axios');

const GATEWAY_BASE = process.env.GATEWAY_BASE || 'http://localhost:3000';
const STATUS_URL = `${GATEWAY_BASE}/status`;
const CDN_CONTENT_BASE = `${GATEWAY_BASE}/cdn/content`;

const NUM_REQUESTS = 12;
const REQUEST_DELAY_MS = 100;

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch /status from gateway and return parsed object.
 * @returns {Promise<Object>}
 */
async function getStatus() {
  const res = await axios.get(STATUS_URL, { timeout: 3000, validateStatus: () => true });
  if (res.status !== 200) throw new Error('/status not available');
  return res.data;
}

/**
 * Compute expected round-robin sequence starting from currentIndex.
 * @param {Array} edges
 * @param {number} currentIndex
 * @param {number} count
 * @returns {Array<string>}
 */
function computeExpectedSequence(edges, currentIndex, count) {
  const n = edges.length;
  const expected = [];
  for (let i = 1; i <= count; i++) {
    const idx = (currentIndex + i) % n;
    expected.push(edges[idx].id);
  }
  return expected;
}

/**
 * Main test runner.
 */
async function runRoutingTest() {
  try {
    console.log('=== TestRouting: round-robin verification ===');

    const status = await getStatus();
    const edges = status.edges || [];
    if (!Array.isArray(edges) || edges.length === 0) {
      console.error('No edges reported by /status. Start the system and retry.');
      process.exit(1);
    }

    const currentIndex = Number.isFinite(status.currentIndex) ? status.currentIndex : -1;
    console.log(`Found ${edges.length} edges. currentIndex=${currentIndex}`);

    const observed = [];

    for (let i = 1; i <= NUM_REQUESTS; i++) {
      try {
        const url = `${CDN_CONTENT_BASE}/hello.txt`;
        const res = await axios.get(url, { timeout: 5000, validateStatus: () => true });
        const edgeId = res.headers['x-edge-id'] || 'UNKNOWN';
        observed.push(edgeId);
        console.log(`[${i}] -> ${edgeId}`);
      } catch (err) {
        observed.push('ERROR');
        console.log(`[${i}] -> ERROR: ${err.message}`);
      }
      if (i < NUM_REQUESTS) await sleep(REQUEST_DELAY_MS);
    }

    const expected = computeExpectedSequence(edges, currentIndex, NUM_REQUESTS);

    console.log('\nExpected sequence:');
    console.log(expected.join(' → '));
    console.log('\nObserved sequence:');
    console.log(observed.join(' → '));

    const mismatches = [];
    for (let i = 0; i < NUM_REQUESTS; i++) {
      if (observed[i] !== expected[i]) mismatches.push(i + 1);
    }

    if (mismatches.length === 0) {
      console.log('\n✅ Round-robin verified (exact match).');
      process.exit(0);
    } else {
      console.warn('\n⚠️ Round-robin mismatch at request indices:', mismatches);
      console.warn('Note: Run tests in isolation (no other clients hitting the gateway).');
      process.exit(2);
    }
  } catch (err) {
    console.error('TestRouting failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) runRoutingTest();