function normalizeLocale(locale) {
  return String(locale || 'en').trim().toLowerCase().startsWith('es') ? 'es' : 'en';
}

function packetKey(slugOrId) {
  return String(slugOrId || '').trim();
}

/**
 * Public paper-packet PDF path under the API prefix (`/public/schools/:slug/printable-packet`).
 */
export function publicSchoolPrintablePacketApiPath(slugOrId, locale = 'en') {
  const key = packetKey(slugOrId);
  if (!key) return '';
  const loc = normalizeLocale(locale);
  return `/public/schools/${encodeURIComponent(key.toLowerCase())}/printable-packet?locale=${loc}`;
}

/**
 * Absolute public printable-packet URL.
 * Uses the same API host as other app calls (`api.defaults.baseURL`).
 */
export function buildPublicSchoolPrintablePacketUrl(slugOrId, locale = 'en', { origin, apiBase } = {}) {
  const path = publicSchoolPrintablePacketApiPath(slugOrId, locale);
  if (!path) return '';
  const base = String(apiBase || '').replace(/\/$/, '');
  if (base.startsWith('http')) return `${base}${path}`;
  const originClean = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const prefix = base || '/api';
  return `${originClean}${prefix}${path}`;
}
