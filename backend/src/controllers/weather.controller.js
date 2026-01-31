import axios from 'axios';
import pool from '../config/database.js';
import { geocodeAddressWithGoogle } from '../services/googleGeocode.service.js';

// Small in-process cache to avoid hammering the (free) upstream API.
// Key: userId -> { atMs, payload }
const weatherCacheByUserId = new Map();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function buildHomeAddressString({ street, line2, city, state, postal }) {
  const parts = [
    street,
    line2,
    [city, state].filter(Boolean).join(', ').trim(),
    postal
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean);

  const base = parts.join(' ').replace(/\s+/g, ' ').trim();

  // If it looks like a US address, help the geocoder disambiguate.
  // (Prevents matching the wrong "Union Blvd" in another country.)
  const st = String(state || '').trim();
  const zip = String(postal || '').trim();
  const looksUS = /^[A-Za-z]{2}$/.test(st) && /^\d{5}(-\d{4})?$/.test(zip);
  return looksUS ? `${base} USA` : base;
}

async function geocodeHomeAddress({ addressString, postal, city, state }) {
  // Prefer Google Geocoding for full street addresses (more reliable than city-level geocoders).
  // This uses the existing GOOGLE_MAPS_API_KEY already required for mileage features.
  try {
    // Note: postal/state constraints are applied by the caller via the address string and params.
    // This function is kept for backward-compat, but the real call is done in getMyWeather().
    return await geocodeAddressWithGoogle({ addressText: addressString, countryCode: 'US' });
  } catch {
    // Fallback: Open-Meteo geocoding (no key). Often returns city-level only.
    // For Open-Meteo, ZIP/postal searches work well; full street addresses often do not.
    const url = 'https://geocoding-api.open-meteo.com/v1/search';
    const zip = String(postal || '').trim();
    const st = String(state || '').trim();
    const fallbackName =
      (/^\d{5}(-\d{4})?$/.test(zip) ? zip : '').trim() ||
      [String(city || '').trim(), st].filter(Boolean).join(' ').trim() ||
      addressString;
    const resp = await axios.get(url, {
      params: {
        name: fallbackName,
        count: 1,
        language: 'en',
        format: 'json',
        countryCode: 'US'
      },
      timeout: 8000
    });

    const first = resp?.data?.results?.[0] || null;
    if (!first) return null;

    const lat = Number(first.latitude);
    const lng = Number(first.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      latitude: lat,
      longitude: lng
    };
  }
}

function cmToInches(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n)) return 0;
  return n * 0.3937007874;
}

function cToF(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return null;
  return (n * 9) / 5 + 32;
}

function summarizeSnow({ daily }) {
  const times = daily?.time || [];
  const snowfallCm = daily?.snowfall_sum || [];
  const precipProbMax = daily?.precipitation_probability_max || [];

  const now = new Date();
  const cutoff = now.getTime() + 72 * 60 * 60 * 1000; // next 72h

  let snowLikelyNext72h = false;
  let nextSnowDate = null;
  let maxSnowInchesNext72h = 0;
  let precipProbAtNextSnow = null;

  for (let i = 0; i < times.length; i++) {
    const t = String(times[i] || '');
    const dayStartMs = Date.parse(`${t}T00:00:00`);
    if (!Number.isFinite(dayStartMs)) continue;
    if (dayStartMs > cutoff) continue;

    const snowInches = cmToInches(snowfallCm[i] || 0);
    if (snowInches > 0) {
      snowLikelyNext72h = true;
      if (!nextSnowDate) {
        nextSnowDate = t;
        const p = Number(precipProbMax[i]);
        precipProbAtNextSnow = Number.isFinite(p) ? p : null;
      }
      if (snowInches > maxSnowInchesNext72h) {
        maxSnowInchesNext72h = snowInches;
      }
    }
  }

  return {
    snowLikelyNext72h,
    nextSnowDate,
    maxSnowInchesNext72h: Number(maxSnowInchesNext72h.toFixed(2)),
    precipProbAtNextSnow
  };
}

export const getMyWeather = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const force = String(req.query?.force || '').trim() === '1';
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() === 'development';

    const cached = weatherCacheByUserId.get(userId);
    if (!force && cached && (Date.now() - cached.atMs) < WEATHER_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }

    // Pull home address + cached coords (when present).
    // Best-effort fallback for older DBs without home_lat/home_lng columns.
    let rows = null;
    try {
      const [r] = await pool.execute(
        `SELECT
          home_street_address,
          home_address_line2,
          home_city,
          home_state,
          home_postal_code,
          home_lat,
          home_lng,
          home_geocoded_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      );
      rows = r;
    } catch (e) {
      const [r2] = await pool.execute(
        `SELECT
          home_street_address,
          home_address_line2,
          home_city,
          home_state,
          home_postal_code
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      );
      rows = (r2 || []).map((x) => ({ ...x, home_lat: null, home_lng: null, home_geocoded_at: null }));
    }

    const u = rows?.[0] || null;
    const city = u?.home_city || '';
    const state = u?.home_state || '';
    const postal = u?.home_postal_code || '';
    const street = u?.home_street_address || '';
    const line2 = u?.home_address_line2 || '';

    const hasSomeAddress = !!String(city).trim() || !!String(state).trim() || !!String(postal).trim() || !!String(street).trim();
    if (!hasSomeAddress) {
      const payload = { status: 'missing_home_address' };
      weatherCacheByUserId.set(userId, { atMs: Date.now(), payload });
      return res.json(payload);
    }

    const addressString = buildHomeAddressString({ street, line2, city, state, postal });
    if (!addressString) {
      const payload = { status: 'missing_home_address' };
      weatherCacheByUserId.set(userId, { atMs: Date.now(), payload });
      return res.json(payload);
    }

    let latitude = Number(u?.home_lat);
    let longitude = Number(u?.home_lng);
    let geocodeDebug = null;

    // If caller requests force, clear persisted coords so we re-geocode immediately.
    if (force) {
      latitude = NaN;
      longitude = NaN;
      try {
        await pool.execute(
          `UPDATE users
           SET home_lat = NULL, home_lng = NULL, home_geocoded_at = NULL
           WHERE id = ?`,
          [userId]
        );
      } catch {
        // ignore (older DBs)
      }
    }

    // Re-geocode if:
    // - no coords yet
    // - coords were never timestamped (older DB data)
    // - coords are older than 7 days (keeps drift/bugs from persisting forever)
    const geocodedAtMs = u?.home_geocoded_at ? Date.parse(String(u.home_geocoded_at)) : NaN;
    const geocodeStale = !Number.isFinite(geocodedAtMs) || (Date.now() - geocodedAtMs) > (7 * 24 * 60 * 60 * 1000);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || geocodeStale) {
      let geo = null;
      try {
        geo = await geocodeAddressWithGoogle({
          addressText: addressString,
          postalCode: postal || null,
          state: state || null,
          countryCode: 'US'
        });
        geocodeDebug = { source: 'google', formattedAddress: geo?.formattedAddress || null };
      } catch {
        geocodeDebug = { source: 'google_failed' };
        geo = await geocodeHomeAddress({ addressString, postal, city, state });
        if (geo) geocodeDebug.fallback = 'open_meteo';
      }
      if (!geo) {
        const payload = { status: 'geocode_failed' };
        if (isDev) {
          payload.debug = { addressString, usedCoords: { latitude, longitude }, geocodeStale, force, geocodeDebug };
        }
        weatherCacheByUserId.set(userId, { atMs: Date.now(), payload });
        return res.json(payload);
      }

      latitude = geo.latitude;
      longitude = geo.longitude;

      // Best-effort store for future requests.
      try {
        await pool.execute(
          `UPDATE users
           SET home_lat = ?, home_lng = ?, home_geocoded_at = NOW()
           WHERE id = ?`,
          [latitude, longitude, userId]
        );
      } catch {
        // ignore (older DBs)
      }
    }

    let forecastResp = null;
    try {
      forecastResp = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude,
          longitude,
          timezone: 'auto',
          forecast_days: 7,
          temperature_unit: 'fahrenheit',
          wind_speed_unit: 'mph',
          precipitation_unit: 'inch',
          current: 'temperature_2m,weather_code',
          daily: 'snowfall_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code'
        },
        timeout: 15000
      });
    } catch (e) {
      const payload = { status: 'forecast_failed' };
      if (isDev) {
        payload.debug = {
          addressString,
          usedCoords: { latitude, longitude },
          geocodeStale,
          force,
          geocodeDebug,
          error: String(e?.message || '').slice(0, 200)
        };
      }
      weatherCacheByUserId.set(userId, { atMs: Date.now(), payload });
      return res.json(payload);
    }

    const data = forecastResp?.data || {};
    const current = data.current || {};
    const currentUnits = data.current_units || {};
    const daily = data.daily || {};

    const snow = summarizeSnow({ daily });

    const rawTemp = Number(current.temperature_2m);
    const unit = String(currentUnits.temperature_2m || '').trim();
    // Safety: if upstream returned °C (or any non-F unit), convert to Fahrenheit for the UI.
    const temperatureF = Number.isFinite(rawTemp)
      ? (unit === '°C' || unit.toLowerCase() === 'c' ? cToF(rawTemp) : rawTemp)
      : null;

    const payload = {
      status: 'ok',
      location: {
        latitude,
        longitude
      },
      current: {
        temperatureF: typeof temperatureF === 'number' ? temperatureF : null,
        weatherCode: Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : null
      },
      snow
    };

    // Helpful debug info in development only.
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'development') {
      payload.debug = {
        addressString,
        usedCoords: { latitude, longitude },
        geocodeStale,
        force,
        geocodeDebug
      };
    }

    weatherCacheByUserId.set(userId, { atMs: Date.now(), payload });
    return res.json(payload);
  } catch (e) {
    // Never break the navbar UI due to upstream weather issues.
    // Return a stable response the frontend can render.
    try {
      const payload = { status: 'unavailable' };
      if (String(process.env.NODE_ENV || '').toLowerCase() === 'development') {
        payload.debug = { error: String(e?.message || '').slice(0, 200) };
      }
      return res.json(payload);
    } catch {
      return next(e);
    }
  }
};

