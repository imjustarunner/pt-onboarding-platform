import axios from 'axios';
import pool from '../config/database.js';
import { geocodeAddressWithGoogle } from '../services/googleGeocode.service.js';
import User from '../models/User.model.js';
import { normalizeWeatherForecast } from '../services/weatherForecast.js';
import { cachedWeatherForecast } from '../services/weatherForecastCache.js';
import { resolveWeatherLocation } from '../services/weatherLocation.service.js';

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
  // Google has already been tried by the caller. Use the existing public fallback once.
  const zip = String(postal || '').trim();
  const name = /^\d{5}(-\d{4})?$/.test(zip) ? zip.slice(0, 5)
    : [String(city || '').trim(), String(state || '').trim()].filter(Boolean).join(', ') || addressString;
  const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
    params: { name, count: 1, language: 'en', format: 'json', countryCode: 'US' }, timeout: 8000
  });
  const first = response.data?.results?.find(result => result.country_code === 'US');
  if (!first) return null;
  const latitude = Number(first.latitude), longitude = Number(first.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export const getMyWeather = async (req, res, next) => {
  try {
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() === 'development';

    let userId = req.user?.id;
    if (!userId) {
      // Some sessions (ex: approved_employee tokens) don't include a users-table id.
      // Best-effort: map by email/username to the real users-table record when it exists.
      const emailish = String(req.user?.email || '').trim().toLowerCase();
      if (emailish) {
        try {
          const u = await User.findByEmail(emailish);
          if (u?.id) userId = Number(u.id);
        } catch {
          // ignore
        }
      }
    }
    if (!userId) {
      // Best-effort navbar feature: do not hard-fail the session if cookies are blocked or missing.
      const payload = { status: 'unauthenticated' };
      if (isDev) {
        payload.debug = {
          hasAuthCookie: !!req.cookies?.authToken,
          reqUser: req.user || null
        };
      }
      return res.json(payload);
    }

    const force = String(req.query?.force || '').trim() === '1';

    const scheduleView = req.query?.view === 'schedule';
    const cacheKey = `${userId}:${scheduleView ? 'schedule' : 'home'}`;
    const cached = weatherCacheByUserId.get(cacheKey);
    if (!force && cached && (Date.now() - cached.atMs) < (cached.payload.status === 'ok' && !cached.payload.stale ? WEATHER_CACHE_TTL_MS : 60_000)) {
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

    const location = await resolveWeatherLocation(userId, rows?.[0] || null, { officeFallback: scheduleView });
    const u = location.home;
    const city = u?.home_city || '';
    const state = u?.home_state || '';
    const postal = u?.home_postal_code || '';
    const street = u?.home_street_address || '';
    const line2 = u?.home_address_line2 || '';

    const hasSomeAddress = !!String(city).trim() || !!String(state).trim() || !!String(postal).trim() || !!String(street).trim();
    if (!hasSomeAddress) {
      const payload = { status: 'missing_home_address' };
      if (isDev) {
        payload.debug = {
          hasSomeAddress,
          home: { street, line2, city, state, postal }
        };
      }
      weatherCacheByUserId.set(cacheKey, { atMs: Date.now(), payload });
      return res.json(payload);
    }

    // If the address is too incomplete to geocode reliably (common when only street/apt is filled),
    // treat it as "missing" so the UI prompts the user to complete it (city/state/ZIP).
    const zip = String(postal || '').trim();
    const st = String(state || '').trim().toUpperCase();
    const zipOk = /^\d{5}(-\d{4})?$/.test(zip);
    const hasCityState = !!String(city || '').trim() && /^[A-Z]{2}$/.test(st);
    if (!zipOk && !hasCityState) {
      const payload = { status: 'missing_home_address' };
      if (isDev) {
        payload.debug = {
          reason: 'home_address_incomplete_for_geocoding',
          home: { street, line2, city, state, postal },
          zipOk,
          hasCityState
        };
      }
      weatherCacheByUserId.set(cacheKey, { atMs: Date.now(), payload });
      return res.json(payload);
    }

    const addressString = buildHomeAddressString({ street, line2, city, state, postal });
    if (!addressString) {
      const payload = { status: 'missing_home_address' };
      if (isDev) {
        payload.debug = {
          hasSomeAddress,
          home: { street, line2, city, state, postal },
          addressString
        };
      }
      weatherCacheByUserId.set(cacheKey, { atMs: Date.now(), payload });
      return res.json(payload);
    }

    let latitude = u?.home_lat == null ? NaN : Number(u.home_lat);
    let longitude = u?.home_lng == null ? NaN : Number(u.home_lng);
    let geocodeDebug = null;

    // Re-geocode if:
    // - no coords yet
    // - coords were never timestamped (older DB data)
    // - coords are older than 7 days (keeps drift/bugs from persisting forever)
    const geocodedAtMs = u?.home_geocoded_at ? Date.parse(String(u.home_geocoded_at)) : NaN;
    const geocodeStale = !Number.isFinite(geocodedAtMs) || (Date.now() - geocodedAtMs) > (7 * 24 * 60 * 60 * 1000);

    if (force || !Number.isFinite(latitude) || !Number.isFinite(longitude) || geocodeStale) {
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
      }
      if (!geo) {
        try { geo = await geocodeHomeAddress({ addressString, postal, city, state }); } catch { /* Keep valid saved coordinates during a geocoder outage. */ }
        if (geo) geocodeDebug = { source: 'open_meteo' };
      }
      if (!geo && Number.isFinite(latitude) && Number.isFinite(longitude)) geo = { latitude, longitude };
      if (!geo) {
        const payload = { status: 'geocode_failed' };
        if (isDev) {
          payload.debug = { addressString, usedCoords: { latitude, longitude }, geocodeStale, force, geocodeDebug };
        }
        weatherCacheByUserId.set(cacheKey, { atMs: Date.now(), payload });
        return res.json(payload);
      }

      latitude = geo.latitude;
      longitude = geo.longitude;

      // Office coordinates must never overwrite the user's saved home coordinates.
      try {
        if (location.source === 'home')
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

    let forecast;
    try {
      forecast = await cachedWeatherForecast({ latitude, longitude });
    } catch {
      const payload = { status: 'forecast_failed', retryAfterSeconds: 60 };
      weatherCacheByUserId.set(cacheKey, { atMs: Date.now(), payload });
      return res.json(payload);
    }
    const data = forecast.data;
    const normalized = normalizeWeatherForecast(data, 22);
    if (!scheduleView) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: data.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      normalized.forecastDays = normalized.forecastDays.filter(day => day.date >= today).slice(0, 7);
    }
    const payload = { status: 'ok',
      location: { latitude, longitude, label: location.label, source: location.source },
      ...normalized, fetchedAt: forecast.fetchedAt, stale: forecast.stale
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

    weatherCacheByUserId.set(cacheKey, { atMs: Date.now(), payload });
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

