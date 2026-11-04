import { getSchoolPublicOrigin } from './publicIntakeUrl.js';

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
 * School paper packets share the school public origin, including from tenant app hosts.
 */
export function buildPublicSchoolPrintablePacketUrl(slugOrId, locale = 'en', { origin, apiBase } = {}) {
  const publicOrigin = getSchoolPublicOrigin(origin);
  if (['juniper-lantern-demo', '990001'].includes(packetKey(slugOrId))) {
    return `${publicOrigin}/downloads/demo-enrollment-${normalizeLocale(locale)}.pdf`;
  }
  const path = publicSchoolPrintablePacketApiPath(slugOrId, locale);
  if (!path) return '';
  const base = String(apiBase || '').replace(/\/$/, '');
  let prefix = base || '/api';
  if (/^https?:\/\//.test(base)) {
    try {
      const apiUrl = new URL(base);
      if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(publicOrigin).hostname)) return `${apiUrl.origin}${apiUrl.pathname.replace(/\/$/, '')}${path}`;
      prefix = apiUrl.pathname.replace(/\/$/, '') || '/api';
    } catch { prefix = '/api'; }
  }
  if (!/^\/(?!\/)[^?#]*$/.test(prefix)) prefix = '/api';
  return `${publicOrigin}${prefix}${path}`;
}
