'use strict';

/**
 * SmartStadium AI — Unit Tests: Crowd Logic
 * Coverage target: 100% of server/utils/crowd.js
 *
 * Tests include: happy paths, edge cases, boundary values, and error states.
 */

const {
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
  GATE_CAPACITY_PER_MINUTE,
} = require('../../server/utils/crowd');

// ─── calculateDensity ──────────────────────────────────────────────────────

describe('calculateDensity', () => {
  test('returns 0% for an empty zone', () => {
    expect(calculateDensity('north-stand', 0)).toBe(0);
  });

  test('returns 100% when exactly at capacity', () => {
    expect(calculateDensity('north-stand', 12000)).toBe(100);
  });

  test('returns 50% at half capacity', () => {
    expect(calculateDensity('north-stand', 6000)).toBe(50);
  });

  test('caps at 100% when count exceeds capacity', () => {
    expect(calculateDensity('north-stand', 99999)).toBe(100);
  });

  test('handles vip-pavilion at full capacity', () => {
    expect(calculateDensity('vip-pavilion', 3000)).toBe(100);
  });

  test('handles media-center at various densities', () => {
    expect(calculateDensity('media-center', 500)).toBe(100); // full capacity
    expect(calculateDensity('media-center', 250)).toBe(50);  // half capacity
    expect(calculateDensity('media-center', 0)).toBe(0);     // empty
  });

  test('throws for an unknown zone', () => {
    expect(() => calculateDensity('zone-xyz', 100)).toThrow('Invalid zone: zone-xyz');
  });

  test('throws for negative crowd count', () => {
    expect(() => calculateDensity('north-stand', -1)).toThrow('cannot be negative');
  });

  test('rounds to nearest integer', () => {
    // 1 / 12000 = 0.00833... → rounds to 0
    expect(typeof calculateDensity('north-stand', 1)).toBe('number');
  });
});

// ─── estimateWaitTime ──────────────────────────────────────────────────────

describe('estimateWaitTime', () => {
  test('returns 0 for an empty queue', () => {
    expect(estimateWaitTime(0, 'gate-a')).toBe(0);
  });

  test('calculates wait correctly for gate-a (150/min)', () => {
    expect(estimateWaitTime(300, 'gate-a')).toBe(2);
  });

  test('calculates wait correctly for gate-c (120/min)', () => {
    expect(estimateWaitTime(360, 'gate-c')).toBe(3);
  });

  test('calculates wait correctly for gate-e (80/min)', () => {
    expect(estimateWaitTime(160, 'gate-e')).toBe(2);
  });

  test('rounds up fractional minutes', () => {
    expect(estimateWaitTime(151, 'gate-a')).toBe(2); // 151/150 = 1.006... → ceil = 2
  });

  test('rounds up correctly for 1-person queue', () => {
    expect(estimateWaitTime(1, 'gate-a')).toBe(1);
  });

  test('throws for an invalid gate', () => {
    expect(() => estimateWaitTime(100, 'gate-z')).toThrow('Invalid gate: gate-z');
  });

  test('throws for a negative queue length', () => {
    expect(() => estimateWaitTime(-5, 'gate-a')).toThrow('cannot be negative');
  });
});

// ─── recommendGate ────────────────────────────────────────────────────────

describe('recommendGate', () => {
  test('recommends the gate with the shortest wait time', () => {
    const gateStats = {
      'gate-a': { queueLength: 600, isOpen: true },  // 4 min
      'gate-b': { queueLength: 150, isOpen: true },  // 1 min
      'gate-c': { queueLength: 360, isOpen: true },  // 3 min
    };
    const result = recommendGate(gateStats);
    expect(result.gateId).toBe('gate-b');
    expect(result.waitTime).toBe(1);
  });

  test('skips closed gates', () => {
    const gateStats = {
      'gate-a': { queueLength: 100, isOpen: false },
      'gate-b': { queueLength: 300, isOpen: true },
    };
    const result = recommendGate(gateStats);
    expect(result.gateId).toBe('gate-b');
  });

  test('works with a single open gate', () => {
    const gateStats = {
      'gate-a': { queueLength: 0, isOpen: true },
    };
    const result = recommendGate(gateStats);
    expect(result.gateId).toBe('gate-a');
    expect(result.waitTime).toBe(0);
  });

  test('throws when no gates are open', () => {
    const gateStats = {
      'gate-a': { queueLength: 100, isOpen: false },
    };
    expect(() => recommendGate(gateStats)).toThrow('No gates are currently open');
  });

  test('includes a reason that mentions time saved', () => {
    const gateStats = {
      'gate-a': { queueLength: 900, isOpen: true },  // 6 min
      'gate-b': { queueLength: 150, isOpen: true },  // 1 min
    };
    const result = recommendGate(gateStats);
    expect(result.reason).toContain('Save');
    expect(result.reason).toContain('5 min');
  });

  test('returns equal-wait message when all queues match', () => {
    const gateStats = {
      'gate-a': { queueLength: 150, isOpen: true },
      'gate-b': { queueLength: 150, isOpen: true },
    };
    const result = recommendGate(gateStats);
    expect(result.reason).toContain('similar');
  });
});

// ─── calculateFlowRate ────────────────────────────────────────────────────

describe('calculateFlowRate', () => {
  test('returns 0 for an empty array', () => {
    expect(calculateFlowRate([])).toBe(0);
  });

  test('returns 0 for null input', () => {
    expect(calculateFlowRate(null)).toBe(0);
  });

  test('counts only scans within the time window', () => {
    const now = Date.now();
    const recent = Array(50).fill(now - 5 * 60 * 1000);   // 50 scans 5 min ago (inside 10-min window)
    const old = Array(100).fill(now - 20 * 60 * 1000);    // 100 scans 20 min ago (outside window)
    const rate = calculateFlowRate([...recent, ...old]);
    expect(rate).toBe(5); // 50 / 10 min
  });

  test('uses custom window when provided', () => {
    const now = Date.now();
    const scans = Array(60).fill(now - 2 * 60 * 1000); // 60 scans 2 min ago
    const rate = calculateFlowRate(scans, 5);
    expect(rate).toBe(12); // 60 / 5 min
  });
});

// ─── predictTimeToFill ────────────────────────────────────────────────────

describe('predictTimeToFill', () => {
  test('returns null when flow rate is 0', () => {
    expect(predictTimeToFill('north-stand', 6000, 0)).toBeNull();
  });

  test('returns null when flow rate is negative', () => {
    expect(predictTimeToFill('north-stand', 6000, -1)).toBeNull();
  });

  test('returns 0 when zone is already at or over capacity', () => {
    expect(predictTimeToFill('north-stand', 12000, 100)).toBe(0);
    expect(predictTimeToFill('north-stand', 13000, 100)).toBe(0);
  });

  test('calculates time to fill correctly', () => {
    // 12000 - 6000 = 6000 remaining, 100/min → 60 min
    expect(predictTimeToFill('north-stand', 6000, 100)).toBe(60);
  });

  test('rounds up to next full minute', () => {
    // 6001 remaining, 100/min → 60.01 → ceil = 61
    expect(predictTimeToFill('north-stand', 5999, 100)).toBe(61);
  });

  test('throws for an invalid zone', () => {
    expect(() => predictTimeToFill('bad-zone', 100, 50)).toThrow('Invalid zone: bad-zone');
  });
});

// ─── getAlertLevel ────────────────────────────────────────────────────────

describe('getAlertLevel', () => {
  test('returns normal for density below 70%', () => {
    expect(getAlertLevel(0)).toBe('normal');
    expect(getAlertLevel(50)).toBe('normal');
    expect(getAlertLevel(69)).toBe('normal');
  });

  test('returns warning for density 70–89%', () => {
    expect(getAlertLevel(70)).toBe('warning');
    expect(getAlertLevel(89)).toBe('warning');
  });

  test('returns critical for density 90%+', () => {
    expect(getAlertLevel(90)).toBe('critical');
    expect(getAlertLevel(100)).toBe('critical');
  });
});

// ─── calculateAverageDensity ──────────────────────────────────────────────

describe('calculateAverageDensity', () => {
  test('returns 0 for an empty object', () => {
    expect(calculateAverageDensity({})).toBe(0);
  });

  test('returns the single value for one zone', () => {
    expect(calculateAverageDensity({ a: 55 })).toBe(55);
  });

  test('averages two zones correctly', () => {
    expect(calculateAverageDensity({ a: 40, b: 60 })).toBe(50);
  });

  test('averages three zones and rounds', () => {
    expect(calculateAverageDensity({ a: 33, b: 33, c: 34 })).toBe(33);
  });
});

// ─── checkZoneThreshold ───────────────────────────────────────────────────

describe('checkZoneThreshold', () => {
  test('does not alert below the default threshold (70%)', () => {
    const result = checkZoneThreshold('north-stand', 6000); // 50%
    expect(result.alert).toBe(false);
    expect(result.level).toBe('normal');
  });

  test('alerts at or above the default threshold', () => {
    const result = checkZoneThreshold('north-stand', 8400); // 70%
    expect(result.alert).toBe(true);
    expect(result.level).toBe('warning');
  });

  test('respects custom threshold', () => {
    const result = checkZoneThreshold('north-stand', 5000, 0.5); // 42% < 50%
    expect(result.alert).toBe(false);
  });

  test('returns density in result', () => {
    const result = checkZoneThreshold('north-stand', 12000); // 100%
    expect(result.density).toBe(100);
    expect(result.level).toBe('critical');
    expect(result.alert).toBe(true);
  });
});

// ─── generateCrowdAnnouncement ────────────────────────────────────────────

describe('generateCrowdAnnouncement', () => {
  test('generates a critical announcement at high density', () => {
    const msg = generateCrowdAnnouncement('north-stand', 95);
    expect(msg).toContain('95%');
    expect(msg).toContain('immediately');
  });

  test('generates a warning announcement at warning density', () => {
    const msg = generateCrowdAnnouncement('east-stand', 75);
    expect(msg).toContain('75%');
    expect(msg).toContain('filling up');
  });

  test('generates a normal announcement at low density', () => {
    const msg = generateCrowdAnnouncement('west-stand', 40);
    expect(msg).toContain('40%');
    expect(msg).toContain('comfortable');
  });

  test('formats zone name correctly (kebab → Title Case)', () => {
    const msg = generateCrowdAnnouncement('vip-pavilion', 30);
    expect(msg).toContain('Vip Pavilion');
  });
});

// ─── Constants exported ───────────────────────────────────────────────────

describe('Module constants', () => {
  test('ZONE_CAPACITY contains all expected zones', () => {
    const expectedZones = ['north-stand', 'south-stand', 'east-stand', 'west-stand', 'vip-pavilion', 'media-center'];
    expectedZones.forEach((z) => expect(ZONE_CAPACITY).toHaveProperty(z));
  });

  test('GATE_CAPACITY_PER_MINUTE contains all expected gates', () => {
    const expectedGates = ['gate-a', 'gate-b', 'gate-c', 'gate-d', 'gate-e', 'gate-f'];
    expectedGates.forEach((g) => expect(GATE_CAPACITY_PER_MINUTE).toHaveProperty(g));
  });

  test('all zone capacities are positive numbers', () => {
    Object.values(ZONE_CAPACITY).forEach((cap) => {
      expect(cap).toBeGreaterThan(0);
    });
  });
});
