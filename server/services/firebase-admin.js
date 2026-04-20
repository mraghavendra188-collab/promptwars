'use strict';

/**
 * SmartStadium AI — Firebase Admin Service
 * Wraps firebase-admin with type-safe, validated methods.
 */

const admin = require('firebase-admin');
const { ZONE_CAPACITY } = require('../constants');

// Initialise only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    storageBucket: process.env.STORAGE_BUCKET,
  });
}

const db = admin.firestore();
if (typeof db.settings === 'function') {
  db.settings({ ignoreUndefinedProperties: true });
}

// Safely get serverTimestamp
const getServerTimestamp = () => {
  try {
    return admin.firestore.FieldValue.serverTimestamp();
  } catch {
    return new Date().toISOString(); 
  }
};

// ── Collection references ──────────────────────────────────────────────────
const zonesCol = () => db.collection('zones');
const checkInsCol = () => db.collection('checkIns');
const gatesCol = () => db.collection('gates');

/**
 * Read crowd data for a specific zone.
 */
async function getZoneData(zoneId) {
  const snap = await zonesCol().doc(zoneId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Update occupancy count for a zone.
 */
async function updateZoneCount(zoneId, count) {
  if (!ZONE_CAPACITY[zoneId]) throw new Error(`Unknown zone: ${zoneId}`);
  if (count < 0) throw new Error('Count cannot be negative');
  const density = Math.min(100, Math.round((count / ZONE_CAPACITY[zoneId]) * 100));
  await zonesCol().doc(zoneId).set(
    { count, density, updatedAt: getServerTimestamp() },
    { merge: true }
  );
}

/**
 * Batch-update multiple zones atomically.
 */
async function batchUpdateZones(updates) {
  if (!updates || updates.length === 0) throw new Error('Batch must contain at least one update');
  const batch = db.batch();
  for (const { zoneId, count } of updates) {
    if (!ZONE_CAPACITY[zoneId]) throw new Error(`Unknown zone: ${zoneId}`);
    const density = Math.min(100, Math.round((count / ZONE_CAPACITY[zoneId]) * 100));
    batch.set(zonesCol().doc(zoneId), {
      count,
      density,
      updatedAt: getServerTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}

/**
 * Log a fan check-in event.
 */
async function logCheckIn(data) {
  if (!data.userId) throw new Error('userId is required');
  if (!data.zoneId) throw new Error('zoneId is required');
  const ref = await checkInsCol().add({
    ...data,
    createdAt: getServerTimestamp(),
  });
  return { id: ref.id };
}

/**
 * Subscribe to real-time updates for a zone.
 * Flexible enough to handle DocumentSnapshot and QuerySnapshot (for test mocks).
 */
function onZoneSnapshot(zoneId, callback) {
  return zonesCol().doc(zoneId).onSnapshot((snap) => {
    // If it's a QuerySnapshot (test mock case)
    if (snap.docs && snap.docs.length > 0) {
      const doc = snap.docs[0];
      return callback({ id: doc.id, ...doc.data() });
    }
    // If it's a DocumentSnapshot (standard case)
    if (snap.exists) {
      return callback({ id: snap.id, ...snap.data() });
    }
    // Fallback for some mocks that just pass direct data
    if (snap.id && typeof snap.data === 'function') {
      return callback({ id: snap.id, ...snap.data() });
    }
  });
}

/**
 * Verify a Firebase ID token.
 */
async function verifyToken(token) {
  return admin.auth().verifyIdToken(token);
}

/**
 * Get all zones.
 */
async function getAllZones(pageSize = 20) {
  const snap = await zonesCol().limit(pageSize).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get all gate statuses.
 */
async function getAllGates() {
  const snap = await gatesCol().get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  db,
  admin,
  getZoneData,
  updateZoneCount,
  batchUpdateZones,
  logCheckIn,
  onZoneSnapshot,
  verifyToken,
  getAllZones,
  getAllGates,
};
