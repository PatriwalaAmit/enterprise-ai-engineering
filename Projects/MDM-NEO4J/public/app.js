// MDM Graph Console — Admin UI
const API = '';

const PRESET_QUERIES = [
  'Who does Alex Kim report to?',
  'Who is Alex Kim skip-level manager?',
  'Who does Alex Kim matrix report to?',
  'Who is Jordan Lee job shadowing?',
  'Who does Emily Watson cover for?',
  'Show management chain from Alex Kim to Sarah Chen',
];

const EDGE_COLORS = {
  reports_to: '#4f8cff',
  matrix_reports_to: '#f59e0b',
  job_shadows: '#a78bfa',
  covers_for: '#f87171',
  belongs_to: '#6b7280',
};

let graphData = { nodes: [], edges: [] };

// ── API helpers ──────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

// ── Navigation ───────────────────────────────────────────────

const PANEL_TITLES = {
  dashboard: 'Dashboard',
  query: 'Query Explorer',
  graph: 'Graph View',
  nodes: 'Nodes',
  edges: 'Relationships',
  admin: 'Admin',
};

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = btn.dataset.panel;
    document.getElementById(`panel-${panel}`).classList.add('active');
    document.getElementById('page-title').textContent = PANEL_TITLES[panel] || panel;
    if (panel === 'graph') renderGraph();
    if (panel === 'nodes') renderNodesTable();
    if (panel === 'edges') renderEdgesTable();
  });
});

document.getElementById('btn-refresh').addEventListener('click', () => loadAll());

// ── Dashboard ────────────────────────────────────────────────

async function loadHealth() {
  const dot = document.getElementById('health-dot');
  const label = document.getElementById('health-label');
  try {
    const data = await api('/graph/status');
    dot.className = 'status-dot healthy';
    label.textContent = `Healthy · ${data.graph.totalNodes} nodes`;
    return data;
  } catch {
    dot.className = 'status-dot error';
    label.textContent = 'Disconnected';
    return null;
  }
}

async function loadStats() {
  try {
    const [status, stats] = await Promise.all([
      api('/graph/status'),
      api('/admin/stats'),
    ]);

    document.getElementById('stats-grid').innerHTML = [
      { value: status.graph.totalNodes, label: 'Total Nodes' },
      { value: status.graph.mainNodes, label: 'Main (Trusted)' },
      { value: status.graph.tempNodes, label: 'Temp (Pending)' },
      { value: status.graph.totalEdges, label: 'Relationships' },
    ].map((s) => `
      <div class="stat-card">
        <div class="value">${s.value}</div>
        <div class="label">${s.label}</div>
      </div>
    `).join('');

    const rt = stats.runtime;
    document.getElementById('metrics-grid').innerHTML = [
      { k: 'Total Queries', v: rt.totalQueries },
      { k: 'Graph Hit Rate', v: rt.graphHitRate },
      { k: 'Avg Latency', v: `${rt.avgLatencyMs}ms` },
      { k: 'Gemini Reduction', v: rt.geminiCallReduction },
    ].map((m) => `
      <div class="metric-item"><strong>${m.v}</strong><span>${m.k}</span></div>
    `).join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderQuickQueries() {
  const container = document.getElementById('quick-queries');
  container.innerHTML = PRESET_QUERIES.map((q) =>
    `<button class="chip" data-query="${q}">${q}</button>`
  ).join('');
  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => runQuery(chip.dataset.query));
  });
}

function renderPresetQueries() {
  const container = document.getElementById('preset-queries');
  container.innerHTML = PRESET_QUERIES.map((q) =>
    `<button type="button" class="chip" data-query="${q}">${q}</button>`
  ).join('');
  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('query-input').value = chip.dataset.query;
      runQuery(chip.dataset.query);
    });
  });
}

// ── Query Explorer ───────────────────────────────────────────

document.getElementById('query-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('query-input').value.trim();
  if (q) runQuery(q);
});

async function runQuery(query) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelector('[data-panel="query"]').classList.add('active');
  document.getElementById('panel-query').classList.add('active');
  document.getElementById('page-title').textContent = 'Query Explorer';
  document.getElementById('query-input').value = query;

  const resultEl = document.getElementById('query-result');
  resultEl.hidden = false;
  document.getElementById('result-answer').textContent = 'Running…';

  try {
    const data = await api('/query', {
      method: 'POST',
      body: JSON.stringify({ query, includeMetadata: true }),
    });

    document.getElementById('result-meta').innerHTML = `
      <span class="badge ${data.source}">${data.source}</span>
      <span class="badge">${data.intent}</span>
      <span class="badge">${data.latencyMs}ms</span>
      <span class="badge">confidence ${(data.confidence * 100).toFixed(0)}%</span>
    `;

    document.getElementById('result-answer').textContent = data.answer;

    const pathEl = document.getElementById('result-path');
    if (data.graphPath?.nodes?.length) {
      const nodeMap = Object.fromEntries(data.graphPath.nodes.map((n) => [n.id, n]));
      if (data.graphPath.edges?.length) {
        pathEl.innerHTML = data.graphPath.edges.map((e) => {
          const from = nodeMap[e.from]?.label || e.from;
          const to = nodeMap[e.to]?.label || e.to;
          return `<div class="path-step"><strong>${from}</strong><span class="path-arrow">→ ${e.type} →</span><strong>${to}</strong></div>`;
        }).join('');
      } else {
        pathEl.innerHTML = data.graphPath.nodes.map((n) =>
          `<div class="path-step"><strong>${n.label}</strong> <span class="path-arrow">(${n.type})</span></div>`
        ).join('');
      }
    } else {
      pathEl.innerHTML = '<span style="color:var(--muted)">No graph path (Gemini or cache response)</span>';
    }
  } catch (e) {
    document.getElementById('result-answer').textContent = `Error: ${e.message}`;
    pathEl.innerHTML = '';
  }
}

// ── Graph visualization ──────────────────────────────────────

async function loadGraph() {
  graphData = await api('/admin/graph');
  return graphData;
}

function buildLayout(nodes, edges, filter) {
  const filteredEdges = filter === 'all' ? edges : edges.filter((e) => e.type === filter);
  const nodeIds = new Set();
  filteredEdges.forEach((e) => { nodeIds.add(e.from); nodeIds.add(e.to); });
  const visibleNodes = nodes.filter((n) => nodeIds.has(n.id));

  if (visibleNodes.length === 0) return { positions: {}, filteredEdges, visibleNodes };

  const children = {};
  const hasParent = new Set();
  filteredEdges.forEach((e) => {
    if (e.type === 'reports_to' || filter === 'all') {
      if (!children[e.from]) children[e.from] = [];
      children[e.from].push(e.to);
      hasParent.add(e.to);
    }
  });

  const roots = visibleNodes.filter((n) => !hasParent.has(n.id));
  const positions = {};
  const levels = {};

  function assignLevel(id, level) {
    levels[id] = Math.max(levels[id] ?? 0, level);
    (children[id] || []).forEach((cid) => assignLevel(cid, level + 1));
  }
  (roots.length ? roots : [visibleNodes[0]]).forEach((n) => assignLevel(n.id, 0));

  const byLevel = {};
  visibleNodes.forEach((n) => {
    const l = levels[n.id] ?? 0;
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(n);
  });

  const W = 900, H = 500, padX = 80, padY = 60;
  const maxLevel = Math.max(...Object.keys(byLevel).map(Number), 0);

  Object.entries(byLevel).forEach(([level, ns]) => {
    const y = padY + (Number(level) / Math.max(maxLevel, 1)) * (H - padY * 2);
    ns.forEach((n, i) => {
      positions[n.id] = {
        x: padX + ((i + 1) / (ns.length + 1)) * (W - padX * 2),
        y,
      };
    });
  });

  return { positions, filteredEdges, visibleNodes };
}

function renderGraph() {
  const svg = document.getElementById('graph-svg');
  const filter = document.getElementById('edge-filter').value;
  const { positions, filteredEdges, visibleNodes } = buildLayout(
    graphData.nodes,
    graphData.edges,
    filter
  );

  svg.innerHTML = '';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  Object.entries(EDGE_COLORS).forEach(([type, color]) => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `arrow-${type}`);
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  const gEdges = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  filteredEdges.forEach((e) => {
    const from = positions[e.from];
    const to = positions[e.to];
    if (!from || !to) return;

    const color = EDGE_COLORS[e.type] || '#888';
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('stroke', color);
    line.setAttribute('class', 'graph-edge');
    line.setAttribute('marker-end', `url(#arrow-${e.type})`);
    gEdges.appendChild(line);

    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', mx);
    lbl.setAttribute('y', my - 6);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('class', 'graph-edge-label');
    lbl.textContent = e.type.replace(/_/g, ' ');
    gEdges.appendChild(lbl);
  });
  svg.appendChild(gEdges);

  const gNodes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  visibleNodes.forEach((n) => {
    const pos = positions[n.id];
    if (!pos) return;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'graph-node');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '22');
    circle.setAttribute('fill', n.status === 'temp' ? '#fbbf24' : '#4f8cff');
    g.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('y', '38');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = n.label.length > 14 ? n.label.slice(0, 12) + '…' : n.label;
    g.appendChild(text);

    g.title = `${n.label}\n${n.description || ''}\nStatus: ${n.status}`;
    gNodes.appendChild(g);
  });
  svg.appendChild(gNodes);

  document.getElementById('graph-legend').innerHTML = Object.entries(EDGE_COLORS)
    .map(([type, color]) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${type.replace(/_/g, ' ')}</span>`
    ).join('');
}

document.getElementById('edge-filter').addEventListener('change', renderGraph);

// ── Nodes table ──────────────────────────────────────────────

function renderNodesTable(filter = '') {
  const tbody = document.querySelector('#nodes-table tbody');
  const q = filter.toLowerCase();
  const nodes = graphData.nodes.filter((n) =>
    !q || n.label.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q)
  );

  tbody.innerHTML = nodes.map((n) => `
    <tr>
      <td><strong>${n.label}</strong></td>
      <td>${n.type}</td>
      <td><span class="tag ${n.status}">${n.status}</span></td>
      <td>${n.description || '—'}</td>
      <td>${(n.confidence * 100).toFixed(0)}%</td>
      <td>
        <div class="action-group">
          <button class="btn btn-sm btn-ghost edit-node-btn"
            data-id="${n.id}" data-label="${n.label}"
            data-description="${(n.description || '').replace(/"/g, '&quot;')}"
            data-status="${n.status}">Edit</button>
          <button class="btn btn-sm btn-ghost manager-btn" data-id="${n.id}">Manager</button>
          ${n.status === 'temp' ? `<button class="btn btn-sm btn-ghost promote-btn" data-id="${n.id}">Promote</button>` : ''}
          <button class="btn btn-sm btn-danger delete-node-btn" data-id="${n.id}" data-label="${n.label}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="color:var(--muted)">No nodes</td></tr>';

  tbody.querySelectorAll('.delete-node-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete node "${btn.dataset.label}"?`)) return;
      try {
        await api(`/admin/node/${btn.dataset.id}`, { method: 'DELETE' });
        toast('Node deleted');
        await loadGraph();
        renderNodesTable(document.getElementById('node-search').value);
        loadStats();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  tbody.querySelectorAll('.promote-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/admin/promote/${btn.dataset.id}`, { method: 'POST' });
        toast('Promoted to main (trusted master data)');
        await loadGraph();
        renderNodesTable();
        loadStats();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  tbody.querySelectorAll('.edit-node-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('edit-node-id').value = btn.dataset.id;
      document.getElementById('edit-node-label').value = btn.dataset.label;
      document.getElementById('edit-node-description').value = btn.dataset.description || '';
      document.getElementById('edit-node-status').value = btn.dataset.status;
      document.getElementById('modal-edit-node').showModal();
    });
  });

  tbody.querySelectorAll('.manager-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      populateManagerSelects(btn.dataset.id);
      document.getElementById('modal-manager').showModal();
    });
  });
}

document.getElementById('node-search').addEventListener('input', (e) => {
  renderNodesTable(e.target.value);
});

// ── Edges table ──────────────────────────────────────────────

function renderEdgesTable() {
  const tbody = document.querySelector('#edges-table tbody');
  tbody.innerHTML = graphData.edges.map((e) => `
    <tr>
      <td>${e.fromLabel}</td>
      <td><span class="tag ${e.type}">${e.type.replace(/_/g, ' ')}</span></td>
      <td>${e.toLabel}</td>
      <td>${e.evidence || '—'}</td>
      <td>
        <button class="btn btn-sm btn-danger delete-edge-btn"
          data-from="${e.from}" data-to="${e.to}" data-type="${e.type}">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="color:var(--muted)">No relationships</td></tr>';

  tbody.querySelectorAll('.delete-edge-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this relationship?')) return;
      const { from, to, type } = btn.dataset;
      try {
        await api(`/admin/edge?from=${from}&to=${to}&type=${type}`, { method: 'DELETE' });
        toast('Relationship deleted');
        await loadGraph();
        renderEdgesTable();
        loadStats();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function populateEdgeSelects() {
  const opts = graphData.nodes
    .map((n) => `<option value="${n.id}">${n.label}</option>`)
    .join('');
  document.getElementById('edge-from').innerHTML = opts;
  document.getElementById('edge-to').innerHTML = opts;
}

function populateManagerSelects(selectedEmployeeId) {
  const employees = graphData.nodes.filter((n) => n.type === 'Entity' && !n.label.includes('Department'));
  const opts = employees.map((n) =>
    `<option value="${n.id}" ${n.id === selectedEmployeeId ? 'selected' : ''}>${n.label}</option>`
  ).join('');
  document.getElementById('manager-employee').innerHTML = opts;
  document.getElementById('manager-new').innerHTML = employees
    .map((n) => `<option value="${n.id}">${n.label}</option>`)
    .join('');
}

// ── Modals ───────────────────────────────────────────────────

const modalNode = document.getElementById('modal-node');
const modalEdge = document.getElementById('modal-edge');
const modalEditNode = document.getElementById('modal-edit-node');
const modalManager = document.getElementById('modal-manager');

document.getElementById('btn-add-node').addEventListener('click', () => modalNode.showModal());
document.getElementById('cancel-node').addEventListener('click', () => modalNode.close());

document.getElementById('form-node').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/nodes', {
      method: 'POST',
      body: JSON.stringify({
        label: fd.get('label'),
        description: fd.get('description') || undefined,
        type: fd.get('type'),
        status: fd.get('status'),
        source: 'manual',
      }),
    });
    modalNode.close();
    e.target.reset();
    toast('Node created');
    await loadGraph();
    renderNodesTable();
    loadStats();
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('btn-change-manager').addEventListener('click', () => {
  populateManagerSelects(graphData.nodes[0]?.id);
  modalManager.showModal();
});

document.getElementById('cancel-edit-node').addEventListener('click', () => modalEditNode.close());
document.getElementById('form-edit-node').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('id');
  try {
    await api(`/admin/node/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        label: fd.get('label'),
        description: fd.get('description') || undefined,
        status: fd.get('status'),
      }),
    });
    modalEditNode.close();
    toast('Employee updated');
    await loadGraph();
    renderNodesTable(document.getElementById('node-search').value);
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('cancel-manager').addEventListener('click', () => modalManager.close());
document.getElementById('form-manager').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/reassign-manager', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: fd.get('employeeId'),
        newManagerId: fd.get('newManagerId'),
        evidence: fd.get('evidence') || 'Manager reassignment',
      }),
    });
    modalManager.close();
    e.target.reset();
    toast('Primary manager updated — re-run query to verify');
    await loadGraph();
    renderEdgesTable();
    renderNodesTable();
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('btn-add-edge').addEventListener('click', () => {
  populateEdgeSelects();
  modalEdge.showModal();
});
document.getElementById('cancel-edge').addEventListener('click', () => modalEdge.close());

document.getElementById('form-edge').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/admin/edges', {
      method: 'POST',
      body: JSON.stringify({
        from: fd.get('from'),
        to: fd.get('to'),
        type: fd.get('type'),
        evidence: fd.get('evidence') || undefined,
      }),
    });
    modalEdge.close();
    e.target.reset();
    toast('Relationship created');
    await loadGraph();
    renderEdgesTable();
    loadStats();
  } catch (err) { toast(err.message, 'error'); }
});

// ── Admin actions ────────────────────────────────────────────

document.getElementById('btn-merge').addEventListener('click', async () => {
  const out = document.getElementById('merge-output');
  out.textContent = 'Running merge…';
  try {
    const data = await api('/admin/merge', { method: 'POST' });
    out.textContent = JSON.stringify(data.report, null, 2);
    toast(`Merge done: ${data.report.promoted} promoted`);
    await loadGraph();
    loadStats();
  } catch (e) {
    out.textContent = e.message;
    toast(e.message, 'error');
  }
});

document.getElementById('btn-load-temp').addEventListener('click', async () => {
  const out = document.getElementById('temp-output');
  try {
    const data = await api('/admin/temp-nodes');
    out.textContent = data.count
      ? JSON.stringify(data.nodes.map((n) => ({ id: n.id, label: n.label, confidence: n.properties.confidence })), null, 2)
      : 'No temp nodes';
  } catch (e) { out.textContent = e.message; }
});

document.getElementById('btn-reset-metrics').addEventListener('click', async () => {
  try {
    await api('/admin/reset-metrics', { method: 'POST' });
    toast('Metrics reset');
    loadStats();
  } catch (e) { toast(e.message, 'error'); }
});

// ── Init ─────────────────────────────────────────────────────

async function loadAll() {
  await loadHealth();
  await loadStats();
  try {
    await loadGraph();
  } catch (e) {
    toast('Graph load failed: ' + e.message, 'error');
  }
}

renderQuickQueries();
renderPresetQueries();
loadAll();
