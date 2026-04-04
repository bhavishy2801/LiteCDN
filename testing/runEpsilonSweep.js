const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GATEWAY = process.env.GATEWAY_BASE || 'http://localhost:3000';
const REQUESTS = Number(process.env.SWEEP_REQUESTS || 1200);
const CONCURRENCY = Number(process.env.SWEEP_CONCURRENCY || 10);
const OUTPUT = process.env.SWEEP_OUTPUT || path.join(__dirname, 'epsilon_sweep.csv');

const EPSILON_VALUES = [0.10, 0.15, 0.20, 0.25, 0.30];
const CACHING_STRATEGIES = [
  { label: 'LRU', config: { mode: 'lru', size: 15 } },
  { label: 'Segmented (35-60-5)', config: { mode: 'segmented', size: 15 } }
];

const TOTAL_FILES = 400;
const ALPHA_PARAM = 1.1;
const weights = [];
let maxWeight = 0;

for (let i = 1; i <= TOTAL_FILES; i++) {
  const w = 1.0 / Math.pow(i, ALPHA_PARAM);
  weights.push({ name: `file_${i}.txt`, weight: w });
  maxWeight += w;
}

function getZipfFile() {
  let r = Math.random() * maxWeight;
  for (const f of weights) {
    r -= f.weight;
    if (r <= 0) return f.name;
  }
  return weights[weights.length - 1].name;
}

function generateCost() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const cost = Math.exp(z);
  return Math.max(0.1, cost);
}

async function setRouting(policy) {
  try {
    await axios.post(`${GATEWAY}/policy/routing`, policy);
  } catch (_e) {}
}

async function setCache(policy) {
  try {
    await axios.post(`${GATEWAY}/policy/cache`, policy);
  } catch (_e) {}
}

async function runSingle(cache, epsilon) {
  await setCache(cache.config);
  await setRouting({
    mode: 'alpha-beta',
    alpha: 0.5,
    beta: 0.5,
    epsilon,
    perturb: true
  });

  let latencies = [];
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let edgeLoads = {};

  let currentIndex = 0;

  const fireRequest = async () => {
    const i = currentIndex++;
    if (i >= REQUESTS) return false;

    const file = getZipfFile();
    const cost = generateCost();
    const start = Date.now();

    try {
      const res = await axios.get(`${GATEWAY}/cdn/content/${file}?cost=${cost}`);
      const duration = Date.now() - start;
      latencies.push(duration);

      if (res.data.data && res.data.data.cacheHit) hits++;
      else misses++;

      const eId = res.data.edge;
      edgeLoads[eId] = (edgeLoads[eId] || 0) + cost;
    } catch (_e) {}

    await new Promise((r) => setTimeout(r, 1));
    return true;
  };

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (currentIndex < REQUESTS) {
        await fireRequest();
      }
    })());
  }
  await Promise.all(workers);

  const avgLat = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);

  const allLoads = [];
  for (let k = 1; k <= 6; k++) {
    allLoads.push(edgeLoads[`Edge-300${k}`] || edgeLoads[`Edge-${3000 + k}`] || edgeLoads[`Edge-${k}`] || 0);
  }

  const totalResponses = allLoads.reduce((a, b) => a + b, 0);
  const mean = totalResponses / 6;
  const stddev = Math.sqrt(allLoads.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / 6);
  const hitRatio = (hits / ((hits + misses) || 1)) * 100;

  try {
    const statusRes = await axios.get(`${GATEWAY}/status`);
    for (const e of statusRes.data.edges) {
      const m = statusRes.data.metrics[e.id];
      if (m && m.cache) {
        evictions += (m.cache.evictions || 0);
      }
    }
  } catch (_e) {}

  return {
    Epsilon: epsilon.toFixed(2),
    Caching: cache.label,
    Routing: 'Alpha-Beta + Eps + Perturb',
    AvgLatency: avgLat.toFixed(2),
    LoadVariance: stddev.toFixed(2),
    HitRatio: hitRatio.toFixed(2),
    EvictionTotal: evictions
  };
}

async function run() {
  const results = [];
  await new Promise((r) => setTimeout(r, 2000));

  for (const cache of CACHING_STRATEGIES) {
    for (const epsilon of EPSILON_VALUES) {
      console.log(`Testing epsilon=${epsilon.toFixed(2)}, cache=${cache.label}`);
      const row = await runSingle(cache, epsilon);
      results.push(row);
      console.log(`-> Lat: ${row.AvgLatency}ms, Var: ${row.LoadVariance}, Hit: ${row.HitRatio}%, Evictions: ${row.EvictionTotal}`);
    }
  }

  const csvRows = ['Epsilon,Caching,Routing,AvgLatency,LoadVariance,HitRatio,EvictionTotal'];
  results.forEach((r) => {
    csvRows.push(`${r.Epsilon},${r.Caching},${r.Routing},${r.AvgLatency},${r.LoadVariance},${r.HitRatio},${r.EvictionTotal}`);
  });

  fs.writeFileSync(OUTPUT, csvRows.join('\n'));
  console.log(`Saved epsilon sweep metrics: ${OUTPUT}`);
}

run().catch((error) => {
  console.error('Epsilon sweep failed:', error.message);
  process.exit(1);
});
