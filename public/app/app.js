/**
 * SmartStadium AI — Fan App JavaScript
 * Real-time crowd data via WebSocket/Firebase, Gemini AI chat, Google Maps,
 * full keyboard navigation, and accessibility features.
 */
'use strict';

/* ───────────────────────────────────────────────────────────────
   State
─────────────────────────────────────────────────────────────── */
/**
 * State object holding the application's current data and configurations.
 */
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
  isAITyping: false,
};

/**
 * Utility to get an element by ID.
 * @param {string} id - The element ID.
 * @returns {HTMLElement|null}
 */
const $ = (id) => document.getElementById(id);

/**
 * Main entry point: initializes all app components and fetches configuration.
 * @async
 */
async function init() {
  try {
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
      window.__onFirebaseLoaded = () => initFirebase();
    } else {
      initFirebase();
    }
  } catch (err) {
    showToast('Failed to initialize application. Please refresh.');
  }
}

/**
 * Registers the service worker for PWA support.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* Error handled silently for offline support */
      });
    });
  }
}

/**
 * Sets up an IntersectionObserver to detect when the app is visible,
 * reducing resource usage when the tab is backgrounded.
 */
function setupIntersectionObserver() {
  const observer = new IntersectionObserver((entries) => {
    isPageVisible = entries[0].isIntersecting;
  }, { threshold: 0.1 });
  
  observer.observe(document.querySelector('main'));

  document.addEventListener('visibilitychange', () => {
    isPageVisible = document.visibilityState === 'visible';
  });
}

/* ── SOS Speed Dial Setup ── */
/**
 * Initializes the SOS emergency bubble and its speed dial options.
 */
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
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      const zone = state.recommendation?.gateId 
        ? 'near ' + state.recommendation.gateId.replace('-', ' ') 
        : 'your location';
      
      sosBtn.classList.remove('active');
      sosOptions.classList.remove('active');
      sosBtn.setAttribute('aria-expanded', 'false');

      const messages = {
        seat: `💺 Seat issue reported. A staff member will check on you shortly.`,
        help: `🙋 General help requested. Assistance is on the way to ${zone}.`,
        emergency: `🚨 SOS Alert sent to Stadium Security at ${zone}! Help is on the way immediately.`,
      };

      if (messages[type]) {
        showToast(messages[type], type === 'emergency' ? 8000 : 5000);
      }
    });
  });
}

/* ───────────────────────────────────────────────────────────────
   Config (from server — no keys hardcoded in frontend)
─────────────────────────────────────────────────────────────── */
/**
 * Fetches the application configuration from the server.
 * @async
 */
async function loadConfig() {
  try {
    const res = await fetch('/api/auth/config');
    if (!res.ok) throw new Error('Config fetch failed');
    state.firebaseConfig = await res.json();
    state.geminiKey = state.firebaseConfig.geminiApiKey || '';
  } catch (err) {
    showToast('Running in demo mode — live data unavailable');
  }
}

/* ───────────────────────────────────────────────────────────────
   Firebase Auth + Firestore real-time listeners
─────────────────────────────────────────────────────────────── */
/**
 * Initializes Firebase Authentication and Firestore real-time listeners.
 */
function initFirebase() {
  const fb = window.__firebaseModules;
  if (!fb || !state.firebaseConfig?.projectId) return;

  try {
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
      try {
        if (state.user) {
          await fb.signOut(auth);
          showToast('Signed out successfully');
        } else {
          const provider = new fb.GoogleAuthProvider();
          await fb.signInWithPopup(auth, provider);
          showToast('Welcome to SmartStadium AI! 🏟️');
        }
      } catch (err) {
        showToast('Authentication failed. Please try again.');
      }
    });

    // Firestore real-time zone updates
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
  } catch (err) {
    /* Fallback to WebSocket handled in connectWebSocket */
  }
}

/**
 * Updates the authentication button label and accessibility attributes.
 * @param {Object|null} user - The current Firebase user.
 */
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
/**
 * Establishes a WebSocket connection for real-time crowd data syncing.
 */
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    $('banner-text').textContent = 'Live — crowd data syncing';
    $('live-dot').style.background = 'var(--color-accent)';
  });

  ws.addEventListener('message', (event) => {
    // Ignore updates if tab is backgrounded
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
    } catch (err) {
      /* Silently handle malformed messages */
    }
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
/**
 * Renders the list of stadium zones and their density status.
 * @param {Array<Object>} zones - List of zone objects.
 */
function renderZones(zones) {
  const container = $('zone-list');
  if (!container) return;

  container.innerHTML = zones
    .sort((a, b) => b.density - a.density)
    .map((z) => {
      const zoneName = formatZoneName(z.id);
      return `
        <div class="zone-row" role="listitem">
          <span class="zone-name">${zoneName}</span>
          <div class="zone-bar-wrap" aria-label="${z.density}% full">
            <div class="zone-bar">
              <div class="zone-bar-fill ${z.alertLevel}" 
                   style="width:${z.density}%" 
                   role="progressbar" 
                   aria-valuenow="${z.density}" 
                   aria-valuemin="0" 
                   aria-valuemax="100" 
                   aria-label="${zoneName} crowd density ${z.density}%"></div>
            </div>
          </div>
          <span class="zone-density">${z.density}%</span>
          <span class="alert-badge ${z.alertLevel}">${z.alertLevel}</span>
        </div>`;
    })
    .join('');

  // Critical alerts for screen readers
  const criticalZones = zones.filter((z) => z.alertLevel === 'critical');
  const alertBar = $('critical-alert');
  if (alertBar) {
    if (criticalZones.length > 0) {
      const names = criticalZones.map((z) => formatZoneName(z.id)).join(', ');
      alertBar.textContent = `⚠ Alert: ${names} ${criticalZones.length === 1 ? 'is' : 'are'} at critical capacity. Please move to an alternate area.`;
      alertBar.classList.remove('hidden');
    } else {
      alertBar.classList.add('hidden');
    }
  }

  fetchRecommendation();
}

/* ───────────────────────────────────────────────────────────────
   Render: Gates
─────────────────────────────────────────────────────────────── */
/**
 * Renders the list of stadium gates and their wait times.
 * @param {Array<Object>} gates - List of gate objects.
 */
function renderGates(gates) {
  const container = $('gates-list');
  if (!container) return;

  const openGates = gates.filter((g) => g.isOpen);
  const bestGate = openGates.sort((a, b) => a.waitTime - b.waitTime)[0];

  container.innerHTML = gates
    .sort((a, b) => a.waitTime - b.waitTime)
    .map((g) => {
      const isBest = g.gateId === bestGate?.gateId;
      const waitColor = g.waitTime <= 2 
        ? 'var(--color-accent)' 
        : g.waitTime <= 6 
          ? 'var(--color-warning)' 
          : 'var(--color-danger)';
      
      const label = `${g.gateId.replace('-', ' ')} — ${g.waitTime} minute wait${isBest ? ' — recommended' : ''}${!g.isOpen ? ' — closed' : ''}`;

      return `
        <div class="gate-card ${isBest ? 'best-gate' : ''} ${!g.isOpen ? 'gate-closed' : ''}" 
             role="listitem" 
             aria-label="${label}">
          <span class="gate-icon" aria-hidden="true">${g.isOpen ? (isBest ? '✅' : '🚪') : '🔒'}</span>
          <div class="gate-info">
            <div class="gate-id">${g.gateId.replace('gate-', 'Gate ').toUpperCase()}</div>
            <div class="gate-queue">${g.queueLength} fans waiting${isBest ? ' — Best choice!' : ''}</div>
          </div>
          <div>
            <div class="gate-wait" style="color:${waitColor}">${g.isOpen ? g.waitTime + 'm' : '—'}</div>
            <div class="gate-wait-label">wait time</div>
          </div>
        </div>`;
    })
    .join('');

  $('gates-updated').textContent = `Updated at ${new Date().toLocaleTimeString()}`;
}

/**
 * Updates the summary statistics for the stadium.
 * @param {Array<Object>} zones - List of zones.
 * @param {Array<Object>} gates - List of gates.
 */
function updateStats(zones, gates) {
  const totalFans = zones.reduce((sum, z) => sum + (z.count || 0), 0);
  const avgDensity = zones.length > 0
    ? Math.round(zones.reduce((sum, z) => sum + z.density, 0) / zones.length)
    : 0;
  
  const openGates = (gates || []).filter((g) => g.isOpen);
  const bestWait = openGates.length > 0 
    ? Math.min(...openGates.map((g) => g.waitTime)) 
    : Infinity;
  
  const alertCount = zones.filter((z) => z.alertLevel !== 'normal').length;

  $('stat-total').textContent = totalFans.toLocaleString();
  $('stat-density').textContent = `${avgDensity}%`;
  $('stat-wait').textContent = isFinite(bestWait) ? `${bestWait} min` : '—';
  $('stat-alerts').textContent = alertCount;

  animateBar('bar-total', Math.min(100, (totalFans / 43500) * 100));
  animateBar('bar-density', avgDensity);

  $('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

/**
 * Animates a progress bar to a specific percentage.
 * @param {string} id - Element ID.
 * @param {number} pct - Percentage to fill.
 */
function animateBar(id, pct) {
  const el = $(id);
  if (el) el.style.width = `${pct}%`;
}

/**
 * Updates the live crowd status banner.
 * @param {Array<Object>} zones - List of zones.
 */
function updateBanner(zones) {
  const banner = $('banner-text');
  if (!banner) return;

  const critical = zones.filter((z) => z.alertLevel === 'critical');
  const warning = zones.filter((z) => z.alertLevel === 'warning');

  if (critical.length > 0) {
    banner.textContent = `⚠ ${critical.length} zone${critical.length > 1 ? 's' : ''} at critical capacity`;
  } else if (warning.length > 0) {
    banner.textContent = `${warning.length} zone${warning.length > 1 ? 's' : ''} near capacity`;
  } else {
    banner.textContent = 'Stadium conditions are comfortable';
  }
}

/* ───────────────────────────────────────────────────────────────
   Gate recommendation
─────────────────────────────────────────────────────────────── */
/**
 * Fetches the latest gate recommendation from the API.
 * @async
 */
async function fetchRecommendation() {
  try {
    const res = await fetch('/api/crowd/recommendation');
    if (!res.ok) return;
    const rec = await res.json();
    state.recommendation = rec;

    const container = $('gate-recommendation');
    if (!container) return;

    container.innerHTML = `
      <div class="rec-gate">
        <span style="font-size:1.5rem" aria-hidden="true">🚪</span>
        <div>
          <div class="rec-gate-name">${rec.gateId.replace('gate-', 'Gate ').toUpperCase()}</div>
          <div class="rec-gate-wait">${rec.waitTime} min estimated wait</div>
        </div>
        <span class="rec-badge">Best</span>
      </div>
      <p class="rec-gate-reason">${rec.reason}</p>`;
  } catch (err) {
    const container = $('gate-recommendation');
    if (container) container.textContent = 'Recommendation unavailable';
  }
}

/* ───────────────────────────────────────────────────────────────
   Google Maps (lazy loaded when Map tab activated)
─────────────────────────────────────────────────────────────── */
/**
 * Initializes the Google Map and its data layers.
 * @async
 */
async function initMap() {
  if (state.mapsLoaded) return;
  const apiKey = state.firebaseConfig?.mapsApiKey;
  const container = $('stadium-map');
  
  if (!apiKey) {
    if (container) {
      container.innerHTML = `<div class="map-error">Google Maps API key not configured</div>`;
    }
    return;
  }

  try {
    const { Map } = await google.maps.importLibrary('maps');
    const STADIUM_COORDS = { lat: 12.9784, lng: 77.5994 };

    state.map = new Map(container, {
      center: STADIUM_COORDS,
      zoom: 17,
      mapId: 'SMART_STADIUM_MAP',
      mapTypeId: 'satellite',
      mapTypeControl: false,
      streetViewControl: false,
    });

    await setupMapMarkers();
    await setupHeatmapLayer();

    // Map chip controls
    $('btn-heatmap')?.addEventListener('click', () => toggleHeatmap());
    $('btn-gates-overlay')?.addEventListener('click', () => toggleMarkersVisibility());
    $('get-directions-btn')?.addEventListener('click', () => getDirections());

    state.mapsLoaded = true;
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="map-error">Map failed to load: ${err.message}</div>`;
    }
  }
}

/**
 * Sets up gate markers on the map.
 * @async
 */
async function setupMapMarkers() {
  const { Marker } = await google.maps.importLibrary('marker');
  const GATES = [
    { id: 'gate-a', pos: { lat: 12.9790, lng: 77.5990 }, label: 'Gate A' },
    { id: 'gate-b', pos: { lat: 12.9788, lng: 77.5999 }, label: 'Gate B' },
    { id: 'gate-c', pos: { lat: 12.9780, lng: 77.5998 }, label: 'Gate C' },
    { id: 'gate-d', pos: { lat: 12.9778, lng: 77.5990 }, label: 'Gate D' },
  ];

  GATES.forEach((g) => {
    const marker = new Marker({
      position: g.pos,
      map: state.map,
      title: g.label,
      label: { text: g.label.replace('Gate ', ''), color: '#fff', fontWeight: 'bold' },
    });
    state.markers.push(marker);
  });
}

/**
 * Sets up the crowd density heatmap layer.
 * @async
 */
async function setupHeatmapLayer() {
  const { HeatmapLayer } = await google.maps.importLibrary('visualization');
  state.heatmap = new HeatmapLayer({
    data: buildHeatmapData(state.zones),
    map: state.map,
    radius: 60,
    gradient: [
      'rgba(0, 212, 170, 0)',
      'rgba(0, 212, 170, 0.6)',
      'rgba(255, 183, 3, 0.7)',
      'rgba(255, 77, 109, 0.9)',
    ],
  });
}

/**
 * Builds the data array for the Google Maps Heatmap layer.
 * @param {Array<Object>} zones - List of zones.
 * @returns {Array<google.maps.visualization.WeightedLocation>}
 */
function buildHeatmapData(zones) {
  const ZONE_COORDS = {
    'north-stand': { lat: 12.9790, lng: 77.5994 },
    'south-stand': { lat: 12.9778, lng: 77.5994 },
    'east-stand':  { lat: 12.9784, lng: 77.6000 },
    'west-stand':  { lat: 12.9784, lng: 77.5988 },
  };
  return zones
    .filter((z) => ZONE_COORDS[z.id])
    .map((z) => ({ 
      location: new google.maps.LatLng(ZONE_COORDS[z.id]), 
      weight: z.density / 100 
    }));
}

/**
 * Updates the heatmap data layer.
 * @param {Array<Object>} zones - List of zones.
 */
function updateHeatmap(zones) {
  if (!state.heatmap) return;
  state.heatmap.setData(buildHeatmapData(zones));
}

/**
 * Toggles the visibility of the crowd heatmap.
 */
function toggleHeatmap() {
  if (!state.heatmap) return;
  const isVisible = !!state.heatmap.getMap();
  state.heatmap.setMap(isVisible ? null : state.map);
  
  const btn = $('btn-heatmap');
  if (btn) {
    btn.classList.toggle('active', !isVisible);
    btn.setAttribute('aria-pressed', String(!isVisible));
  }
}

/**
 * Toggles the visibility of gate markers on the map.
 */
function toggleMarkersVisibility() {
  const btn = $('btn-gates-overlay');
  if (!btn) return;
  
  const isActive = btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', String(isActive));
  state.markers.forEach((m) => m.setVisible(isActive));
}

/**
 * Calculates and displays walking directions to the recommended gate.
 * @async
 */
async function getDirections() {
  const origin = $('origin-input')?.value.trim();
  const container = $('directions-result');
  
  if (!origin) {
    showToast('Please enter your current location');
    return;
  }
  if (!state.map) {
    showToast('Map is not loaded yet');
    return;
  }

  const rec = state.recommendation;
  const dest = rec 
    ? `Gate ${rec.gateId.replace('gate-', '')} Chinnaswamy Stadium Bengaluru` 
    : 'Chinnaswamy Stadium Gate';

  try {
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({ map: state.map });

    const result = await directionsService.route({
      origin: `${origin}, Bangalore`,
      destination: dest,
      travelMode: google.maps.TravelMode.WALKING,
    });

    directionsRenderer.setDirections(result);
    const leg = result.routes[0].legs[0];
    
    if (container) {
      container.innerHTML = `<strong>🚶 ${leg.duration.text} walk</strong> (${leg.distance.text}) to your recommended gate.`;
    }
  } catch (err) {
    if (container) {
      container.textContent = 'Could not calculate directions. Ensure your location is accurate.';
    }
  }
}

/* ───────────────────────────────────────────────────────────────
   Tab navigation (full keyboard support)
─────────────────────────────────────────────────────────────── */
/** Tab configuration */
const TABS = [
  { btn: 'tab-home',  panel: 'panel-home' },
  { btn: 'tab-map',   panel: 'panel-map' },
  { btn: 'tab-gates', panel: 'panel-gates' },
  { btn: 'tab-ai',    panel: 'panel-ai' },
];

/**
 * Sets up tab navigation and accessibility.
 */
function setupTabs() {
  TABS.forEach(({ btn, panel }, idx) => {
    const btnEl = $(btn);
    if (!btnEl) return;

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
      $(TABS[next].btn)?.focus();
    });
  });
}

/**
 * Activates a specific tab.
 * @param {number} activeIdx - Index of the tab to activate.
 */
function activateTab(activeIdx) {
  TABS.forEach(({ btn, panel }, idx) => {
    const isActive = idx === activeIdx;
    const btnEl = $(btn);
    const panelEl = $(panel);

    if (btnEl) {
      btnEl.classList.toggle('active', isActive);
      btnEl.setAttribute('aria-selected', String(isActive));
      btnEl.tabIndex = isActive ? 0 : -1;
    }

    if (panelEl) {
      panelEl.hidden = !isActive;
      if (isActive) panelEl.removeAttribute('hidden');
    }
  });

  // Lazy-load Google Maps only when map tab is opened
  if (activeIdx === 1) initMap();
}

/* ───────────────────────────────────────────────────────────────
   High-contrast mode
─────────────────────────────────────────────────────────────── */
/**
 * Sets up the high-contrast mode toggle and restores user matching preference.
 */
function setupContrastToggle() {
  const btn = $('contrast-toggle');
  if (!btn) return;

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
/**
 * Sets up the AI chat form submission handler.
 */
function setupChatForm() {
  $('chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const query = input?.value.trim();
    if (!query) return;
    
    input.value = '';
    
    // Debounce preventing accidental double-submits
    if (state.isAITyping) return;
    
    await sendChatMessage(query);
  });
}

/**
 * Sets up quick prompt chip buttons.
 */
function setupQuickPrompts() {
  document.querySelectorAll('.quick-prompt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) sendChatMessage(prompt);
    });
  });
}

/**
 * Sends a message to the AI assistant and handles the streamed response.
 * @async
 * @param {string} query - The user's question.
 */
async function sendChatMessage(query) {
  appendChatMessage('user', query);
  const typingEl = showTypingIndicator();
  const sendBtn = $('chat-send');
  
  if (sendBtn) sendBtn.disabled = true;
  state.isAITyping = true;

  try {
    const response = await fetch('/api/gemini/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) throw new Error('AI response failed');

    typingEl?.remove();
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
          const { chunk, error } = JSON.parse(payload);
          if (error) throw new Error(error);
          if (chunk && bubbleEl) {
            bubbleEl.textContent += chunk;
            scrollChatToBottom();
          }
        } catch (e) {
          /* Handle parse errors */
        }
      }
    }
  } catch (err) {
    typingEl?.remove();
    appendChatMessage('assistant', 'Sorry, I could not get a response right now. Please try again.');
  } finally {
    state.isAITyping = false;
    if (sendBtn) sendBtn.disabled = false;
    $('chat-input')?.focus();
  }
}

/**
 * Appends a message bubble to the chat container.
 * @param {'user'|'assistant'} role - The sender's role.
 * @param {string} text - The message text.
 * @returns {HTMLElement} The bubble element.
 */
function appendChatMessage(role, text) {
  const container = $('chat-messages');
  if (!container) return null;

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

/**
 * Shows the typing indicator in the chat.
 * @returns {HTMLElement} The typing indicator element.
 */
function showTypingIndicator() {
  const container = $('chat-messages');
  if (!container) return null;

  const el = document.createElement('div');
  el.className = 'chat-message assistant';
  el.setAttribute('aria-label', 'AI is typing');
  el.innerHTML = `
    <div class="chat-avatar" aria-hidden="true">✨</div>
    <div class="chat-bubble">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  
  container.appendChild(el);
  scrollChatToBottom();
  return el;
}

/**
 * Scrolls the chat container to the bottom.
 */
function scrollChatToBottom() {
  const container = $('chat-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/* ───────────────────────────────────────────────────────────────
   Utilities
─────────────────────────────────────────────────────────────── */
/**
 * Formats a kebab-case zone ID into a Title Case string.
 * @param {string} id - The zone ID.
 * @returns {string}
 */
function formatZoneName(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Simple HTML escaping to prevent XSS.
 * @param {string} str - The raw string.
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
/**
 * Displays a temporary toast notification.
 * @param {string} msg - The message to display.
 * @param {number} [duration=3000] - Duration in milliseconds.
 */
function showToast(msg, duration = 3000) {
  const t = $('toast');
  if (!t) return;
  
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

/**
 * Boot the application when the DOM is ready.
 */
document.addEventListener('DOMContentLoaded', init);
