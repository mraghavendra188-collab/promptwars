'use strict';
/**
 * SmartStadium AI — Admin Dashboard JS
 * Real-time crowd management with WebSocket, Gemini AI announcements.
 */

const PANELS = ['overview', 'zones', 'gates', 'ai', 'analytics'];
let crowdData = { zones: [], gates: [] };
let ws;

/* ── Nav ── */
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel;
    document.querySelectorAll('.nav-item').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-current', b === btn ? 'page' : 'false');
    });
    PANELS.forEach((p) => {
      const el = document.getElementById(`panel-${p}`);
      if (el) el.hidden = p !== panel;
    });
    document.getElementById('panel-title').textContent =
      btn.textContent.replace(/^[^\w]+/, '').trim();
  });
});

/* ── Utility: Visibility Throttling ── */
let isDashboardVisible = true;
const dashObserver = new IntersectionObserver((entries) => {
  isDashboardVisible = entries[0].isIntersecting;
}, { threshold: 0.1 });
dashObserver.observe(document.querySelector('main'));
document.addEventListener('visibilitychange', () => {
  isDashboardVisible = document.visibilityState === 'visible';
});

/* ── WebSocket ── */
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    document.getElementById('ws-status-dot').classList.add('connected');
    document.getElementById('ws-status-text').textContent = 'Live';
  };

  ws.onmessage = ({ data }) => {
    if (!isDashboardVisible) return;
    try {
      const payload = JSON.parse(data);
      if (payload.type === 'crowd-update') {
        crowdData = payload;
        renderKPIs(payload.zones, payload.gates);
        renderZoneTable(payload.zones);
        renderGateTable(payload.gates);
        checkAlerts(payload.zones);
      }
    } catch {}
  };

  ws.onclose = () => {
    document.getElementById('ws-status-dot').classList.remove('connected');
    document.getElementById('ws-status-text').textContent = 'Reconnecting…';
    setTimeout(connectWS, 3000);
  };
}

/* ── Render KPIs ── */
function renderKPIs(zones, gates) {
  const total = zones.reduce((s, z) => s + (z.count || 0), 0);
  const avgDensity = Math.round(zones.reduce((s, z) => s + z.density, 0) / zones.length);
  const alerts = zones.filter((z) => z.alertLevel !== 'normal').length;
  const openGates = gates.filter((g) => g.isOpen);
  const bestWait = openGates.length ? Math.min(...openGates.map((g) => g.waitTime)) : 0;

  document.getElementById('kpi-total').textContent = total.toLocaleString();
  document.getElementById('kpi-density').textContent = avgDensity + '%';
  document.getElementById('kpi-alerts').textContent = alerts;
  document.getElementById('kpi-wait').textContent = bestWait + ' min';

  document.getElementById('panel-subtitle').textContent =
    `Last updated ${new Date().toLocaleTimeString()}`;
}

/* ── Zone Table ── */
function renderZoneTable(zones) {
  const tbody = document.getElementById('zone-table');
  tbody.innerHTML = zones
    .sort((a, b) => b.density - a.density)
    .map(
      (z) => `
      <tr>
        <td>${fmt(z.id)}</td>
        <td>${(z.count || 0).toLocaleString()}</td>
        <td>${z.density}%</td>
        <td><span class="badge badge-${z.alertLevel}">${z.alertLevel}</span></td>
      </tr>`
    )
    .join('');
}

/* ── Gate Table ── */
function renderGateTable(gates) {
  const tbody = document.getElementById('gate-table');
  tbody.innerHTML = gates
    .map(
      (g) => `
      <tr>
        <td>${g.gateId.replace('gate-', 'Gate ').toUpperCase()}</td>
        <td>${g.queueLength}</td>
        <td>${g.isOpen ? g.waitTime + ' min' : '—'}</td>
        <td><span class="badge ${g.isOpen ? 'badge-normal' : 'badge-critical'}">${g.isOpen ? 'Open' : 'Closed'}</span></td>
      </tr>`
    )
    .join('');
}

/* ── Alerts ── */
function checkAlerts(zones) {
  const critical = zones.filter((z) => z.alertLevel === 'critical');
  const bar = document.getElementById('admin-alert');
  if (critical.length > 0) {
    bar.textContent = `⚠ Critical: ${critical.map((z) => fmt(z.id)).join(', ')} at critical capacity. Immediate action required.`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

/* ── AI Announcement ── */
document.getElementById('gen-announce-btn').addEventListener('click', async () => {
  const zoneId = document.getElementById('announce-zone').value;
  const zone = crowdData.zones.find((z) => z.id === zoneId);
  const density = zone?.density || 80;

  const output = document.getElementById('announcement-output');
  const btn = document.getElementById('gen-announce-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  output.textContent = 'Generating with Gemini…';

  try {
    const res = await fetch('/api/gemini/announce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId, density }),
    });

    if (res.status === 401) {
      output.textContent = 'Admin authentication required. Please sign in.';
      return;
    }

    const data = await res.json();
    output.textContent = data.announcement || 'Announcement generated.';
    document.getElementById('copy-announce-btn').disabled = false;
  } catch {
    output.textContent = 'Failed to generate announcement. Check your connection.';
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Generate with Gemini';
  }
});

/* ── NL Query ── */
document.getElementById('nl-query-btn').addEventListener('click', async () => {
  const query = document.getElementById('nl-query').value.trim();
  if (!query) return;
  const result = document.getElementById('nl-result');
  result.textContent = 'Asking Gemini…';

  try {
    const res = await fetch('/api/gemini/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    result.textContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') break;
        try { result.textContent += JSON.parse(payload).chunk || ''; } catch {}
      }
    }
  } catch {
    result.textContent = 'Query failed. Please try again.';
  }
});

/* ── Copy ── */
document.getElementById('copy-announce-btn').addEventListener('click', () => {
  const text = document.getElementById('announcement-output').textContent;
  navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
});

/* ── Top-bar announce ── */
document.getElementById('announce-btn').addEventListener('click', () => {
  document.querySelector('[data-panel="ai"]').click();
});

/* ── Refresh ── */
document.getElementById('refresh-btn').addEventListener('click', async () => {
  try {
    const [zonesRes, gatesRes] = await Promise.all([
      fetch('/api/crowd/zones'),
      fetch('/api/crowd/gates'),
    ]);
    const zonesData = await zonesRes.json();
    const gatesData = await gatesRes.json();
    crowdData = { zones: zonesData.zones, gates: gatesData.gates };
    renderKPIs(crowdData.zones, crowdData.gates);
    renderZoneTable(crowdData.zones);
    renderGateTable(crowdData.gates);
    checkAlerts(crowdData.zones);
  } catch {}
});

/* ── Utils ── */
function fmt(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Modal (keyboard accessible) ── */
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('announce-modal').classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('announce-modal').classList.add('hidden');
});

/* ── Boot ── */
connectWS();
