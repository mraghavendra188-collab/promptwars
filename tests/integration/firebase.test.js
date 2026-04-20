'use strict';

/**
 * SmartStadium AI — Integration Tests: Firebase Service
 * Mocks firebase-admin so no real Firestore instance is needed.
 */

// ── Build a fully mocked Firestore ────────────────────────────────────────
const mockDoc = {
  exists: true,
  id: 'zone-north-stand',
  data: () => ({
    zoneId: 'north-stand',
    count: 6000,
    density: 50,
    timestamp: new Date().toISOString(),
  }),
};

const mockCollectionRef = {
  doc: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue(mockDoc),
  set: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  add: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  onSnapshot: jest.fn((success) => {
    success({
      docs: [{ id: 'zone-north-stand', data: () => mockDoc.data() }],
      forEach: jest.fn(),
    });
    return jest.fn(); // unsubscribe fn
  }),
};

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn().mockReturnValue({}) },
  firestore: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue(mockCollectionRef),
    batch: jest.fn().mockReturnValue({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue({}),
    }),
    runTransaction: jest.fn().mockImplementation(async (fn) => fn({})),
  }),
  apps: [],
}));

const firebaseService = require('../../server/services/firebase-admin');

// ─── Read operations ──────────────────────────────────────────────────────

describe('Firebase — Read zone data', () => {
  test('reads crowd data for a valid zone', async () => {
    const data = await firebaseService.getZoneData('north-stand');
    expect(data).toBeDefined();
    expect(data).toHaveProperty('density');
  });

  test('returns null for non-existent zone', async () => {
    mockCollectionRef.get.mockResolvedValueOnce({ exists: false, data: () => null });
    const data = await firebaseService.getZoneData('ghost-zone');
    expect(data).toBeNull();
  });

  test('handles Firestore errors gracefully', async () => {
    mockCollectionRef.get.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(firebaseService.getZoneData('north-stand')).rejects.toThrow('Permission denied');
  });
});

// ─── Write operations ─────────────────────────────────────────────────────

describe('Firebase — Update zone count', () => {
  test('writes count and density on valid update', async () => {
    await firebaseService.updateZoneCount('north-stand', 7000);
    expect(mockCollectionRef.set).toHaveBeenCalledWith(
      expect.objectContaining({ count: 7000 }),
      expect.anything()
    );
  });

  test('rejects negative count', async () => {
    await expect(firebaseService.updateZoneCount('north-stand', -100)).rejects.toThrow();
  });

  test('rejects unknown zone', async () => {
    await expect(firebaseService.updateZoneCount('fake-zone', 100)).rejects.toThrow();
  });
});

// ─── Check-in operations ─────────────────────────────────────────────────

describe('Firebase — logCheckIn', () => {
  test('adds a check-in document', async () => {
    const result = await firebaseService.logCheckIn({
      userId: 'user-123',
      zoneId: 'north-stand',
      seatNumber: 'B14',
      timestamp: Date.now(),
    });
    expect(result).toHaveProperty('id');
  });

  test('rejects check-in with missing userId', async () => {
    await expect(
      firebaseService.logCheckIn({ zoneId: 'north-stand', seatNumber: 'B14' })
    ).rejects.toThrow();
  });
});

// ─── Batch updates ────────────────────────────────────────────────────────

describe('Firebase — batchUpdateZones', () => {
  test('commits a batch update for multiple zones', async () => {
    const updates = [
      { zoneId: 'north-stand', count: 8000 },
      { zoneId: 'south-stand', count: 9000 },
    ];
    await expect(firebaseService.batchUpdateZones(updates)).resolves.not.toThrow();
  });

  test('rejects empty batch', async () => {
    await expect(firebaseService.batchUpdateZones([])).rejects.toThrow();
  });
});

// ─── Real-time listener ───────────────────────────────────────────────────

describe('Firebase — onZoneSnapshot', () => {
  test('subscribes to real-time updates and returns unsubscribe fn', () => {
    const callback = jest.fn();
    const unsubscribe = firebaseService.onZoneSnapshot('north-stand', callback);
    expect(typeof unsubscribe).toBe('function');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
