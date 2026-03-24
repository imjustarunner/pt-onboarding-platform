import axios from 'axios';
import config from '../config/config.js';

/**
 * Driving distances/durations from one origin to many destinations (Google Distance Matrix API).
 * @param {{ originLat: number, originLng: number, entries: Array<{ key: string, destination: string }> }} params
 *   Each destination should be "lat,lng" (recommended) or an address string without pipe characters.
 * @returns {Map<string, { ok: boolean, meters?: number, durationSeconds?: number, durationText?: string, status?: string }>}
 */
export async function drivingDistancesFromOrigin({ originLat, originLng, entries }) {
  const apiKey = config.googleMaps?.apiKey || null;
  if (!apiKey) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not configured');
    err.code = 'MAPS_KEY_MISSING';
    throw err;
  }

  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
    const err = new Error('Invalid origin coordinates');
    err.code = 'MAPS_ORIGIN_INVALID';
    throw err;
  }

  const list = Array.isArray(entries) ? entries.filter((e) => e && e.key && e.destination) : [];
  const results = new Map();
  if (!list.length) return results;

  const BATCH_SIZE = 25;
  const origin = `${originLat},${originLng}`;

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const destinationsParam = batch.map((b) => String(b.destination).trim()).join('|');

    const resp = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: origin,
        destinations: destinationsParam,
        mode: 'driving',
        units: 'metric',
        key: apiKey
      },
      timeout: 45000
    });

    const data = resp?.data || {};
    const topStatus = String(data.status || '');
    if (topStatus !== 'OK' && topStatus !== 'ZERO_RESULTS') {
      const msg = typeof data.error_message === 'string' ? data.error_message.trim() : '';
      const err = new Error(msg || `Distance Matrix request failed (${topStatus})`);
      err.code = 'MAPS_DISTANCE_MATRIX_FAILED';
      throw err;
    }

    const elements = data?.rows?.[0]?.elements || [];
    batch.forEach((b, idx) => {
      const el = elements[idx];
      if (!el) {
        results.set(b.key, { ok: false, status: 'MISSING_ELEMENT' });
        return;
      }
      const st = String(el.status || '');
      if (st !== 'OK') {
        results.set(b.key, { ok: false, status: st });
        return;
      }
      const meters = el.distance?.value;
      const durationSeconds = el.duration?.value;
      const durationText = el.duration?.text || null;
      if (!Number.isFinite(meters)) {
        results.set(b.key, { ok: false, status: 'NO_DISTANCE' });
        return;
      }
      results.set(b.key, {
        ok: true,
        meters,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        durationText
      });
    });
  }

  return results;
}
