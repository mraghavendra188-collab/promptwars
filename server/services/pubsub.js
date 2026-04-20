'use strict';

/**
 * SmartStadium AI — Cloud Pub/Sub Service
 * Publishes real-time gate scan and crowd events to Google Cloud Pub/Sub.
 */

const { PubSub } = require('@google-cloud/pubsub');

let pubsub;
function getPubSub() {
  if (!pubsub) pubsub = new PubSub({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return pubsub;
}

const TOPICS = {
  CROWD_EVENTS: process.env.PUBSUB_TOPIC_CROWD || 'crowd-events',
  GATE_SCANS: process.env.PUBSUB_TOPIC_GATES || 'gate-scans',
  ALERTS: process.env.PUBSUB_TOPIC_ALERTS || 'crowd-alerts',
};

/**
 * Publish a message to a Pub/Sub topic.
 * @param {string} topicName - Topic name from TOPICS constant
 * @param {Object} payload - JSON payload to publish
 * @param {Object} [attributes] - Optional message attributes
 * @returns {Promise<string>} Message ID
 */
async function publishEvent(topicName, payload, attributes = {}) {
  const topic = getPubSub().topic(topicName);
  const data = Buffer.from(JSON.stringify(payload));
  const messageId = await topic.publishMessage({
    data,
    attributes: {
      source: 'smartstadium-api',
      version: '2.0',
      ...attributes,
    },
  });
  return messageId;
}

/**
 * Publish a gate entry scan event.
 * @param {{gateId: string, userId: string, timestamp: number}} scan
 */
async function publishGateScan(scan) {
  return publishEvent(TOPICS.GATE_SCANS, scan, { type: 'gate-scan', gateId: scan.gateId });
}

/**
 * Publish a crowd density alert.
 * @param {{zoneId: string, density: number, level: string}} alert
 */
async function publishCrowdAlert(alert) {
  return publishEvent(TOPICS.ALERTS, alert, { type: 'crowd-alert', level: alert.level });
}

/**
 * Publish a general crowd update event.
 * @param {{zoneId: string, count: number, density: number}} update
 */
async function publishCrowdUpdate(update) {
  return publishEvent(TOPICS.CROWD_EVENTS, update, { type: 'crowd-update' });
}

module.exports = { publishEvent, publishGateScan, publishCrowdAlert, publishCrowdUpdate, TOPICS };
