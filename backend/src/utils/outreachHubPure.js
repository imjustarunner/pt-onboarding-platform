import { normalizeOutreachName } from '../data/coloradoOutreachSchools.js';

export const WINDCHIME_ORIGIN = {
  label: 'Windchime (main office)',
  address: '437 Windchime Place, Colorado Springs, CO 80919',
  lat: 38.9246,
  lng: -104.8452
};

export const CITY_COORDS = {
  denver: { lat: 39.7392, lng: -104.9903 },
  aurora: { lat: 39.7294, lng: -104.8319 },
  pueblo: { lat: 38.2544, lng: -104.6091 },
  'fort collins': { lat: 40.5853, lng: -105.0844 },
  'colorado springs': { lat: 38.8339, lng: -104.8214 }
};

export function scoreNameMatch(directoryName, orgName) {
  const a = normalizeOutreachName(directoryName);
  const b = normalizeOutreachName(orgName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const aCompact = a.replace(/\s+/g, '');
  const bCompact = b.replace(/\s+/g, '');
  if (aCompact === bCompact) return 95;
  if (a.includes(b) || b.includes(a) || aCompact.includes(bCompact) || bCompact.includes(aCompact)) return 80;
  const aParts = new Set(a.split(' ').filter(Boolean));
  const bParts = b.split(' ').filter(Boolean);
  if (!bParts.length) return 0;
  const hit = bParts.filter((p) => aParts.has(p)).length;
  if (hit === bParts.length && bParts.length >= 1) return 70;
  return 0;
}

export function canAutoPartnerDistrict(district) {
  const d = String(district || '').toLowerCase();
  if (d.includes('aurora')) return false;
  return d.includes('denver public');
}

export function isValidMapCoordinate(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  return true;
}

export function haversineMiles(a, b) {
  if (!a || !b || !isValidMapCoordinate(a.lat, a.lng) || !isValidMapCoordinate(b.lat, b.lng)) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

export function isPlaceholderOutreachAddress(row) {
  const name = String(row?.name || '').trim();
  const city = String(row?.city || '').trim();
  const address = String(row?.address || '').trim();
  if (!address) return true;
  const placeholder = `${name}, ${city}, CO`;
  if (address === placeholder) return true;
  return !/\d/.test(address);
}

export function buildSchoolPlaceSearchQueries({ name, city, districtName }) {
  const n = String(name || '').trim();
  const c = String(city || '').trim();
  const d = String(districtName || '').trim();
  const queries = [];
  if (n && c) queries.push(`${n}, ${c}, Colorado`);
  if (n && d && d !== c) queries.push(`${n}, ${d}, Colorado`);
  if (n && c) queries.push(`${n} school ${c} CO`);
  return queries;
}

const SCHOOL_PLACE_TYPES = new Set([
  'school',
  'primary_school',
  'secondary_school',
  'point_of_interest',
  'establishment'
]);

export function scoreSchoolPlaceCandidate(schoolName, place) {
  const addr = String(place?.formatted_address || '').trim();
  if (!addr || !/\b(CO|Colorado)\b/i.test(addr)) return 0;
  if (!/\d/.test(addr)) return 0;
  const types = Array.isArray(place?.types) ? place.types : [];
  const isSchoolish = types.some((t) => SCHOOL_PLACE_TYPES.has(String(t)));
  let score = scoreNameMatch(schoolName, place?.name || '');
  if (isSchoolish) score += 15;
  if (/\d/.test(addr)) score += 10;
  return score;
}

export function pickBestSchoolPlaceCandidate(schoolName, results) {
  let best = null;
  let bestScore = 0;
  for (const place of results || []) {
    const score = scoreSchoolPlaceCandidate(schoolName, place);
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  return bestScore >= 65 ? best : null;
}

export function formatOutreachAddressLine(parts = []) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function schoolMapPoint(school) {
  const lat = school?.lat;
  const lng = school?.lng;
  if (lat != null && lng != null && isValidMapCoordinate(lat, lng)) {
    return { lat: Number(lat), lng: Number(lng), approx: false };
  }
  const city = String(school?.city || '').trim().toLowerCase();
  const hit = CITY_COORDS[city];
  if (hit) return { ...hit, approx: true };
  return null;
}
