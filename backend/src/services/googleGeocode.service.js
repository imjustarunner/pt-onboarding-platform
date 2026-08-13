import axios from 'axios';
import config from '../config/config.js';
import {
  buildSchoolPlaceSearchQueries,
  CITY_COORDS,
  normalizePlaceSearchResult,
  pickBestSchoolPlaceCandidate
} from '../utils/outreachHubPure.js';

function mapsApiKey() {
  return config.googleMaps?.apiKey || null;
}

function isMapsDenied(errOrStatus, message = '') {
  const msg = String(message || errOrStatus?.message || errOrStatus || '');
  return errOrStatus?.code === 'MAPS_KEY_MISSING' || msg.includes('REQUEST_DENIED');
}

function hasStreetNumber(address) {
  return /\d/.test(String(address || ''));
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

async function textSearchPlacesLegacy(query, { locationBias = null, radiusMeters = 45000 } = {}) {
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

/** Places API (New) — matches "Places API (New)" in Google Cloud Console. */
async function textSearchPlacesNew(query, { locationBias = null, radiusMeters = 45000 } = {}) {
  const apiKey = mapsApiKey();
  if (!apiKey) {
    const err = new Error('GOOGLE_MAPS_API_KEY is not configured');
    err.code = 'MAPS_KEY_MISSING';
    throw err;
  }

  const body = {
    textQuery: String(query || '').trim(),
    regionCode: 'US',
    languageCode: 'en'
  };
  if (locationBias?.lat != null && locationBias?.lng != null) {
    body.locationBias = {
      circle: {
        center: {
          latitude: Number(locationBias.lat),
          longitude: Number(locationBias.lng)
        },
        radius: Math.min(Math.max(Number(radiusMeters) || 45000, 5000), 50000)
      }
    };
  }

  const url = 'https://places.googleapis.com/v1/places:searchText';
  const resp = await axios.post(url, body, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types'
    }
  });

  const places = Array.isArray(resp?.data?.places) ? resp.data.places : [];
  return places;
}

async function textSearchPlaces(query, options = {}) {
  try {
    return await textSearchPlacesNew(query, options);
  } catch (e) {
    const msg = String(e?.response?.data?.error?.message || e?.message || '');
    if (isMapsDenied(e, msg)) {
      try {
        return await textSearchPlacesLegacy(query, options);
      } catch (legacyErr) {
        const legacyMsg = String(legacyErr?.response?.data?.error_message || legacyErr?.message || '');
        const err = new Error(legacyMsg || msg || 'Places search failed');
        err.code = 'MAPS_PLACES_FAILED';
        throw err;
      }
    }
    if (msg.includes('ZERO_RESULTS')) return [];
    throw e;
  }
}

function placeHitToResolved(hit, source) {
  const normalized = normalizePlaceSearchResult(hit);
  const loc = normalized?.geometry?.location || null;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: normalized?.formatted_address || null,
    placeName: normalized?.name || null,
    source
  };
}

/**
 * Resolve a Colorado school to a street address via Google Places Text Search
 * (school name + city/district). Uses Places API (New) first, then legacy Places,
 * then Geocoding as a last resort.
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

  let placesDenied = false;
  for (const query of queries) {
    try {
      const results = await textSearchPlaces(query, { locationBias });
      const hit = pickBestSchoolPlaceCandidate(schoolName, results);
      const resolved = placeHitToResolved(hit, 'places_text_search');
      if (resolved) return resolved;
    } catch (e) {
      const msg = String(e?.response?.data?.error?.message || e?.message || '');
      if (isMapsDenied(e, msg)) {
        placesDenied = true;
      }
    }
  }

  const fallbackQuery = `${schoolName}, ${city || districtName || ''}, Colorado`.replace(/,\s*,/g, ',').trim();
  try {
    const geo = await geocodeAddressWithGoogle({
      addressText: fallbackQuery,
      state,
      countryCode
    });
    if (!hasStreetNumber(geo.formattedAddress) && placesDenied) {
      const err = new Error('Places search failed (REQUEST_DENIED) and geocode returned no street address');
      err.code = 'MAPS_PLACES_FAILED';
      throw err;
    }
    return {
      latitude: geo.latitude,
      longitude: geo.longitude,
      formattedAddress: geo.formattedAddress,
      placeName: schoolName,
      source: 'geocode_fallback'
    };
  } catch (e) {
    if (placesDenied && isMapsDenied(e)) {
      const err = new Error(
        'Google Maps address lookup denied — check API key restrictions and that Places API (New) + Geocoding API are enabled'
      );
      err.code = 'MAPS_PLACES_FAILED';
      throw err;
    }
    throw e;
  }
}

export async function reverseGeocodeWithGoogle({ latitude, longitude }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('latitude and longitude are required');
  }

  const apiKey = mapsApiKey();
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
