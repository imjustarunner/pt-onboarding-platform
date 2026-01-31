import axios from 'axios';
import config from '../config/config.js';

export async function geocodeAddressWithGoogle({ addressText, postalCode = null, state = null, countryCode = 'US' }) {
  const apiKey = config.googleMaps?.apiKey || null;
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

