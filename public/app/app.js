/**
 * SmartStadium AI — Fan App JavaScript
 * Real-time crowd data via WebSocket/Firebase, Gemini AI chat, Google Maps,
 * full keyboard navigation, and accessibility features.
 */
'use strict';

/* ───────────────────────────────────────────────────────────────
   State
─────────────────────────────────────────────────────────────── */
const state = {
  zones: [],
  gates: [],
  recommendation: null,
  user: null,
  firebaseConfig: null,
  mapsLoaded: false,
  map: null,
  heatmap: null,
  markers: [],
  ws: null,
  geminiKey: '',
};

/* ───────────────────────────────────────────────────────────────
   DOM references
─────────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

/* ───────────────────────────────────────────────────────────────
   Init
─────────────────────────────────────────────────────────────── */
async function init() {
  setupTabs();
  setupContrastToggle();
  setupChatForm();
  setupQuickPrompts();
  setupSosBubble();
  setupIntersectionObserver();
  registerServiceWorker();
  await loadConfig();
  connectWebSocket();

  // Wait for Firebase modules to load if not already available
  if (!window.__firebaseModules) {
    console.log('Waiting for Firebase modules...');
    window.__onFirebaseLoaded = () => initFirebase();
  } else {
    initFirebase();
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.error('SW registration failed', err));
    });
  }
}

let isPageVisible = true;
function setupIntersectionObserver() {
  const observer = new IntersectionObserver((entries) => {
    isPageVisible = entries[0].isIntersecting;
  }, { threshold: 0.1 });
  
  // Observe the main content area
  observer.observe(document.querySelector('main'));

  // Also handle visibility API
  document.addEventListener('visibilitychange', () => {
    isPageVisible = document.visibilityState === 'visible';
  });
}

/* ── SOS Speed Dial Setup ── */
function setupSosBubble() {
  const sosBtn = $('sos-btn');
  const sosOptions = $('sos-options');
  if (!sosBtn || !sosOptions) return;
  
  // Toggle the menu
  sosBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = sosBtn.classList.toggle('active');
    sosOptions.classList.toggle('active');
    sosBtn.setAttribute('aria-expanded', isActive);
  });

  // Handle outside clicks to close the menu
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sos-container')) {
      sosBtn.classList.remove('active');
      sosOptions.classList.remove('active');
      sosBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Handle option clicks
  const optionBtns = document.querySelectorAll('.sos-option-btn');
  optionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.getAttribute('data-type');
      const zone = state.recommendation?.gateId ? 'near ' + state.recommendation.gateId.replace('-', ' ') : 'your location';
      
      sosBtn.classList.remove('active');
      sosOptions.classList.remove('active');
      sosBtn.setAttribute('aria-expanded', 'false');

      if (type === 'seat') {
        showToast(`💺 Seat issue reported. A staff member will check on you shortly.`, 5000);
      } else if (type === 'help') {
        showToast(`🙋 General help requested. Assistance is on the way to ${zone}.`, 5000);
      } else if (type === 'emergency') {
        showToast(`🚨 SOS Alert sent to Stadium Security at ${zone}! Help is on the way immediately.`, 8000);
      }
    });
  });
}

/* ───────────────────────────────────────────────────────────────
   Config (from server — no keys hardcoded in frontend)
─────────────────────────────────────────────────────────────── */
async function loadConfig() {
  try {
    const res = await fetch('/api/auth/config');
    state.firebaseConfig = await res.json();
    state.geminiKey = state.firebaseConfig.geminiApiKey || '';
  } catch (err) {
    console.warn('Could not load config, running in offline/demo mode');
    showToast('Running in demo mode — live data unavailable');
  }
}

/* ───────────────────────────────────────────────────────────────
   Firebase Auth + Firestore real-time listeners
─────────────────────────────────────────────────────────────── */
function initFirebase() {
  const fb = window.__firebaseModules;
  if (!fb || !state.firebaseConfig?.projectId) return;

  const app = fb.initializeApp(state.firebaseConfig);
  const auth = fb.getAuth(app);
  const db = fb.getFirestore(app);

  // Auth state listener
  fb.onAuthStateChanged(auth, (user) => {
    state.user = user;
    updateAuthButton(user);
  });

  // Auth button handler
  $('auth-btn').addEventListener('click', async () => {
    if (state.user) {
      await fb.signOut(auth);
      showToast('Signed out successfully');
    } else {
      const provider = new fb.GoogleAuthProvider();
      try {
        await fb.signInWithPopup(auth, provider);
        showToast('Welcome to SmartStadium AI! 🏟️');
      } catch (err) {
        showToast('Sign-in failed. Please try again.');
      }
    }
  });

  // Firestore real-time zone updates (replaces polling)
  try {
    const zonesCol = fb.collection(db, 'zones');
    fb.onSnapshot(zonesCol, (snapshot) => {
      const zones = [];
      snapshot.forEach((doc) => zones.push({ id: doc.id, ...doc.data() }));
      if (zones.length > 0) {
        state.zones = zones;
        renderZones(zones);
        updateStats(zones, state.gates);
      }
    });
  } catch {
    // Firebase not configured — fall back to WebSocket data
  }
}

function updateAuthButton(user) {
  const btn = $('auth-btn');
  const label = $('auth-btn-label');
  if (user) {
    label.textContent = user.displayName?.split(' ')[0] || 'Account';
    btn.setAttribute('aria-label', `Signed in as ${user.displayName}. Click to sign out.`);
  } else {
    label.textContent = 'Sign In';
    btn.setAttribute('aria-label', 'Sign in with Google');
  }
}

/* ───────────────────────────────────────────────────────────────
   WebSocket — real-time crowd data
─────────────────────────────────────────────────────────────── */
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    $('banner-text').textContent = 'Live — crowd data syncing';
    $('live-dot').style.background = 'var(--color-accent)';
  });

  ws.addEventListener('message', (event) => {
    // Efficiency: Ignore updates if tab is backgrounded
    if (!isPageVisible) return;

    try {
      const data = JSON.parse(event.data);
      if (data.type === 'crowd-update') {
        state.zones = data.zones;
        state.gates = data.gates;
        renderZones(data.zones);
        renderGates(data.gates);
        updateStats(data.zones, data.gates);
        updateBanner(data.zones);
        if (state.heatmap) updateHeatmap(data.zones);
      }
    } catch {}
  });

  ws.addEventListener('close', () => {
    $('banner-text').textContent = 'Reconnecting…';
    setTimeout(connectWebSocket, 3000);
  });

  ws.addEventListener('error', () => ws.close());
}

/* ───────────────────────────────────────────────────────────────
   Render: Zones
─────────────────────────────────────────────────────────────── */
function renderZones(zones) {
  const container = $('zone-list');
  container.innerHTML = zones
    .sort((a, b) => b.density - a.density)
    .map(
      (z) => `
      <div class="zone-row" role="listitem">
        <span class="zone-name">${formatZoneName(z.id)}</span>
        <div class="zone-bar-wrap" aria-label="${z.density}% full">
          <div class="zone-bar">
            <div class="zone-bar-fill ${z.alertLevel}" style="width:${z.density}%" role="progressbar" aria-valuenow="${z.density}" aria-valuemin="0" aria-valuemax="100" aria-label="${formatZoneName(z.id)} crowd density ${z.density}%"></div>
          </div>
        </div>
        <span class="zone-density">${z.density}%</span>
        <span class="alert-badge ${z.alertLevel}">${z.alertLevel}</span>
      </div>`
    )
    .join('');

  // Trigger critical alert for assertive screen-reader announcement
  const criticalZones = zones.filter((z) => z.alertLevel === 'critical');
  const alertBar = $('critical-alert');
  if (criticalZones.length > 0) {
    alertBar.textContent = `⚠ Alert: ${criticalZones.map((z) => formatZoneName(z.id)).join(', ')} ${criticalZones.length === 1 ? 'is' : 'are'} at critical capacity. Please move to an alternate area.`;
    alertBar.classList.remove('hidden');
  } else {
    alertBar.classList.add('hidden');
  }

  // Update recommendation
  fetchRecommendation();
}

/* ───────────────────────────────────────────────────────────────
   Render: Gates
─────────────────────────────────────────────────────────────── */
function renderGates(gates) {
  const container = $('gates-list');
  const bestGate = gates.filter((g) => g.isOpen).sort((a, b) => a.waitTime - b.waitTime)[0];

  container.innerHTML = gates
    .sort((a, b) => a.waitTime - b.waitTime)
    .map((g) => {
      const isBest = g.gateId === bestGate?.gateId;
      const waitColor = g.waitTime <= 2 ? 'color:var(--color-accent)' : g.waitTime <= 6 ? 'color:var(--color-warning)' : 'color:var(--color-danger)';
      return `
        <div class="gate-card ${isBest ? 'best-gate' : ''} ${!g.isOpen ? 'gate-closed' : ''}" role="listitem" aria-label="${g.gateId.replace('-', ' ')} — ${g.waitTime} minute wait${isBest ? ' — recommended' : ''}${!g.isOpen ? ' — closed' : ''}">
          <span class="gate-icon" aria-hidden="true">${g.isOpen ? (isBest ? '✅' : '🚪') : '🔒'}</span>
          <div class="gate-info">
            <div class="gate-id">${g.gateId.replace('gate-', 'Gate ').toUpperCase()}</div>
            <div class="gate-queue">${g.queueLength} fans waiting${isBest ? ' — Best choice!' : ''}</div>
          </div>
          <div>
            <div class="gate-wait" style="${waitColor}">${g.isOpen ? g.waitTime + 'm' : '—'}</div>
            <div class="gate-wait-label">wait time</div>
          </div>
        </div>`;
    })
    .join('');

  const ts = new Date().toLocaleTimeString();
  $('gates-updated').textContent = `Updated at ${ts}`;
}

/* ───────────────────────────────────────────────────────────────
   Stats
─────────────────────────────────────────────────────────────── */
function updateStats(zones, gates) {
  const totalFans = zones.reduce((s, z) => s + (z.count || 0), 0);
  const avgDensity = Math.round(zones.reduce((s, z) => s + z.density, 0) / zones.length);
  const bestWait = Math.min(...(gates || []).filter((g) => g.isOpen).map((g) => g.waitTime));
  const alertCount = zones.filter((z) => z.alertLevel !== 'normal').length;

  $('stat-total').textContent = totalFans.toLocaleString();
  $('stat-density').textContent = avgDensity + '%';
  $('stat-wait').textContent = isFinite(bestWait) ? bestWait + ' min' : '—';
  $('stat-alerts').textContent = alertCount;

  animateBar('bar-total', Math.min(100, (totalFans / 43500) * 100));
  animateBar('bar-density', avgDensity);

  $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function animateBar(id, pct) {
  const el = $(id);
  if (el) el.style.width = pct + '%';
}

function updateBanner(zones) {
  const critical = zones.filter((z) => z.alertLevel === 'critical');
  const warning = zones.filter((z) => z.alertLevel === 'warning');
  if (critical.length > 0) {
    $('banner-text').textContent = `⚠ ${critical.length} zone${critical.length > 1 ? 's' : ''} at critical capacity`;
  } else if (warning.length > 0) {
    $('banner-text').textContent = `${warning.length} zone${warning.length > 1 ? 's' : ''} near capacity`;
  } else {
    $('banner-text').textContent = 'Stadium conditions are comfortable';
  }
}

/* ───────────────────────────────────────────────────────────────
   Gate recommendation
─────────────────────────────────────────────────────────────── */
async function fetchRecommendation() {
  try {
    const res = await fetch('/api/crowd/recommendation');
    if (!res.ok) return;
    const rec = await res.json();
    state.recommendation = rec;

    $('gate-recommendation').innerHTML = `
      <div class="rec-gate">
        <span style="font-size:1.5rem" aria-hidden="true">🚪</span>
        <div>
          <div class="rec-gate-name">${rec.gateId.replace('gate-', 'Gate ').toUpperCase()}</div>
          <div class="rec-gate-wait">${rec.waitTime} min estimated wait</div>
        </div>
        <span class="rec-badge">Best</span>
      </div>
      <p class="rec-gate-reason">${rec.reason}</p>`;
  } catch {
    $('gate-recommendation').textContent = 'Recommendation unavailable';
  }
}

/* ───────────────────────────────────────────────────────────────
   Google Maps (lazy loaded when Map tab activated)
─────────────────────────────────────────────────────────────── */
async function initMap() {
  if (state.mapsLoaded) return;
  const apiKey = state.firebaseConfig?.mapsApiKey;
  if (!apiKey) {
    $('stadium-map').innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.875rem;">Google Maps API key not configured</div>`;
    return;
  }

  try {
    const { Map } = await google.maps.importLibrary('maps');
    const { Marker } = await google.maps.importLibrary('marker');
    const { HeatmapLayer } = await google.maps.importLibrary('visualization');

    // M. Chinnaswamy Stadium, Bengaluru
    const STADIUM = { lat: 12.9784, lng: 77.5994 };

    state.map = new Map($('stadium-map'), {
      center: STADIUM,
      zoom: 17,
      mapId: 'SMART_STADIUM_MAP', // Required for advanced markers
      mapTypeId: 'satellite',
      mapTypeControl: false,
      streetViewControl: false,
    });

    // Gate markers
    const gates = [
      { id: 'gate-a', pos: { lat: 12.9790, lng: 77.5990 }, label: 'Gate A' },
      { id: 'gate-b', pos: { lat: 12.9788, lng: 77.5999 }, label: 'Gate B' },
      { id: 'gate-c', pos: { lat: 12.9780, lng: 77.5998 }, label: 'Gate C' },
      { id: 'gate-d', pos: { lat: 12.9778, lng: 77.5990 }, label: 'Gate D' },
    ];

    gates.forEach((g) => {
      const marker = new Marker({
        position: g.pos,
        map: state.map,
        title: g.label,
        label: { text: g.label.replace('Gate ', ''), color: '#fff', fontWeight: 'bold' },
      });
      state.markers.push(marker);
    });

    // Crowd heat map overlay
    const heatmapData = buildHeatmapData(state.zones);
    state.heatmap = new HeatmapLayer({
      data: heatmapData,
      map: state.map,
      radius: 60,
      gradient: [
        'rgba(0, 212, 170, 0)',
        'rgba(0, 212, 170, 0.6)',
        'rgba(255, 183, 3, 0.7)',
        'rgba(255, 77, 109, 0.9)',
      ],
    });

    // Map chip controls
    $('btn-heatmap').addEventListener('click', () => toggleHeatmap());
    $('btn-gates-overlay').addEventListener('click', () => toggleMarkersVisibility());

    // Directions
    $('get-directions-btn').addEventListener('click', () => getDirections());
  } catch (err) {
    $('stadium-map').innerHTML = `<div style="padding:1rem;color:var(--text-secondary)">Map failed to load: ${err.message}</div>`;
  }
}

function buildHeatmapData(zones) {
  const ZONE_COORDS = {
    'north-stand': { lat: 12.9790, lng: 77.5994 },
    'south-stand': { lat: 12.9778, lng: 77.5994 },
    'east-stand':  { lat: 12.9784, lng: 77.6000 },
    'west-stand':  { lat: 12.9784, lng: 77.5988 },
  };
  return zones
    .filter((z) => ZONE_COORDS[z.id])
    .map((z) => ({ location: new google.maps.LatLng(ZONE_COORDS[z.id]), weight: z.density / 100 }));
}

function updateHeatmap(zones) {
  if (!state.heatmap) return;
  state.heatmap.setData(buildHeatmapData(zones));
}

function toggleHeatmap() {
  if (!state.heatmap) return;
  const visible = state.heatmap.getMap();
  state.heatmap.setMap(visible ? null : state.map);
  const btn = $('btn-heatmap');
  btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', String(!visible));
}

function toggleMarkersVisibility() {
  const btn = $('btn-gates-overlay');
  const isVisible = btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', String(isVisible));
  state.markers.forEach((m) => m.setVisible(isVisible));
}

async function getDirections() {
  const origin = $('origin-input').value.trim();
  if (!origin) { showToast('Please enter your current location'); return; }
  if (!state.map) { showToast('Map is not loaded yet'); return; }

  const rec = state.recommendation;
  const dest = rec ? `Gate ${rec.gateId.replace('gate-', '')} Chinnaswamy Stadium Bengaluru` : 'Chinnaswamy Stadium Gate';

  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({ map: state.map });

  try {
    const result = await directionsService.route({
      origin: `${origin}, Bangalore`,
      destination: dest,
      travelMode: google.maps.TravelMode.WALKING,
    });
    directionsRenderer.setDirections(result);
    const leg = result.routes[0].legs[0];
    $('directions-result').innerHTML = `<strong>🚶 ${leg.duration.text} walk</strong> (${leg.distance.text}) to your recommended gate.`;
  } catch {
    $('directions-result').textContent = 'Could not calculate directions. Ensure your location is accurate.';
  }
}

/* ───────────────────────────────────────────────────────────────
   Tab navigation (full keyboard support)
─────────────────────────────────────────────────────────────── */
const TABS = [
  { btn: 'tab-home',  panel: 'panel-home' },
  { btn: 'tab-map',   panel: 'panel-map' },
  { btn: 'tab-gates', panel: 'panel-gates' },
  { btn: 'tab-ai',    panel: 'panel-ai' },
];

function setupTabs() {
  TABS.forEach(({ btn, panel }, idx) => {
    const btnEl = $(btn);

    btnEl.addEventListener('click', () => activateTab(idx));

    // Arrow key navigation (ARIA tabs pattern)
    btnEl.addEventListener('keydown', (e) => {
      let next = idx;
      if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = TABS.length - 1;
      else return;
      e.preventDefault();
      activateTab(next);
      $(TABS[next].btn).focus();
    });
  });
}

function activateTab(activeIdx) {
  TABS.forEach(({ btn, panel }, idx) => {
    const isActive = idx === activeIdx;
    $(btn).classList.toggle('active', isActive);
    $(btn).setAttribute('aria-selected', String(isActive));
    $(btn).tabIndex = isActive ? 0 : -1;
    const panelEl = $(panel);
    panelEl.hidden = !isActive;
    if (isActive) panelEl.removeAttribute('hidden');
  });

  // Lazy-load Google Maps only when map tab is opened
  if (activeIdx === 1) initMap();
}

/* ───────────────────────────────────────────────────────────────
   High-contrast mode
─────────────────────────────────────────────────────────────── */
function setupContrastToggle() {
  const btn = $('contrast-toggle');
  btn.addEventListener('click', () => {
    const isHC = document.body.dataset.theme === 'high-contrast';
    document.body.dataset.theme = isHC ? 'dark' : 'high-contrast';
    btn.setAttribute('aria-pressed', String(!isHC));
    localStorage.setItem('ss-theme', document.body.dataset.theme);
  });

  // Restore preference
  const saved = localStorage.getItem('ss-theme');
  if (saved) {
    document.body.dataset.theme = saved;
    btn.setAttribute('aria-pressed', String(saved === 'high-contrast'));
  }
}

/* ───────────────────────────────────────────────────────────────
   AI Chat — Gemini streaming
─────────────────────────────────────────────────────────────── */
function setupChatForm() {
  $('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const query = input.value.trim();
    if (!query) return;
    input.value = '';
    
    // Debounce preventing accidental double-submits
    if (state.isAITyping) return;
    
    await sendChatMessage(query);
  });
}

function setupQuickPrompts() {
  document.querySelectorAll('.quick-prompt').forEach((btn) => {
    btn.addEventListener('click', () => sendChatMessage(btn.dataset.prompt));
  });
}

async function sendChatMessage(query) {
  appendChatMessage('user', query);
  const typingEl = showTypingIndicator();
  const sendBtn = $('chat-send');
  sendBtn.disabled = true;
  state.isAITyping = true;

  // Streaming via SSE
  try {
    const response = await fetch('/api/gemini/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    typingEl.remove();
    const bubbleEl = appendChatMessage('assistant', '');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') break;
        try {
          const { chunk } = JSON.parse(payload);
          if (chunk) {
            bubbleEl.textContent += chunk;
            scrollChatToBottom();
          }
        } catch {}
      }
    }
  } catch (err) {
    typingEl.remove();
    appendChatMessage('assistant', 'Sorry, I could not get a response right now. Please try again.');
  } finally {
    state.isAITyping = false;
    sendBtn.disabled = false;
    $('chat-input').focus();
  }
}

function appendChatMessage(role, text) {
  const container = $('chat-messages');
  const msg = document.createElement('div');
  msg.className = `chat-message ${role}`;
  msg.setAttribute('role', 'article');
  msg.setAttribute('aria-label', `${role === 'user' ? 'You' : 'AI assistant'}: ${text}`);

  msg.innerHTML = `
    <div class="chat-avatar" aria-hidden="true">${role === 'user' ? '👤' : '✨'}</div>
    <div class="chat-bubble">${escapeHtml(text)}</div>`;
  container.appendChild(msg);
  scrollChatToBottom();
  return msg.querySelector('.chat-bubble');
}

function showTypingIndicator() {
  const container = $('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-message assistant';
  el.setAttribute('aria-label', 'AI is typing');
  el.innerHTML = `<div class="chat-avatar" aria-hidden="true">✨</div><div class="chat-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  container.appendChild(el);
  scrollChatToBottom();
  return el;
}

function scrollChatToBottom() {
  const c = $('chat-messages');
  c.scrollTop = c.scrollHeight;
}

/* ───────────────────────────────────────────────────────────────
   Utilities
─────────────────────────────────────────────────────────────── */
function formatZoneName(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, duration = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

/* ───────────────────────────────────────────────────────────────
   Boot
─────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
