import crypto from 'node:crypto';
import axios from 'axios';
import config from '../config/config.js';

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const localeOf = value => String(value || '').toLowerCase().startsWith('es') ? 'es' : 'en';
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
export function addressFromPlace(place = {}) {
  const parts = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const part = (type, short = false) => { const p = parts.find(row => row.types?.includes(type)); return String((short ? p?.shortText : p?.longText) || p?.longText || '').trim(); };
  const street = [part('street_number'), part('route')].filter(Boolean).join(' ');
  return { street, city: part('locality') || part('postal_town') || part('sublocality_level_1') || part('administrative_area_level_3'),
    state: part('administrative_area_level_1', true), postalCode: [part('postal_code'), part('postal_code_suffix')].filter(Boolean).join('-'),
    country: part('country', true), formattedAddress: String(place.formattedAddress || '').trim() };
}

/** Only minimal address text and an anonymous random session token leave the server. */
export function createAddressAutocompleteService({ http = axios, apiKey = () => config.googleMaps?.apiKey, now = Date.now } = {}) {
  const key = () => { const value = apiKey(); if (!value) throw fail(503, 'Address suggestions are unavailable. Enter the address manually.', 'ADDRESS_LOOKUP_UNAVAILABLE'); return value; };
  function signature(payload) { return crypto.createHmac('sha256', key()).update(payload).digest('base64url'); }
  function permit(placeId, sessionToken, scope) {
    const payload = Buffer.from(JSON.stringify({ p: placeId, s: sessionToken, c: scope, e: now() + 10 * 60 * 1000 })).toString('base64url');
    return `${payload}.${signature(payload)}`;
  }
  function readPermit(token, scope) {
    const [payload, mac, extra] = String(token || '').split('.');
    if (!payload || !mac || extra || payload.length > 2000) throw fail(400, 'Choose an address suggestion again.', 'ADDRESS_SELECTION_EXPIRED');
    const actual = Buffer.from(mac), expected = Buffer.from(signature(payload));
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw fail(400, 'Choose an address suggestion again.', 'ADDRESS_SELECTION_EXPIRED');
    let data; try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw fail(400, 'Choose an address suggestion again.', 'ADDRESS_SELECTION_EXPIRED'); }
    if (data.c !== scope || data.e <= now() || !uuid(data.s) || !/^[A-Za-z0-9_-]{1,255}$/.test(data.p || '')) throw fail(400, 'Choose an address suggestion again.', 'ADDRESS_SELECTION_EXPIRED');
    return data;
  }
  async function suggest({ query, sessionToken, locale, scope }) {
    const input = String(query || '').trim();
    if (input.length < 3 || input.length > 200 || /[\x00-\x1f]/.test(input) || !uuid(sessionToken)) throw fail(400, 'Enter at least three address characters.', 'INVALID_ADDRESS_QUERY');
    const response = await http.post('https://places.googleapis.com/v1/places:autocomplete', {
      input, sessionToken, languageCode: localeOf(locale), regionCode: 'US', includedRegionCodes: ['us'], includeQueryPredictions: false
    }, { timeout: 6000, headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text', 'Content-Type': 'application/json' } });
    return (response.data?.suggestions || []).flatMap(row => {
      const p = row.placePrediction, id = String(p?.placeId || '');
      if (!/^[A-Za-z0-9_-]{1,255}$/.test(id) || !p?.text?.text) return [];
      return [{ label: String(p.text.text).slice(0, 350), selectionToken: permit(id, sessionToken, scope) }];
    }).slice(0, 5);
  }
  async function select({ selectionToken, locale, scope }) {
    const permitted = readPermit(selectionToken, scope);
    const response = await http.get(`https://places.googleapis.com/v1/places/${encodeURIComponent(permitted.p)}`, {
      params: { sessionToken: permitted.s, languageCode: localeOf(locale), regionCode: 'US' }, timeout: 6000,
      headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'addressComponents,formattedAddress' }
    });
    const address = addressFromPlace(response.data);
    if (address.country && address.country !== 'US') throw fail(400, 'Enter this address manually.', 'ADDRESS_NEEDS_REVIEW');
    if (!address.street || !address.formattedAddress) throw fail(400, 'Enter the street address manually.', 'ADDRESS_NEEDS_REVIEW');
    return address;
  }
  return { suggest, select };
}
export const addressAutocomplete = createAddressAutocompleteService();
