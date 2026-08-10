/**
 * Canonical admin page keys — mirror of frontend/src/utils/normalizeAdminPageKey.js
 */

const ALIASES = Object.freeze({
  'admin-dashboard': 'dashboard',
  admin: 'dashboard',
});

export function normalizeAdminPageKey(pageOrPath) {
  if (!pageOrPath) return 'dashboard';
  let key = String(pageOrPath).replace(/^\/+|\/+$/g, '').toLowerCase();
  key = key.replace(/^[^/]+\/admin\/?/, '').replace(/^admin\/?/, '') || 'dashboard';
  return ALIASES[key] || key;
}

export function extractAdminPageFromPath(path) {
  const raw = String(path || '');
  if (/\/client-exchange(\/|$)/i.test(raw)) return 'client-exchange';
  if (/\/schedule\//i.test(raw)) {
    const match = raw.match(/\/schedule\/([^/?]+)/i);
    return match ? `schedule/${match[1].toLowerCase()}` : 'schedule';
  }
  if (/\/buildings\/schedule/i.test(raw)) return 'buildings/schedule';
  if (/\/buildings(\/|$)/i.test(raw)) return 'buildings';

  const stripped = raw
    .replace(/^\/[^/]+\/admin\/?/, '')
    .replace(/^\/admin\/?/, '');
  return normalizeAdminPageKey(stripped || 'dashboard');
}
