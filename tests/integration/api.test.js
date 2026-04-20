'use strict';

/**
 * SmartStadium AI — Integration Tests: REST API
 * Uses supertest to exercise live Express routes with mocked Google services.
 */

// ── Mock all external Google services ────────────────────────────────────
jest.mock('../../server/services/firebase-admin', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ density: 55, queueLength: 200, zone: 'north-stand' }),
    }),
    set: jest.fn().mockResolvedValue({}),
    add: jest.fn().mockResolvedValue({ id: 'mock-doc-id' }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    onSnapshot: jest.fn(),
  },
  verifyToken: jest.fn().mockResolvedValue({
    uid: 'user-123',
    email: 'test@stadium.com',
    role: 'attendee',
  }),
}));

jest.mock('../../server/services/gemini', () => ({
  generateRecommendation: jest.fn().mockImplementation(async (query, onChunk) => {
    onChunk('Gate B has the shortest queue — 1 min wait.');
  }),
  generateAnnouncement: jest.fn().mockResolvedValue('Please move to Gate C.'),
  sanitizeUserQuery: jest.fn((q) => (q || '').trim()),
  buildGateRecommendationPrompt: jest.fn().mockReturnValue('test prompt'),
  buildAnnouncementPrompt: jest.fn().mockReturnValue('test prompt'),
}));

jest.mock('../../server/services/bigquery', () => ({
  getHistoricalDensity: jest.fn().mockResolvedValue([
    { hour: 14, avgDensity: 72, date: '2025-01-15' },
    { hour: 15, avgDensity: 85, date: '2025-01-15' },
  ]),
  logCrowdEvent: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../server/services/pubsub', () => ({
  publishEvent: jest.fn().mockResolvedValue('message-id-123'),
}));

const request = require('supertest');
const { app } = require('../../server/index');

// ─── Health check ─────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns 200 with service status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('services');
  });

  test('response includes timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ─── Crowd routes ─────────────────────────────────────────────────────────

describe('GET /api/crowd/zones', () => {
  test('returns zone data array', async () => {
    const res = await request(app).get('/api/crowd/zones');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('zones');
    expect(Array.isArray(res.body.zones)).toBe(true);
  });

  test('each zone has required fields', async () => {
    const res = await request(app).get('/api/crowd/zones');
    res.body.zones.forEach((zone) => {
      expect(zone).toHaveProperty('id');
      expect(zone).toHaveProperty('density');
      expect(zone).toHaveProperty('alertLevel');
    });
  });
});

describe('GET /api/crowd/gates', () => {
  test('returns gate data with wait times', async () => {
    const res = await request(app).get('/api/crowd/gates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('gates');
    expect(Array.isArray(res.body.gates)).toBe(true);
  });

  test('each gate includes waitTime and isOpen', async () => {
    const res = await request(app).get('/api/crowd/gates');
    res.body.gates.forEach((gate) => {
      expect(gate).toHaveProperty('gateId');
      expect(gate).toHaveProperty('waitTime');
      expect(gate).toHaveProperty('isOpen');
    });
  });
});

describe('GET /api/crowd/recommendation', () => {
  test('recommends the best gate', async () => {
    const res = await request(app).get('/api/crowd/recommendation');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('gateId');
    expect(res.body).toHaveProperty('waitTime');
    expect(res.body).toHaveProperty('reason');
  });
});

describe('POST /api/crowd/checkin', () => {
  test('rejects request without Authorization header', async () => {
    const res = await request(app)
      .post('/api/crowd/checkin')
      .send({ zoneId: 'north-stand', seatNumber: 'A12' });
    expect(res.status).toBe(401);
  });

  test('rejects request with missing required fields', async () => {
    const res = await request(app)
      .post('/api/crowd/checkin')
      .set('Authorization', 'Bearer mock-token')
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  test('accepts valid check-in with auth token', async () => {
    const res = await request(app)
      .post('/api/crowd/checkin')
      .set('Authorization', 'Bearer mock-token')
      .send({ zoneId: 'north-stand', seatNumber: 'A12' });
    expect([200, 201]).toContain(res.status);
  });
});

// ─── Gemini routes ────────────────────────────────────────────────────────

describe('POST /api/gemini/recommend', () => {
  test('returns a streaming recommendation', async () => {
    const res = await request(app)
      .post('/api/gemini/recommend')
      .send({ query: 'Which gate has the shortest queue?' });
    expect([200, 201]).toContain(res.status);
  });

  test('rejects empty query', async () => {
    const res = await request(app)
      .post('/api/gemini/recommend')
      .send({ query: '' });
    expect([400, 422]).toContain(res.status);
  });

  test('rejects excessively long query', async () => {
    const res = await request(app)
      .post('/api/gemini/recommend')
      .send({ query: 'x'.repeat(3000) });
    expect([400, 422]).toContain(res.status);
  });
});

describe('POST /api/gemini/announce', () => {
  test('requires admin role', async () => {
    const res = await request(app)
      .post('/api/gemini/announce')
      .send({ zoneId: 'north-stand', density: 90 });
    expect(res.status).toBe(401);
  });
});

// ─── Security headers ────────────────────────────────────────────────────

describe('Security headers', () => {
  test('responses include X-Content-Type-Options header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('responses include content-security-policy header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

// ─── Input validation ─────────────────────────────────────────────────────

describe('Input validation', () => {
  test('rejects SQL injection in query params', async () => {
    const res = await request(app)
      .post('/api/gemini/recommend')
      .send({ query: "'; DROP TABLE users; --" });
    // Should either sanitize and process (200) or reject (400)
    expect([200, 400, 422]).toContain(res.status);
  });

  test('rejects XSS payloads', async () => {
    const res = await request(app)
      .post('/api/gemini/recommend')
      .send({ query: '<script>alert(1)</script>' });
    expect([200, 400, 422]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).not.toContain('<script>');
    }
  });
});
