const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_METRICS_CANDIDATES = [
  path.join(ROOT, 'metrics.csv'),
  path.join(ROOT, 'metrics_uniform.csv')
];
const DEFAULT_TRACE = path.join(__dirname, 'alpha_beta_trace.csv');
const DEFAULT_EPSILON_SWEEP = path.join(__dirname, 'epsilon_sweep.csv');
const OUTPUT_HTML = path.join(__dirname, 'graphs_report.html');

function readExistingFile(candidates) {
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getMetricValue(row, aliases) {
  for (const key of aliases) {
    if (row[key] !== undefined && row[key] !== '') {
      return toNumber(row[key], 0);
    }
  }
  return 0;
}

function normalizeModelLabel(row) {
  if (row.Routing) return row.Routing;
  if (row.routing) return row.routing;
  return 'Unknown';
}

function normalizeCacheLabel(row) {
  const raw = row.Caching || row.caching || 'Unknown';
  const lower = String(raw).toLowerCase();
  if (lower.includes('lru')) return 'LRU';
  if (lower.includes('segment')) return 'Segmented (35-60-5)';
  return 'Unknown';
}

function buildMetricSeries(rows) {
  const caches = ['LRU', 'Segmented (35-60-5)'];
  const metrics = [
    { key: 'latency', title: 'Average Latency (ms)', aliases: ['AvgLatency', 'avgLatency'] },
    { key: 'variance', title: 'Load Variance', aliases: ['LoadVariance', 'loadVariance'] },
    { key: 'hitRatio', title: 'Hit Ratio (%)', aliases: ['HitRatio', 'HitRatio_PCT', 'hitRatio'] },
    { key: 'evictions', title: 'Evictions', aliases: ['EvictionTotal', 'evictions'] }
  ];

  const byCache = new Map();
  rows.forEach((row) => {
    const cache = normalizeCacheLabel(row);
    const model = normalizeModelLabel(row);
    if (!byCache.has(cache)) byCache.set(cache, []);
    byCache.get(cache).push({ row, model });
  });

  // Keep consistent order for the 4 model variants if present.
  const preferredOrder = [
    'Round Robin',
    'Normal Alpha-Beta',
    'Alpha-Beta + Epsilon',
    'Alpha-Beta + Eps + Perturb',
    'round-robin',
    'alpha-beta',
    'alpha-beta+eps',
    'alpha-beta+eps+perturb'
  ];

  function modelRank(label) {
    const idx = preferredOrder.indexOf(label);
    return idx >= 0 ? idx : 999;
  }

  const charts = [];
  for (const metric of metrics) {
    for (const cache of caches) {
      const list = (byCache.get(cache) || []).slice().sort((a, b) => {
        const ra = modelRank(a.model);
        const rb = modelRank(b.model);
        if (ra !== rb) return ra - rb;
        return a.model.localeCompare(b.model);
      });

      charts.push({
        id: `chart_${metric.key}_${cache.replace(/[^a-zA-Z0-9]/g, '_')}`,
        metricTitle: metric.title,
        cacheTitle: cache,
        x: list.map((item) => item.model),
        y: list.map((item) => getMetricValue(item.row, metric.aliases))
      });
    }
  }

  return charts;
}

function parseTrace(tracePath) {
  if (!tracePath || !fs.existsSync(tracePath)) return null;
  const rows = parseCsv(tracePath);
  if (!rows.length) return null;

  return {
    x: rows.map((r) => toNumber(r.step, 0)),
    alpha: rows.map((r) => toNumber(r.alphaAdaptive, 0)),
    beta: rows.map((r) => toNumber(r.betaAdaptive, 0)),
    alphaTarget: rows.map((r) => toNumber(r.alphaTarget, 0))
  };
}

function parseEpsilonSweep(sweepPath) {
  if (!sweepPath || !fs.existsSync(sweepPath)) return null;
  const rows = parseCsv(sweepPath);
  if (!rows.length) return null;

  const caches = ['LRU', 'Segmented (35-60-5)'];
  const metrics = [
    { key: 'AvgLatency', title: 'Avg Latency (ms)' },
    { key: 'LoadVariance', title: 'Load Variance' },
    { key: 'HitRatio', title: 'Hit Ratio (%)' },
    { key: 'EvictionTotal', title: 'Evictions' }
  ];

  const charts = metrics.map((metric, idx) => {
    const id = `epsilonSweepChart${idx + 1}`;
    const traces = caches.map((cache) => {
      const points = rows
        .filter((r) => normalizeCacheLabel(r) === cache)
        .map((r) => ({
          x: toNumber(r.Epsilon, 0),
          y: toNumber(r[metric.key], 0)
        }))
        .sort((a, b) => a.x - b.x);

      return {
        name: cache,
        x: points.map((p) => p.x),
        y: points.map((p) => p.y)
      };
    });

    return {
      id,
      title: metric.title,
      traces
    };
  });

  return charts;
}

function htmlTemplate({ charts, trace, epsilonSweepCharts, metricsPath, tracePath, sweepPath }) {
  const chartBlocks = charts.map((c) => `
      <section class="card">
        <h3>${c.metricTitle} | ${c.cacheTitle}</h3>
        <div id="${c.id}" class="chart"></div>
      </section>
  `).join('');

  const epsilonSweepBlocks = (epsilonSweepCharts || []).map((c) => `
      <section class="card">
        <h3>${c.title} | Epsilon Sweep</h3>
        <div id="${c.id}" class="chart"></div>
      </section>
  `).join('');

  const chartsJson = JSON.stringify(charts);
  const traceJson = JSON.stringify(trace);
  const epsilonSweepJson = JSON.stringify(epsilonSweepCharts || []);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LiteCDN Testing Graph Report</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f1116;
      color: #e9edf5;
    }
    .wrap {
      max-width: 1500px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.5rem;
    }
    .meta {
      color: #b8c0d4;
      margin-bottom: 18px;
      font-size: 0.9rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .card {
      background: #161b26;
      border: 1px solid #2a3243;
      border-radius: 12px;
      padding: 12px;
    }
    .card h3 {
      margin: 0 0 8px;
      font-size: 0.95rem;
      color: #ffd166;
    }
    .chart {
      width: 100%;
      height: 330px;
    }
    .full {
      margin-top: 16px;
      background: #161b26;
      border: 1px solid #2a3243;
      border-radius: 12px;
      padding: 12px;
    }
    .full h2 {
      margin: 0 0 10px;
      font-size: 1rem;
      color: #7bdff2;
    }
    #alphaBetaChart {
      width: 100%;
      height: 420px;
    }
    @media (max-width: 980px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>LiteCDN Experimental Graphs</h1>
    <div class="meta">
      Source metrics: ${metricsPath || 'Not found'}<br/>
      Alpha/Beta trace: ${tracePath || 'Not found'}<br/>
      Epsilon sweep: ${sweepPath || 'Not found'}
    </div>

    <div class="grid">
      ${chartBlocks}
    </div>

    <section class="full">
      <h2>Alpha and Beta Variation: Alpha + Beta + Epsilon + Perturbation</h2>
      <div id="alphaBetaChart"></div>
    </section>

    <section class="full">
      <h2>Epsilon Variation: Alpha-Beta + Epsilon + Perturbation</h2>
      <div class="grid">
        ${epsilonSweepBlocks || '<div style="padding:12px;color:#c9d1e5">No epsilon sweep data found. Run: npm run test:epsilon-sweep</div>'}
      </div>
    </section>
  </div>

  <script>
    const charts = ${chartsJson};
    const trace = ${traceJson};
    const epsilonSweepCharts = ${epsilonSweepJson};

    charts.forEach((c) => {
      Plotly.newPlot(c.id, [
        {
          type: 'bar',
          x: c.x,
          y: c.y,
          marker: { color: '#f4a261' },
          hovertemplate: '%{x}<br>%{y}<extra></extra>'
        }
      ], {
        margin: { t: 10, r: 10, b: 90, l: 55 },
        paper_bgcolor: '#161b26',
        plot_bgcolor: '#111622',
        font: { color: '#e9edf5' },
        xaxis: { tickangle: -20 },
        yaxis: { gridcolor: '#2b3244' }
      }, { responsive: true, displaylogo: false });
    });

    if (trace && trace.x.length > 0) {
      Plotly.newPlot('alphaBetaChart', [
        {
          type: 'scatter',
          mode: 'lines',
          name: 'alphaAdaptive',
          x: trace.x,
          y: trace.alpha,
          line: { color: '#00d68f', width: 2 }
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: 'betaAdaptive',
          x: trace.x,
          y: trace.beta,
          line: { color: '#ff6b6b', width: 2 }
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: 'alphaTarget',
          x: trace.x,
          y: trace.alphaTarget,
          line: { color: '#7bdff2', width: 1.5, dash: 'dot' }
        }
      ], {
        margin: { t: 10, r: 20, b: 45, l: 55 },
        paper_bgcolor: '#161b26',
        plot_bgcolor: '#111622',
        font: { color: '#e9edf5' },
        xaxis: { title: 'Request Step', gridcolor: '#2b3244' },
        yaxis: { title: 'Weight Value', range: [0, 1], gridcolor: '#2b3244' },
        legend: { orientation: 'h' }
      }, { responsive: true, displaylogo: false });
    } else {
      const el = document.getElementById('alphaBetaChart');
      el.innerHTML = '<div style="padding:16px;color:#c9d1e5">No alpha/beta trace data found. Run: npm run test:alpha-beta-trace</div>';
    }

    epsilonSweepCharts.forEach((c) => {
      const plotlyTraces = c.traces.map((t) => ({
        type: 'scatter',
        mode: 'lines+markers',
        name: t.name,
        x: t.x,
        y: t.y
      }));

      Plotly.newPlot(c.id, plotlyTraces, {
        margin: { t: 10, r: 10, b: 45, l: 55 },
        paper_bgcolor: '#161b26',
        plot_bgcolor: '#111622',
        font: { color: '#e9edf5' },
        xaxis: { title: 'epsilon', tickformat: '.2f', gridcolor: '#2b3244' },
        yaxis: { gridcolor: '#2b3244' },
        legend: { orientation: 'h' }
      }, { responsive: true, displaylogo: false });
    });
  </script>
</body>
</html>`;
}

function main() {
  const inputArg = process.argv[2];
  const traceArg = process.argv[3];
  const sweepArg = process.argv[4];

  const metricsPath = inputArg
    ? path.resolve(process.cwd(), inputArg)
    : readExistingFile(DEFAULT_METRICS_CANDIDATES);

  if (!metricsPath || !fs.existsSync(metricsPath)) {
    console.error('No metrics CSV found. Provide a path or run metrics first.');
    console.error('Example: node testing/runMetrics.js');
    process.exit(1);
  }

  const rows = parseCsv(metricsPath);
  if (!rows.length) {
    console.error('Metrics CSV is empty:', metricsPath);
    process.exit(1);
  }

  const charts = buildMetricSeries(rows);

  const tracePath = traceArg
    ? path.resolve(process.cwd(), traceArg)
    : (fs.existsSync(DEFAULT_TRACE) ? DEFAULT_TRACE : null);

  const trace = parseTrace(tracePath);

  const sweepPath = sweepArg
    ? path.resolve(process.cwd(), sweepArg)
    : (fs.existsSync(DEFAULT_EPSILON_SWEEP) ? DEFAULT_EPSILON_SWEEP : null);

  const epsilonSweepCharts = parseEpsilonSweep(sweepPath);

  const html = htmlTemplate({
    charts,
    trace,
    epsilonSweepCharts,
    metricsPath,
    tracePath,
    sweepPath
  });
  fs.writeFileSync(OUTPUT_HTML, html);

  console.log('Graph report created:', OUTPUT_HTML);
  console.log('Open in browser to render charts.');
}

main();
