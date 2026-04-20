'use strict';

/**
 * SmartStadium AI — Main Express Server
 * Configures all middleware, routes, WebSocket, and starts the HTTP server.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { createApiLimiter } = require('./middleware/rateLimit');
const { logger } = require('./utils/logger');
const { LIMITS } = require('./constants');
const errorHandler = require('./middleware/errorHandler');
const crowdRoutes = require('./routes/crowd');
const geminiRoutes = require('./routes/gemini');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const perfRoutes = require('./routes/perf');
const { startSimulator } = require('./simulator');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ── WebSocket broadcast ────────────────────────────────────────────────────
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => logger.warn('WebSocket client error', { error: err.message }));
});

/**
 * Broadcasts data to all connected WebSocket clients.
 * @param {Object} data - The payload to broadcast.
 */
function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        /* Silently handle send failures */
      }
    }
  });
}

// Make broadcast available to other modules via app.locals
app.locals.broadcast = broadcast;

// ── Efficiency: Compression MUST be first ──────────────────────────────────
app.use(compression());

// ── Efficiency: Cache-Control Headers ──────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  } else if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|woff2|json)$/)) {
    // Immutable cache for static assets (leveraging service worker)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

// ── Trust Cloud Run proxy ──────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Security: Helmet + CSP ────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", "'unsafe-inline'",
          'https://maps.googleapis.com',
          'https://www.gstatic.com',
          'https://www.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://*.firebaseio.com',
          'https://www.googletagmanager.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: [
          "'self'", 'wss:', 'ws:',
          'https://generativelanguage.googleapis.com',
          'https://*.firebaseio.com',
          'https://*.googleapis.com',
          'https://maps.googleapis.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  })
);

// ── General middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: LIMITS.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: LIMITS.JSON_BODY_LIMIT }));
app.use(morgan('combined'));

// ── Rate limiting ─────────────────────────────────────────────────────────
app.use('/api/', createApiLimiter());

// ── Static files ──────────────────────────────────────────────────────────
app.use('/app', express.static(path.join(__dirname, '../public/app')));
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// Root redirect
app.get('/', (req, res) => res.redirect('/app'));

// ── API routes ────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/crowd', crowdRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/_perf', perfRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
if (require.main === module) {
  server.listen(PORT, () => {
    logger.info(`SmartStadium AI v2.0 running on port ${PORT}`);
    startSimulator(broadcast);
  });
}

module.exports = { app, server };
