'use strict';

/**
 * SmartStadium AI — Crowd Logic Utilities
 *
 * Core algorithms for crowd density calculation, wait-time estimation,
 * gate recommendation, and flow-rate analysis.
 * All functions are pure and fully unit-tested.
 */

const { ZONE_CAPACITY, GATE_CAPACITY, THRESHOLDS } = require('../constants');

/**
 * Calculate crowd density percentage for a zone.
 * @param {string} zoneId - Zone identifier (must exist in ZONE_CAPACITY)
 * @param {number} currentCount - Current number of people in the zone
 * @returns {number} Density percentage clamped to [0, 100]
 * @throws {Error} If zoneId is invalid or currentCount is negative
 */
function calculateDensity(zoneId, currentCount) {
  const capacity = ZONE_CAPACITY[zoneId];
  if (!capacity || capacity <= 0) throw new Error(`Invalid zone: ${zoneId}`);
  if (currentCount < 0) throw new Error('Crowd count cannot be negative');
  return Math.min(100, Math.round((currentCount / capacity) * 100));
}

/**
 * Estimate wait time at a gate based on queue length and throughput.
 * @param {number} queueLength - Number of people waiting
 * @param {string} gateId - Gate identifier (must exist in GATE_CAPACITY_PER_MINUTE)
 * @returns {number} Estimated wait time in minutes (ceiling)
 * @throws {Error} If gateId is invalid or queueLength is negative
 */
function estimateWaitTime(queueLength, gateId) {
  if (queueLength < 0) throw new Error('Queue length cannot be negative');
  const throughput = GATE_CAPACITY[gateId];
  if (!throughput) throw new Error(`Invalid gate: ${gateId}`);
  if (queueLength === 0) return 0;
  return Math.ceil(queueLength / throughput);
}

/**
 * Recommend the gate with the shortest estimated wait time.
 * @param {Object.<string, {queueLength: number, isOpen: boolean}>} gateStats
 * @returns {{ gateId: string, waitTime: number, reason: string }}
 * @throws {Error} If no gates are open
 */
function recommendGate(gateStats) {
  const openGates = Object.entries(gateStats)
    .filter(([, s]) => s.isOpen)
    .map(([gateId, s]) => ({
      gateId,
      waitTime: estimateWaitTime(s.queueLength, gateId),
      queueLength: s.queueLength,
    }))
    .sort((a, b) => a.waitTime - b.waitTime);

  if (openGates.length === 0) throw new Error('No gates are currently open');

  const best = openGates[0];
  const worst = openGates[openGates.length - 1];
  const timeSaved = worst.waitTime - best.waitTime;

  return {
    gateId: best.gateId,
    waitTime: best.waitTime,
    reason:
      timeSaved > 0
        ? `Save ${timeSaved} min vs ${worst.gateId} (${worst.waitTime} min wait)`
        : 'All gates have similar wait times',
  };
}

/**
 * Calculate crowd flow rate using a moving-window average.
 * @param {number[]} scanTimestamps - Unix timestamps (ms) of entry scans
 * @param {number} [windowMinutes=10] - Rolling window size in minutes
 * @returns {number} Flow rate in entries per minute
 */
function calculateFlowRate(scanTimestamps, windowMinutes = 10) {
  if (!Array.isArray(scanTimestamps) || scanTimestamps.length === 0) return 0;
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();
  const recent = scanTimestamps.filter((ts) => now - ts <= windowMs);
  return Math.round(recent.length / windowMinutes);
}

/**
 * Predict minutes until a zone reaches full capacity.
 * @param {string} zoneId - Zone identifier
 * @param {number} currentCount - Current occupancy
 * @param {number} flowRate - Entries per minute (from calculateFlowRate)
 * @returns {number|null} Minutes to full, 0 if already full, null if not filling
 * @throws {Error} If zoneId is invalid
 */
function predictTimeToFill(zoneId, currentCount, flowRate) {
  if (flowRate <= 0) return null;
  const capacity = ZONE_CAPACITY[zoneId];
  if (!capacity) throw new Error(`Invalid zone: ${zoneId}`);
  const remaining = capacity - currentCount;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / flowRate);
}

/**
 * Return the alert severity level based on crowd density.
 * @param {number} density - Density percentage [0, 100]
 * @returns {'normal'|'warning'|'critical'}
 */
function getAlertLevel(density) {
  if (density >= THRESHOLDS.CRITICAL) return 'critical';
  if (density >= THRESHOLDS.WARNING) return 'warning';
  return 'normal';
}

/**
 * Calculate the mean crowd density across all provided zones.
 * @param {Object.<string, number>} zoneDensities - Map of zoneId → density %
 * @returns {number} Average density percentage
 */
function calculateAverageDensity(zoneDensities) {
  const values = Object.values(zoneDensities);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, d) => sum + d, 0) / values.length);
}

/**
 * Check whether a zone exceeds the critical threshold and should trigger alerts.
 * @param {string} zoneId
 * @param {number} currentCount
 * @param {number} [threshold=0.7] - Fraction of capacity to trigger alert
 * @returns {{ alert: boolean, density: number, level: string }}
 */
function checkZoneThreshold(zoneId, currentCount, threshold = THRESHOLDS.DEFAULT_ALERT_FRACTION) {
  const density = calculateDensity(zoneId, currentCount);
  const thresholdPct = threshold * 100;
  return {
    alert: density >= thresholdPct,
    density,
    level: getAlertLevel(density),
  };
}

/**
 * Generate a plain-English PA announcement for a high-density zone.
 * @param {string} zoneId
 * @param {number} density
 * @returns {string}
 */
function generateCrowdAnnouncement(zoneId, density) {
  const level = getAlertLevel(density);
  const zone = zoneId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (level === 'critical') {
    return `Attention: ${zone} is at ${density}% capacity. Please proceed to an alternative area immediately.`;
  }
  if (level === 'warning') {
    return `Notice: ${zone} is filling up (${density}% capacity). Consider moving to a less crowded area.`;
  }
  return `${zone} is at ${density}% capacity — comfortable conditions.`;
}

module.exports = {
  calculateDensity,
  estimateWaitTime,
  recommendGate,
  calculateFlowRate,
  predictTimeToFill,
  getAlertLevel,
  calculateAverageDensity,
  checkZoneThreshold,
  generateCrowdAnnouncement,
  ZONE_CAPACITY,
  GATE_CAPACITY_PER_MINUTE: GATE_CAPACITY,
};
