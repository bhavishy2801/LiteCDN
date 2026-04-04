const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GATEWAY = process.env.GATEWAY_BASE || 'http://localhost:3000';
const REQUESTS = Number(process.env.TRACE_REQUESTS || 300);
const OUTPUT = process.env.TRACE_OUTPUT || path.join(__dirname, 'alpha_beta_trace.csv');
const CACHE_MODE = process.env.TRACE_CACHE_MODE || 'segmented';
const CACHE_SIZE = Number(process.env.TRACE_CACHE_SIZE || 15);
const FILE_POOL = Number(process.env.TRACE_FILE_POOL || 200);

function pickFile() {
  const i = 1 + Math.floor(Math.random() * FILE_POOL);
  return `file_${i}.txt`;
}

async function configurePolicies() {
  await axios.post(`${GATEWAY}/policy/cache`, { mode: CACHE_MODE, size: CACHE_SIZE });
  await axios.post(`${GATEWAY}/policy/routing`, {
    mode: 'alpha-beta',
    alpha: 0.5,
    beta: 0.5,
    epsilon: 0.25,
    perturb: true
  });
}

function asNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function run() {
  const rows = [
    'step,filename,alphaAdaptive,betaAdaptive,alphaTarget,latencyVariance,loadVariance,varianceSpread,perturbation,perturbWindow'
  ];

  console.log(`Preparing alpha/beta trace against ${GATEWAY}`);
  await configurePolicies();

  for (let step = 1; step <= REQUESTS; step++) {
    const filename = pickFile();
    let requestOk = true;

    try {
      await axios.get(`${GATEWAY}/cdn/content/${filename}`);
    } catch (error) {
      requestOk = false;
      console.error(`Step ${step} failed: ${error.message}`);
    }

    try {
      const statusRes = await axios.get(`${GATEWAY}/status`);
      const d = (statusRes.data && statusRes.data.routing && statusRes.data.routing.diagnostics) || {};

      rows.push([
        step,
        filename,
        asNum(d.alphaAdaptive, 0),
        asNum(d.betaAdaptive, 0),
        asNum(d.alphaTarget, 0),
        asNum(d.latencyVariance, 0),
        asNum(d.loadVariance, 0),
        asNum(d.varianceSpread, 0),
        asNum(d.perturbation, 0),
        asNum(d.perturbWindow, 0)
      ].join(','));
    } catch (statusError) {
      rows.push([
        step,
        filename,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ].join(','));
      console.error(`Step ${step} status read failed: ${statusError.message}`);
    }

    if (step % 50 === 0) {
      console.log(`Captured ${step}/${REQUESTS} (${requestOk ? 'ok' : 'request-failed'})`);
    }
  }

  fs.writeFileSync(OUTPUT, rows.join('\n'));
  console.log(`Saved alpha/beta trace: ${OUTPUT}`);
}

run().catch((error) => {
  console.error('Trace run failed:', error.message);
  process.exit(1);
});
