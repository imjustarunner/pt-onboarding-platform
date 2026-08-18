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

export function tripOutboundMiles(stops = []) {
  const legs = (stops || []).map((s) => Number(s.miles_from_prev)).filter((n) => Number.isFinite(n));
  if (!legs.length) return null;
  return Math.round(legs.reduce((a, b) => a + b, 0) * 10) / 10;
}

export function tripReturnMiles(stops = [], origin = WINDCHIME_ORIGIN) {
  const last = (stops || []).at(-1);
  if (!last) return null;
  const pt = {
    lat: last.lat != null ? Number(last.lat) : null,
    lng: last.lng != null ? Number(last.lng) : null
  };
  return haversineMiles(pt, origin);
}

export function tripRoundTripMiles(stops = [], origin = WINDCHIME_ORIGIN) {
  const outbound = tripOutboundMiles(stops);
  const home = tripReturnMiles(stops, origin);
  if (outbound == null && home == null) return null;
  return Math.round(((outbound || 0) + (home || 0)) * 10) / 10;
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

export function normalizePlaceSearchResult(place) {
  if (!place) return null;
  if (place.formatted_address || place.geometry?.location) {
    return place;
  }
  const name = String(place.displayName?.text || place.name || '').trim();
  const formatted_address = String(place.formattedAddress || place.formatted_address || '').trim();
  const loc = place.location || place.geometry?.location || null;
  const lat = Number(loc?.latitude ?? loc?.lat);
  const lng = Number(loc?.longitude ?? loc?.lng);
  if (!formatted_address && !Number.isFinite(lat)) return null;
  return {
    name,
    formatted_address,
    types: Array.isArray(place.types) ? place.types : [],
    geometry: Number.isFinite(lat) && Number.isFinite(lng)
      ? { location: { lat, lng } }
      : null
  };
}

export function pickBestSchoolPlaceCandidate(schoolName, results) {
  let best = null;
  let bestScore = 0;
  for (const raw of results || []) {
    const place = normalizePlaceSearchResult(raw);
    if (!place) continue;
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

/** Fixed palette for trip stop color-coding (cycles by stop order). */
export const OUTREACH_STOP_COLORS = [
  '#16a34a', // green
  '#2563eb', // blue
  '#7c3aed', // purple
  '#ca8a04', // yellow/amber
  '#ea580c', // orange
  '#dc2626'  // red
];

export function stopColorForOrder(stopOrder) {
  const idx = Math.max(0, Number(stopOrder) || 0) % OUTREACH_STOP_COLORS.length;
  return OUTREACH_STOP_COLORS[idx];
}

/**
 * Extra miles vs going A→B directly when inserting C between them.
 * Lower is better (on the way). Null if any leg cannot be computed.
 */
export function detourExtraMiles(pointA, pointC, pointB) {
  const ac = haversineMiles(pointA, pointC);
  const cb = haversineMiles(pointC, pointB);
  const ab = haversineMiles(pointA, pointB);
  if (ac == null || cb == null || ab == null) return null;
  return Math.round((ac + cb - ab) * 10) / 10;
}

/**
 * Rank candidates by how little they add when inserted between A and B.
 * Returns schools with miles_to_a, miles_to_b, extra_miles, miles_from_origin (= extra).
 */
export function rankSchoolsBetweenAnchors(schools, pointA, pointB, { excludeIds = [] } = {}) {
  const skip = new Set((excludeIds || []).map((id) => Number(id)));
  return (schools || [])
    .filter((s) => !skip.has(Number(s.id)))
    .map((s) => {
      const pt = schoolMapPoint(s);
      const milesToA = pointA && pt ? haversineMiles(pointA, pt) : null;
      const milesToB = pointB && pt ? haversineMiles(pt, pointB) : null;
      const extra = pointA && pointB && pt ? detourExtraMiles(pointA, pt, pointB) : null;
      return {
        ...s,
        miles_to_a: milesToA,
        miles_to_b: milesToB,
        extra_miles: extra,
        miles_from_origin: extra,
        distance_approx: !!(pt?.approx)
      };
    })
    .sort((a, b) => {
      if (a.extra_miles == null && b.extra_miles == null) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      if (a.extra_miles == null) return 1;
      if (b.extra_miles == null) return -1;
      if (a.extra_miles !== b.extra_miles) return a.extra_miles - b.extra_miles;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

/**
 * Find the best insert index (0..stops.length) for candidate between first and last
 * anchors that least increases total route miles (Windchime → stops → Windchime ignored;
 * only among consecutive pairs from firstStopIdx to lastStopIdx inclusive of the A→B segment).
 * Prefer inserting strictly between first and last when possible.
 */
export function bestInsertIndexBetween(stops, candidate, firstIdx = 0, lastIdx = null) {
  const list = Array.isArray(stops) ? stops : [];
  const end = lastIdx == null ? Math.max(0, list.length - 1) : lastIdx;
  const start = Math.max(0, Math.min(firstIdx, end));
  const candPt = schoolMapPoint(candidate);
  if (!candPt || list.length < 2 || start >= end) {
    return Math.min(list.length, Math.max(1, end));
  }
  let bestIdx = start + 1;
  let bestExtra = Infinity;
  for (let i = start; i < end; i += 1) {
    const a = schoolMapPoint(list[i]);
    const b = schoolMapPoint(list[i + 1]);
    if (!a || !b) continue;
    const extra = detourExtraMiles(a, candPt, b);
    if (extra == null) continue;
    if (extra < bestExtra) {
      bestExtra = extra;
      bestIdx = i + 1;
    }
  }
  return bestIdx;
}
