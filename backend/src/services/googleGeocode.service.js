import axios from 'axios';
import config from '../config/config.js';
import {
  buildSchoolPlaceSearchQueries,
  CITY_COORDS,
  pickBestSchoolPlaceCandidate
} from '../utils/outreachHubPure.js';

function mapsApiKey() {
  return config.googleMaps?.apiKey || null;
}

function isMapsDenied(errOrStatus, message = '') {
  const msg = String(message || errOrStatus?.message || errOrStatus || '');
  return errOrStatus?.code === 'MAPS_KEY_MISSING' || msg.includes('REQUEST_DENIED');
}

export async function geocodeAddressWithGoogle({ addressText, postalCode = null, state = null, countryCode = 'US' }) {
  const apiKey = mapsApiKey();
  if (!apiKey) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not configured');
    err.code = 'MAPS_KEY_MISSING';
    throw err;
  }

  const pc = postalCode ? String(postalCode).trim() : '';
  const st = state ? String(state).trim().toUpperCase() : '';
  const cc = String(countryCode || 'US').trim().toUpperCase();
  const parts = [];
  if (cc) parts.push(`country:${cc}`);
  if (pc) parts.push(`postal_code:${pc}`);
  if (st && /^[A-Z]{2}$/.test(st)) parts.push(`administrative_area:${st}`);

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const resp = await axios.get(url, {
    params: {
      address: String(addressText || '').trim(),
      key: apiKey,
      // Bias geocoding to the US and, when available, the user's postal code/state.
      region: cc === 'US' ? 'us' : undefined,
      components: parts.length ? parts.join('|') : undefined
    },
    timeout: 15000
  });

  const data = resp?.data || {};
  const status = String(data.status || 'UNKNOWN');
  const apiErrorMessage = typeof data?.error_message === 'string' ? data.error_message.trim() : '';

  const first = data?.results?.[0] || null;
  const loc = first?.geometry?.location || null;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);

  if (status !== 'OK' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    const details = apiErrorMessage ? `: ${apiErrorMessage}` : '';
    const err = new Error(`Geocoding failed (${status})${details}`);
    err.code = 'MAPS_GEOCODE_FAILED';
    throw err;
  }

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: first?.formatted_address || null
  };
}

async function textSearchPlaces(query, { locationBias = null, radiusMeters = 45000 } = {}) {
  const apiKey = mapsApiKey();
  if (!apiKey) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not configured');
    err.code = 'MAPS_KEY_MISSING';
    throw err;
  }
  const params = {
    query: String(query || '').trim(),
    key: apiKey,
    region: 'us'
  };
  if (locationBias?.lat != null && locationBias?.lng != null) {
    params.location = `${locationBias.lat},${locationBias.lng}`;
    params.radius = Math.min(Math.max(Number(radiusMeters) || 45000, 5000), 50000);
  }
  const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
  const resp = await axios.get(url, { params, timeout: 15000 });
  const data = resp?.data || {};
  const status = String(data.status || 'UNKNOWN');
  const apiErrorMessage = typeof data?.error_message === 'string' ? data.error_message.trim() : '';
  if (status === 'ZERO_RESULTS') return [];
  if (status !== 'OK') {
    const details = apiErrorMessage ? `: ${apiErrorMessage}` : '';
    const err = new Error(`Places search failed (${status})${details}`);
    err.code = 'MAPS_PLACES_FAILED';
    throw err;
  }
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Resolve a Colorado school to a street address via Google Places Text Search
 * (school name + city/district). Falls back to Geocoding when Places returns nothing.
 */
export async function searchSchoolPlaceWithGoogle({
  name,
  city,
  districtName,
  state = 'CO',
  countryCode = 'US'
}) {
  const schoolName = String(name || '').trim();
  const cityKey = String(city || '').trim().toLowerCase();
  const locationBias = CITY_COORDS[cityKey] || null;
  const queries = buildSchoolPlaceSearchQueries({ name: schoolName, city, districtName });
  if (!queries.length) {
    const err = new Error('School name and city are required for place search');
    err.code = 'MAPS_PLACES_FAILED';
    throw err;
  }

  let blocked = false;
  for (const query of queries) {
    try {
      const results = await textSearchPlaces(query, { locationBias });
      const hit = pickBestSchoolPlaceCandidate(schoolName, results);
      if (!hit) continue;
      const loc = hit?.geometry?.location || null;
      const lat = Number(loc?.lat);
      const lng = Number(loc?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      return {
        latitude: lat,
        longitude: lng,
        formattedAddress: hit.formatted_address || null,
        placeName: hit.name || null,
        source: 'places_text_search'
      };
    } catch (e) {
      if (isMapsDenied(e)) {
        blocked = true;
        break;
      }
      if (String(e?.message || '').includes('REQUEST_DENIED')) {
        blocked = true;
        break;
      }
    }
  }

  if (blocked) {
    const err = new Error('Places search failed (REQUEST_DENIED)');
    err.code = 'MAPS_PLACES_FAILED';
    throw err;
  }

  const fallbackQuery = `${schoolName}, ${city || districtName || ''}, Colorado`.replace(/,\s*,/g, ',').trim();
  const geo = await geocodeAddressWithGoogle({
    addressText: fallbackQuery,
    state,
    countryCode
  });
  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    formattedAddress: geo.formattedAddress,
    placeName: schoolName,
    source: 'geocode_fallback'
  };
}

export async function reverseGeocodeWithGoogle({ latitude, longitude }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('latitude and longitude are required');
  }

  const apiKey = config.googleMaps?.apiKey || null;
  if (!apiKey) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not configured');
    err.code = 'MAPS_KEY_MISSING';
    throw err;
  }

  const url = 'https://maps.googleapis.com/maps/api/geocode/json';
  const resp = await axios.get(url, {
    params: {
      latlng: `${lat},${lng}`,
      key: apiKey
    },
    timeout: 15000
  });

  const data = resp?.data || {};
  const status = String(data.status || 'UNKNOWN');
  const first = data?.results?.[0] || null;
  if (status !== 'OK' || !first) {
    const err = new Error(`Reverse geocoding failed (${status})`);
    err.code = 'MAPS_GEOCODE_FAILED';
    throw err;
  }

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: first?.formatted_address || null
  };
}

