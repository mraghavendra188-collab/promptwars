'use strict';

/**
 * SmartStadium AI — Unit Tests: Health Route
 */

const request = require('supertest');
const express = require('express');
const healthRoutes = require('../../server/routes/health');

// Mock firebase-admin service
jest.mock('../../server/services/firebase-admin', () => ({
  db: {
    collection: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
  },
}));

describe('Health Route', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/api/health', healthRoutes);
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  });

  test('GET /api/health returns 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services.firebase).toBe('ok');
    expect(res.body.services.gemini).toBe('configured');
  });

  test('GET /api/health returns degraded if firebase fails', async () => {
    const { db } = require('../../server/services/firebase-admin');
    db.get.mockRejectedValueOnce(new Error('Firebase error'));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.firebase).toBe('degraded');
  });
});
