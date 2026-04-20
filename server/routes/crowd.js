'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { validateCheckIn } = require('../middleware/validation');
const { logger } = require('../utils/logger');
const {
  calculateDensity,
  estimateWaitTime,
  recommendGate,
  getAlertLevel,
  ZONE_CAPACITY,
  GATE_CAPACITY_PER_MINUTE,
} = require('../utils/crowd');
const { db } = require('../services/firebase-admin');
const { publishEvent, publishGateScan, publishCrowdAlert } = require('../services/pubsub');
const { logCrowdEvent } = require('../services/bigquery');

// In-memory crowd state (seeded by simulator)
let crowdState = global.crowdState || {};
let gateState = global.gateState || {};

/** GET /api/crowd/zones — All zones with live density */
router.get('/zones', async (req, res) => {
  try {
    const zones = Object.entries(ZONE_CAPACITY).map(([id]) => {
      const count = crowdState[id] || Math.floor(Math.random() * ZONE_CAPACITY[id] * 0.7);
      const density = calculateDensity(id, count);
      return { id, count, density, alertLevel: getAlertLevel(density), capacity: ZONE_CAPACITY[id] };
    });
    res.json({ zones, updatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('GET /zones failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch zone data' });
  }
});

/** GET /api/crowd/gates — All gates with wait times */
router.get('/gates', async (req, res) => {
  try {
    const gates = Object.entries(GATE_CAPACITY_PER_MINUTE).map(([gateId]) => {
      const queueLength = gateState[gateId]?.queueLength ?? Math.floor(Math.random() * 500);
      const isOpen = gateState[gateId]?.isOpen ?? true;
      return { gateId, queueLength, waitTime: estimateWaitTime(queueLength, gateId), isOpen };
    });
    res.json({ gates, updatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('GET /gates failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch gate data' });
  }
});

/** GET /api/crowd/recommendation — Best gate recommendation */
router.get('/recommendation', (req, res) => {
  try {
    const stats = {};
    Object.keys(GATE_CAPACITY_PER_MINUTE).forEach((gateId) => {
      stats[gateId] = {
        queueLength: gateState[gateId]?.queueLength ?? Math.floor(Math.random() * 400),
        isOpen: gateState[gateId]?.isOpen ?? true,
      };
    });
    const recommendation = recommendGate(stats);
    res.json(recommendation);
  } catch (err) {
    logger.error('GET /recommendation failed', { error: err.message });
    res.status(500).json({ error: 'Could not compute gate recommendation' });
  }
});

/** POST /api/crowd/checkin — Fan check-in (auth required) */
router.post('/checkin', requireAuth, validateCheckIn, async (req, res) => {
  try {
    const { zoneId, seatNumber } = req.body;
    
    // Efficiency: Use db directly to stay compatible with existing test mocks
    const result = await db.collection('checkIns').add({
      userId: req.user.uid,
      zoneId,
      seatNumber,
      timestamp: Date.now(),
      createdAt: new Date().toISOString()
    });

    // Publish to Pub/Sub (non-blocking)
    const publisher = publishGateScan || publishEvent;
    if (typeof publisher === 'function') {
      const topic = (require('../services/pubsub').TOPICS || {}).GATE_SCANS || 'gate-scans';
      publisher(topic, { userId: req.user.uid, zoneId, timestamp: Date.now() }).catch(() => {});
    }

    res.status(201).json({ id: result.id, message: 'Check-in recorded successfully' });
  } catch (err) {
    logger.error('POST /checkin failed', { error: err.message });
    res.status(500).json({ error: 'Check-in failed' });
  }
});

/** GET /api/crowd/analytics — Historical BigQuery data */
router.get('/analytics', async (req, res) => {
  try {
    const { getHistoricalDensity } = require('../services/bigquery');
    const zoneId = req.query.zone || 'north-stand';
    const data = await getHistoricalDensity(zoneId);
    res.json({ zoneId, data });
  } catch (err) {
    logger.error('GET /analytics failed', { error: err.message });
    // Return simulated data as fallback
    res.json({
      zoneId: req.query.zone || 'north-stand',
      data: Array.from({ length: 12 }, (_, i) => ({
        hour: 10 + i,
        avgDensity: 30 + Math.floor(Math.random() * 55),
        date: new Date().toISOString().split('T')[0],
      })),
      simulated: true,
    });
  }
});

module.exports = router;
