import { normalizeOutreachName } from '../data/coloradoOutreachSchools.js';

export const WINDCHIME_ORIGIN = {
  label: 'Windchime (main office)',
  address: '437 Windchime Place, Colorado Springs, CO 80919',
  lat: 38.9246,
  lng: -104.8452
};

const CITY_COORDS = {
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
