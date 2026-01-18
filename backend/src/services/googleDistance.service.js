import axios from 'axios';
import pool from '../config/database.js';
import config from '../config/config.js';
import crypto from 'crypto';

const cacheTtlDays = 90;

function addrKey(s) {
  return String(s || '').trim();
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

async function getCached(originText, destinationText, mode) {
  const originHash = sha256Hex(originText);
  const destinationHash = sha256Hex(destinationText);
  const [rows] = await pool.execute(
    `SELECT distance_meters, duration_seconds, status, fetched_at
     FROM google_distance_cache
     WHERE origin_hash = ? AND destination_hash = ? AND mode = ?
       AND fetched_at >= DATE_SUB(NOW(), INTERVAL ${cacheTtlDays} DAY)
     LIMIT 1`,
    [originHash, destinationHash, mode]
  );
  return rows?.[0] || null;
}

async function upsertCache({ originText, destinationText, mode, distanceMeters, durationSeconds, status }) {
  const originHash = sha256Hex(originText);
  const destinationHash = sha256Hex(destinationText);
  await pool.execute(
    `INSERT INTO google_distance_cache (origin_hash, destination_hash, origin_text, destination_text, mode, distance_meters, duration_seconds, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       distance_meters = VALUES(distance_meters),
       duration_seconds = VALUES(duration_seconds),
       status = VALUES(status),
       fetched_at = CURRENT_TIMESTAMP`,
    [originHash, destinationHash, originText, destinationText, mode, distanceMeters, durationSeconds, status]
  );
}

export async function getDrivingDistanceMeters(originRaw, destinationRaw) {
  const originText = addrKey(originRaw);
  const destinationText = addrKey(destinationRaw);
  const mode = 'driving';

  if (!originText || !destinationText) {
    throw new Error('Origin and destination addresses are required');
  }

  const cached = await getCached(originText, destinationText, mode);
  if (cached && cached.status === 'OK' && Number.isFinite(Number(cached.distance_meters))) {
    return Number(cached.distance_meters);
  }

  const apiKey = config.googleMaps?.apiKey || null;
  if (!apiKey) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not configured');
    err.code = 'MAPS_KEY_MISSING';
    throw err;
  }

  const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  const resp = await axios.get(url, {
    params: {
      origins: originText,
      destinations: destinationText,
      mode,
      key: apiKey,
      units: 'imperial'
    },
    timeout: 15000
  });

  const data = resp?.data || {};
  const element = data?.rows?.[0]?.elements?.[0] || null;
  const status = String(element?.status || data?.status || 'UNKNOWN');
  const distanceMeters = Number(element?.distance?.value || 0);
  const durationSeconds = Number(element?.duration?.value || 0);

  await upsertCache({
    originText,
    destinationText,
    mode,
    distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    status
  });

  if (status !== 'OK' || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    const err = new Error(`Distance lookup failed (${status})`);
    err.code = 'MAPS_DISTANCE_FAILED';
    throw err;
  }
  return distanceMeters;
}

export function metersToMiles(meters) {
  const m = Number(meters || 0);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return m / 1609.344;
}

