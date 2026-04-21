const state = {
  config: null,
  topology: null,
  metrics: null,
  lastObjectUrl: null,
  latestUploadedName: '',
  lastFetchedBlob: null,
  lastFetchedFilename: ''
};

const ui = {
  gatewayTarget: document.getElementById('gatewayTarget'),
  vercelTarget: document.getElementById('vercelTarget'),
  refreshBtn: document.getElementById('refreshBtn'),
  statusSummary: document.getElementById('statusSummary'),
  uploadForm: document.getElementById('uploadForm'),
  uploadFile: document.getElementById('uploadFile'),
  originFiles: document.getElementById('originFiles'),
  requestFile: document.getElementById('requestFile'),
  pickLatestBtn: document.getElementById('pickLatestBtn'),
  requestBtn: document.getElementById('requestBtn'),
  downloadFetchedBtn: document.getElementById('downloadFetchedBtn'),
  requestMeta: document.getElementById('requestMeta'),
  requestPreview: document.getElementById('requestPreview'),
  requestResult: document.getElementById('requestResult'),
  flowList: document.getElementById('flowList'),
  strategyBars: document.getElementById('strategyBars'),
  cacheRatio: document.getElementById('cacheRatio'),
  edgeControls: document.getElementById('edgeControls'),
  originToggleBtn: document.getElementById('originToggleBtn'),
  enableAllEdgesBtn: document.getElementById('enableAllEdgesBtn'),
  disableAllEdgesBtn: document.getElementById('disableAllEdgesBtn'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  setTimeout(() => ui.toast.classList.remove('show'), 1800);
}

async function api(path, options = {}) {
  const response = await fetch(`${state.config.gatewayUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof body === 'string' ? body : (body.error || 'request failed'));
  }
  return body;
}

function metricCard(title, value) {
  return `<div class="metric"><small>${title}</small><strong>${value}</strong></div>`;
}

function safeHtml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function extensionOf(filename = '') {
  const clean = String(filename).split('?')[0].split('#')[0].trim();
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}

const HANDLED_EXTENSIONS = [
  'pdf', 'docx', 'txt', 'rtf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'tif', 'tiff', 'xlsx', 'csv', 'xml', 'json',
  'mp4', 'mov', 'avi', 'mp3', 'wav', 'zip', 'html', 'pptx', 'ods', 'odt', 'bmp', 'webp', 'ico', 'psd', 'ai',
  'eps', 'raw', 'heic', 'flac', 'aac', 'm4a', 'wma', 'ogg', 'mkv', 'wmv', 'flv', 'rar', '7z', 'tar', 'iso',
  'exe', 'dmg', 'apk', 'css', 'js', 'php', 'py'
];

function classifyFile(contentType = '', filename = '') {
  const type = String(contentType).toLowerCase();
  const ext = extensionOf(filename);

  if (type.startsWith('image/')) {
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp', 'ico'].includes(ext) || ext === '') {
      return { mode: 'image', ext };
    }
    return { mode: 'binary-download', ext };
  }

  if (type.startsWith('video/')) return { mode: 'video', ext };
  if (type.startsWith('audio/')) return { mode: 'audio', ext };
  if (type === 'application/pdf' || ext === 'pdf') return { mode: 'pdf', ext };

  if (ext === 'docx') return { mode: 'docx', ext };
  if (ext === 'xlsx' || ext === 'ods') return { mode: 'sheet', ext };
  if (ext === 'csv') return { mode: 'csv', ext };

  if (ext === 'json' || type.includes('json')) return { mode: 'json', ext };
  if (ext === 'xml' || type.includes('xml')) return { mode: 'xml', ext };

  if (ext === 'html' || type.includes('text/html')) return { mode: 'html', ext };
  if (['txt', 'rtf', 'css', 'js', 'php', 'py'].includes(ext) || type.startsWith('text/')) return { mode: 'text', ext };

  if (['mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext)) return { mode: 'video', ext };
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma', 'ogg'].includes(ext)) return { mode: 'audio', ext };

  if (['pptx', 'odt', 'psd', 'ai', 'eps', 'raw', 'heic', 'zip', 'rar', '7z', 'tar', 'iso', 'exe', 'dmg', 'apk'].includes(ext)) {
    return { mode: 'binary-download', ext };
  }

  return { mode: 'binary-download', ext };
}

function buildSimpleTable(matrix, maxRows = 50) {
  const rows = matrix.slice(0, maxRows);
  const maxCols = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  const header = Array.from({ length: maxCols }, (_v, i) => `<th>Col ${i + 1}</th>`).join('');
  const body = rows.map((row) => {
    const cols = Array.from({ length: maxCols }, (_v, i) => safeHtml(row?.[i] ?? '')).map((v) => `<td title="${v}">${v}</td>`).join('');
    return `<tr>${cols}</tr>`;
  }).join('');
  return `<div class="sheet-wrap"><table class="sheet-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function resetPreviewSurface() {
  if (state.lastObjectUrl) {
    URL.revokeObjectURL(state.lastObjectUrl);
    state.lastObjectUrl = null;
  }
  ui.requestPreview.innerHTML = '<div class="empty-state">No response yet. Request a file to preview content.</div>';
}

function updateRequestMeta(meta) {
  const rows = [
    `status: ${meta.status || '-'}`,
    `type: ${meta.contentType || '-'}`,
    `size: ${meta.size || '-'}`,
    `edge: ${meta.edge || '-'}`,
    `cache: ${meta.cache || '-'}`,
    `latency: ${meta.latency || '-'}`
  ];
  ui.requestMeta.innerHTML = rows.map((line) => `<div class="pill">${safeHtml(line)}</div>`).join('');
}

async function renderPreview(blob, contentType, filename) {
  if (state.lastObjectUrl) {
    URL.revokeObjectURL(state.lastObjectUrl);
    state.lastObjectUrl = null;
  }

  const { mode, ext } = classifyFile(contentType, filename);

  if (mode === 'image') {
    const objectUrl = URL.createObjectURL(blob);
    state.lastObjectUrl = objectUrl;
    ui.requestPreview.innerHTML = `<img class="preview-image" src="${objectUrl}" alt="${safeHtml(filename)}" />`;
    return;
  }

  if (mode === 'pdf') {
    const objectUrl = URL.createObjectURL(blob);
    state.lastObjectUrl = objectUrl;
    ui.requestPreview.innerHTML = `<iframe class="preview-pdf" src="${objectUrl}" title="PDF preview"></iframe>`;
    return;
  }

  if (mode === 'video') {
    const objectUrl = URL.createObjectURL(blob);
    state.lastObjectUrl = objectUrl;
    ui.requestPreview.innerHTML = `<video class="preview-video" controls src="${objectUrl}"></video>`;
    return;
  }

  if (mode === 'audio') {
    const objectUrl = URL.createObjectURL(blob);
    state.lastObjectUrl = objectUrl;
    ui.requestPreview.innerHTML = `<audio class="preview-audio" controls src="${objectUrl}"></audio>`;
    return;
  }

  if (mode === 'docx') {
    try {
      if (!window.mammoth) throw new Error('DOCX parser not loaded');
      const arrayBuffer = await blob.arrayBuffer();
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      ui.requestPreview.innerHTML = `<div class="preview-doc">${result.value || '<p>Empty DOCX content</p>'}</div>`;
      return;
    } catch (err) {
      ui.requestPreview.innerHTML = `<div class="download-box"><p>DOCX preview unavailable: ${safeHtml(err.message)}</p><a href="#" id="fallbackDownload">Download ${safeHtml(filename)}</a></div>`;
      const objectUrl = URL.createObjectURL(blob);
      state.lastObjectUrl = objectUrl;
      ui.requestPreview.querySelector('#fallbackDownload')?.setAttribute('href', objectUrl);
      ui.requestPreview.querySelector('#fallbackDownload')?.setAttribute('download', filename);
      return;
    }
  }

  if (mode === 'sheet') {
    try {
      if (!window.XLSX) throw new Error('Spreadsheet parser not loaded');
      const arrayBuffer = await blob.arrayBuffer();
      const wb = window.XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      ui.requestPreview.innerHTML = buildSimpleTable(rows, 50);
      return;
    } catch (err) {
      const objectUrl = URL.createObjectURL(blob);
      state.lastObjectUrl = objectUrl;
      ui.requestPreview.innerHTML = `
        <div class="download-box">
          <p>${safeHtml(ext.toUpperCase())} preview unavailable: ${safeHtml(err.message)}</p>
          <a href="${objectUrl}" download="${safeHtml(filename)}">Download ${safeHtml(filename)}</a>
        </div>
      `;
      return;
    }
  }

  if (mode === 'csv') {
    const text = await blob.text();
    const lines = text.split(/\r?\n/).slice(0, 50);
    const matrix = lines.map((line) => line.split(','));
    ui.requestPreview.innerHTML = buildSimpleTable(matrix, 50);
    return;
  }

  if (mode === 'html') {
    const objectUrl = URL.createObjectURL(new Blob([await blob.text()], { type: 'text/html' }));
    state.lastObjectUrl = objectUrl;
    ui.requestPreview.innerHTML = `<iframe class="preview-pdf" sandbox="" src="${objectUrl}" title="HTML preview"></iframe>`;
    return;
  }

  if (mode === 'json') {
    const text = await blob.text();
    try {
      const parsed = JSON.parse(text);
      ui.requestPreview.innerHTML = `<pre class="preview-text">${safeHtml(JSON.stringify(parsed, null, 2).slice(0, 30000))}</pre>`;
    } catch {
      ui.requestPreview.innerHTML = `<pre class="preview-text">${safeHtml(text.slice(0, 30000))}</pre>`;
    }
    return;
  }

  if (mode === 'xml' || mode === 'text') {
    const text = await blob.text();
    ui.requestPreview.innerHTML = `<pre class="preview-text">${safeHtml(text.slice(0, 30000))}</pre>`;
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  state.lastObjectUrl = objectUrl;
  ui.requestPreview.innerHTML = `
    <div class="download-box">
      <p>Inline preview is not available for this file type (${safeHtml(ext || 'unknown')}).</p>
      <a href="${objectUrl}" download="${safeHtml(filename)}">Download ${safeHtml(filename)}</a>
      <ul class="unsupported-list">
        <li>Handled list includes: ${safeHtml(HANDLED_EXTENSIONS.join(', '))}</li>
        <li>For complex binary formats, download is intentionally provided.</li>
      </ul>
    </div>
  `;
}

function serverStateClass(edge) {
  if (edge.health !== 'UP') return 'state-down';
  if (!edge.enabled) return 'state-disabled';
  return 'state-up';
}

function renderServerControls() {
  if (!state.topology || !state.metrics) return;
  const { summary, origin, edges } = state.topology;

  ui.statusSummary.innerHTML = [
    metricCard('Origin', origin.enabled ? 'ENABLED' : 'DISABLED'),
    metricCard('Total Edges', String(summary.totalEdges)),
    metricCard('Active Edges', String(summary.activeEdges)),
    metricCard('Routing', 'ALPHA_BETA_EPSILON')
  ].join('');

  if (ui.originToggleBtn) {
    ui.originToggleBtn.textContent = origin.enabled ? 'Disable Origin' : 'Enable Origin';
    ui.originToggleBtn.classList.toggle('ghost', origin.enabled);
  }

  ui.edgeControls.innerHTML = edges.map((edge) => {
    const disabled = edge.health !== 'UP' ? 'disabled' : '';
    const stateText = edge.health !== 'UP' ? 'DOWN' : (edge.enabled ? 'ENABLED' : 'DISABLED');
    const dotClass = serverStateClass(edge);

    return `
      <div class="node-card">
        <div class="node-header">
          <strong>${edge.id}</strong>
          <span><span class="state-dot ${dotClass}"></span>${stateText}</span>
        </div>
        <div>${safeHtml(edge.region || 'unknown-region')}</div>
        <div class="control-row" style="margin-top:8px;">
          <button class="btn edge-toggle" data-edge-id="${edge.id}" data-enabled="true" ${disabled} ${edge.enabled ? 'disabled' : ''}>Enable</button>
          <button class="btn ghost edge-toggle" data-edge-id="${edge.id}" data-enabled="false" ${disabled} ${!edge.enabled ? 'disabled' : ''}>Disable</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="item">No edges registered yet. Start or scale edge containers.</div>';

  document.querySelectorAll('.edge-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const edgeId = btn.getAttribute('data-edge-id');
      const enabled = btn.getAttribute('data-enabled') === 'true';
      try {
        await api(`/api/admin/edge/${encodeURIComponent(edgeId)}/state`, {
          method: 'POST',
          body: JSON.stringify({ enabled })
        });
        showToast(`Edge ${edgeId} set to ${enabled ? 'enabled' : 'disabled'}`);
        await refreshAll();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderOriginFiles(files) {
  if (files.length > 0) {
    state.latestUploadedName = files[files.length - 1].name;
  }

  ui.originFiles.innerHTML = files.map((file) => `
    <div class="item">
      <strong>${file.name}</strong>
      <div>${file.size} bytes | updated ${new Date(file.updatedAt).toLocaleString()}</div>
      <div class="control-row" style="margin-top:8px;">
        <button class="btn ghost delete-origin-file" data-filename="${safeHtml(file.name)}" type="button">Delete</button>
      </div>
    </div>
  `).join('') || '<div class="item">No files on origin</div>';

  document.querySelectorAll('.delete-origin-file').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const filename = btn.getAttribute('data-filename');
      if (!filename) return;

      const shouldDelete = window.confirm(`Delete ${filename} from origin?`);
      if (!shouldDelete) return;

      try {
        await api(`/api/origin/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        showToast(`Deleted ${filename}`);
        await refreshAll();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderMetrics() {
  if (!state.metrics) return;

  const strategyUsage = state.metrics.strategyUsage || {};
  const maxValue = Math.max(1, ...Object.values(strategyUsage));
  ui.strategyBars.innerHTML = `
    <div class="bar-wrap">
      ${Object.entries(strategyUsage).map(([label, value]) => {
        const width = Math.round((value / maxValue) * 100);
        return `<div class="bar-row"><span>${label}</span><div class="bar" style="width:${width}%"></div><span>${value}</span></div>`;
      }).join('')}
    </div>
  `;

  const ratio = Math.round((state.metrics.cacheHitRatio || 0) * 100);
  ui.cacheRatio.innerHTML = `
    <div class="item">Cache Hits: <strong>${state.metrics.cacheHits}</strong></div>
    <div class="item">Cache Misses: <strong>${state.metrics.cacheMisses}</strong></div>
    <div class="item">Hit Ratio: <strong>${ratio}%</strong></div>
  `;

  ui.flowList.innerHTML = (state.metrics.recentFlow || []).slice().reverse().map((flow) => {
    const cache = String(flow.cache || 'BYPASS').toUpperCase();
    const cacheClass = cache === 'HIT' ? 'hit' : (cache === 'MISS' ? 'miss' : 'error');
    const latency = Number.isFinite(Number(flow.latencyMs)) ? `${Number(flow.latencyMs)} ms` : '-';

    return `
      <div class="item flow-item">
        <div class="flow-main">
          <span class="flow-title">#${flow.id} ${safeHtml(flow.filename || '-')}</span>
          <span class="flow-tag">${safeHtml(latency)}</span>
        </div>
        <div class="flow-tags">
          <span class="flow-tag">edge: ${safeHtml(flow.edgeId || '-')}</span>
          <span class="flow-tag ${cacheClass}">cache: ${safeHtml(cache)}</span>
          <span class="flow-tag">status: ${safeHtml(flow.statusCode || '-')}</span>
        </div>
      </div>
    `;
  }).join('') || '<div class="item">No requests yet</div>';
}

async function refreshAll() {
  const [topology, metrics, files] = await Promise.all([
    api('/api/topology'),
    api('/api/metrics'),
    api('/api/origin/files')
  ]);

  state.topology = topology;
  state.metrics = metrics;

  renderServerControls();
  renderMetrics();
  renderOriginFiles(files.files || []);
}

async function clearRecentFlow() {
  await api('/api/admin/flow/reset', { method: 'POST' });
}

async function setOriginEnabled(enabled) {
  await api('/api/admin/origin/state', { method: 'POST', body: JSON.stringify({ enabled }) });
}

async function setAllEdgesEnabled(enabled) {
  const topology = await api('/api/topology');
  const edges = topology.edges || [];
  await Promise.all(
    edges
      .filter((e) => e.health === 'UP')
      .map((edge) => api(`/api/admin/edge/${encodeURIComponent(edge.id)}/state`, {
        method: 'POST',
        body: JSON.stringify({ enabled })
      }))
  );
}

async function init() {
  state.config = await fetch('/config.json').then((r) => r.json());
  if (ui.gatewayTarget) {
    ui.gatewayTarget.textContent = `Gateway: ${state.config.gatewayUrl}`;
  }
  if (ui.vercelTarget) {
    ui.vercelTarget.textContent = `Vercel control-plane base: ${state.config.vercelControlPlaneUrl}`;
  }

  ui.refreshBtn?.addEventListener('click', async () => {
    try {
      await clearRecentFlow();
      await refreshAll();
      showToast('Recent flow cleared and dashboard refreshed');
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.originToggleBtn.addEventListener('click', async () => {
    try {
      const enabled = state.topology?.origin?.enabled ?? true;
      await setOriginEnabled(!enabled);
      showToast(!enabled ? 'Origin enabled' : 'Origin disabled');
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.enableAllEdgesBtn.addEventListener('click', async () => {
    try {
      await setAllEdgesEnabled(true);
      showToast('All healthy edges enabled');
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.disableAllEdgesBtn.addEventListener('click', async () => {
    try {
      await setAllEdgesEnabled(false);
      showToast('All healthy edges disabled');
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ui.uploadFile.files.length) {
      showToast('Select a file first');
      return;
    }

    try {
      const form = new FormData();
      form.append('file', ui.uploadFile.files[0]);

      const response = await fetch(`${state.config.gatewayUrl}/api/upload`, {
        method: 'POST',
        body: form
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'upload failed');
      }

      showToast(`Uploaded ${payload.file.name}`);
      state.latestUploadedName = payload.file.name;
      ui.uploadFile.value = '';
      await refreshAll();
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.requestBtn.addEventListener('click', async () => {
    const filename = ui.requestFile.value.trim();
    if (!filename) {
      showToast('Provide a filename');
      return;
    }

    try {
      const response = await fetch(`${state.config.gatewayUrl}/api/content/${encodeURIComponent(filename)}`);
      const blob = await response.blob();
      state.lastFetchedBlob = blob;
      state.lastFetchedFilename = filename;
      const serverLatency = response.headers.get('x-litecdn-latency-ms');
      const elapsed = serverLatency && /^\d+$/.test(serverLatency) ? `${serverLatency} ms` : '-';
      const contentType = response.headers.get('content-type') || blob.type || 'application/octet-stream';

      updateRequestMeta({
        status: response.status,
        contentType,
        size: formatBytes(blob.size),
        edge: response.headers.get('x-litecdn-selected-edge') || '-',
        cache: response.headers.get('x-litecdn-cache') || '-',
        latency: elapsed
      });

      await renderPreview(blob, contentType, filename);

      const rawHeaders = [
        `status: ${response.status}`,
        `edge: ${response.headers.get('x-litecdn-selected-edge') || '-'}`,
        `routing: ${response.headers.get('x-litecdn-routing') || '-'}`,
        `cache: ${response.headers.get('x-litecdn-cache') || '-'}`,
        `content-type: ${contentType}`,
        `size: ${formatBytes(blob.size)}`,
        `latency: ${elapsed}`,
        '----- headers -----'
      ];

      response.headers.forEach((value, key) => {
        rawHeaders.push(`${key}: ${value}`);
      });

      let rawBodyPreview = '[binary content omitted in raw view]';
      const lowerType = contentType.toLowerCase();
      if (
        lowerType.startsWith('text/') ||
        lowerType.includes('json') ||
        lowerType.includes('xml') ||
        lowerType.includes('javascript')
      ) {
        const text = await blob.text();
        rawBodyPreview = text.slice(0, 12000);
      }

      ui.requestResult.textContent = [
        ...rawHeaders,
        '----- body preview -----',
        rawBodyPreview
      ].join('\n');

      await refreshAll();
    } catch (error) {
      showToast(error.message);
    }
  });

  ui.downloadFetchedBtn.addEventListener('click', () => {
    if (!state.lastFetchedBlob) {
      showToast('No fetched response available to download');
      return;
    }

    const objectUrl = URL.createObjectURL(state.lastFetchedBlob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = state.lastFetchedFilename || 'litecdn-fetched-file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  });

  ui.pickLatestBtn.addEventListener('click', () => {
    if (!state.latestUploadedName) {
      showToast('No uploaded file found yet');
      return;
    }
    ui.requestFile.value = state.latestUploadedName;
    showToast(`Selected ${state.latestUploadedName}`);
  });

  await clearRecentFlow();
  await refreshAll();
  setInterval(refreshAll, 4000);
}

init().catch((error) => {
  resetPreviewSurface();
  ui.requestResult.textContent = `Dashboard initialization failed: ${error.message}`;
});
