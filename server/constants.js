'use strict';

/**
 * SmartStadium AI — Global Constants
 * Centralized configuration for all business logic, thresholds, and limits.
 */
module.exports = {
  // Crowd Density Thresholds
  THRESHOLDS: {
    CRITICAL: 90,
    WARNING: 70,
    DEFAULT_ALERT_FRACTION: 0.7,
  },

  // Zone Capacities (persons)
  ZONE_CAPACITY: {
    'north-stand': 12000,
    'south-stand': 12000,
    'east-stand': 8000,
    'west-stand': 8000,
    'vip-pavilion': 3000,
    'media-center': 500,
  },

  // Gate Throughput (persons per minute)
  GATE_CAPACITY: {
    'gate-a': 150,
    'gate-b': 150,
    'gate-c': 120,
    'gate-d': 120,
    'gate-e': 80,
    'gate-f': 80,
  },

  // Rate Limiting & Limits
  LIMITS: {
    API_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    API_MAX_REQUESTS: 200,
    JSON_BODY_LIMIT: '10kb',
    MAX_QUERY_LENGTH: 2000,
  },

  // Cache Durations (seconds)
  CACHE: {
    STATIC_MAX_AGE: 31536000, // 1 year
    CONFIG_MAX_AGE: 3600,     // 1 hour
  },
};
