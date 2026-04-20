'use strict';

/**
 * SmartStadium AI — BigQuery Service
 * Historical crowd analytics: density trends, peak hours, zone comparisons.
 */

const { BigQuery } = require('@google-cloud/bigquery');

let bq;
function getBQ() {
  if (!bq) bq = new BigQuery({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return bq;
}

const DATASET = process.env.BIGQUERY_DATASET || 'smartstadium';
const TABLE = process.env.BIGQUERY_TABLE || 'crowd_events';

/**
 * Query historical average density by hour for a given zone.
 * @param {string} zoneId
 * @param {number} [lookbackDays=30]
 * @returns {Promise<Array<{hour: number, avgDensity: number, date: string}>>}
 */
async function getHistoricalDensity(zoneId, lookbackDays = 30) {
  const query = `
    SELECT
      EXTRACT(HOUR FROM timestamp) AS hour,
      ROUND(AVG(density), 1) AS avgDensity,
      FORMAT_DATE('%Y-%m-%d', DATE(timestamp)) AS date
    FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${DATASET}.${TABLE}\`
    WHERE
      zone_id = @zoneId
      AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
    GROUP BY hour, date
    ORDER BY date DESC, hour ASC
    LIMIT 168
  `;
  const [rows] = await getBQ().query({
    query,
    params: { zoneId, days: lookbackDays },
    location: 'US',
  });
  return rows;
}

/**
 * Get peak crowd hours for the entire stadium.
 * @returns {Promise<Array<{hour: number, avgDensity: number}>>}
 */
async function getStadiumPeakHours() {
  const query = `
    SELECT
      EXTRACT(HOUR FROM timestamp) AS hour,
      ROUND(AVG(density), 1) AS avgDensity
    FROM \`${process.env.GOOGLE_CLOUD_PROJECT}.${DATASET}.${TABLE}\`
    WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
    GROUP BY hour
    ORDER BY avgDensity DESC
    LIMIT 24
  `;
  const [rows] = await getBQ().query({ query, location: 'US' });
  return rows;
}

/**
 * Log a crowd event to BigQuery (streaming insert).
 * @param {{zoneId: string, count: number, density: number, eventType: string}} event
 */
async function logCrowdEvent(event) {
  const dataset = getBQ().dataset(DATASET);
  const table = dataset.table(TABLE);
  await table.insert([
    {
      zone_id: event.zoneId,
      count: event.count,
      density: event.density,
      event_type: event.eventType || 'update',
      timestamp: new Date().toISOString(),
    },
  ]);
}

module.exports = { getHistoricalDensity, getStadiumPeakHours, logCrowdEvent };
