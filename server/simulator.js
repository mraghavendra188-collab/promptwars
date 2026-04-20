'use strict';

/**
 * SmartStadium AI — Crowd Data Simulator
 * Generates realistic, time-varying crowd data and broadcasts it via WebSocket.
 * Mirrors what Firestore onSnapshot() would deliver in production.
 */

const { calculateDensity, estimateWaitTime, getAlertLevel, ZONE_CAPACITY, GATE_CAPACITY_PER_MINUTE } = require('./utils/crowd');
const { logger } = require('./utils/logger');

// Initial "seeded" crowd state
const crowdState = {};
const gateState = {};

// Seed initial values
Object.keys(ZONE_CAPACITY).forEach((zoneId) => {
  crowdState[zoneId] = Math.floor(ZONE_CAPACITY[zoneId] * (0.3 + Math.random() * 0.4));
});
Object.keys(GATE_CAPACITY_PER_MINUTE).forEach((gateId) => {
  gateState[gateId] = { queueLength: Math.floor(Math.random() * 300), isOpen: true };
});

// Attach to global so routes can read them
global.crowdState = crowdState;
global.gateState = gateState;

/**
 * Evolve crowd state by ±5% of capacity each tick.
 */
function tick() {
  Object.entries(ZONE_CAPACITY).forEach(([zoneId, cap]) => {
    const delta = Math.floor(cap * 0.05 * (Math.random() - 0.48));
    crowdState[zoneId] = Math.max(0, Math.min(cap, (crowdState[zoneId] || 0) + delta));
  });

  Object.keys(GATE_CAPACITY_PER_MINUTE).forEach((gateId) => {
    const delta = Math.floor(Math.random() * 30) - 10;
    gateState[gateId].queueLength = Math.max(0, (gateState[gateId].queueLength || 0) + delta);
  });
}

/**
 * Build the full snapshot payload for WebSocket broadcast.
 */
function buildSnapshot() {
  const zones = Object.entries(ZONE_CAPACITY).map(([id, cap]) => {
    const count = crowdState[id] || 0;
    const density = calculateDensity(id, count);
    return { id, count, density, alertLevel: getAlertLevel(density), capacity: cap };
  });

  const gates = Object.entries(GATE_CAPACITY_PER_MINUTE).map(([gateId]) => ({
    gateId,
    queueLength: gateState[gateId]?.queueLength ?? 0,
    waitTime: estimateWaitTime(gateState[gateId]?.queueLength ?? 0, gateId),
    isOpen: gateState[gateId]?.isOpen ?? true,
  }));

  return { type: 'crowd-update', zones, gates, timestamp: Date.now() };
}

/**
 * Start the simulator loop.
 * @param {(payload: Object) => void} broadcast
 */
function startSimulator(broadcast) {
  logger.info('Crowd simulator started');
  setInterval(() => {
    tick();
    try { broadcast(buildSnapshot()); } catch {}
  }, 3000); // broadcast every 3 seconds
}

module.exports = { startSimulator, crowdState, gateState };
