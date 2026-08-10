/**
 * Canonical admin page keys for activity logging and frequent-pages dedup.
 * Keep in sync with useNavShortcuts PAGE_META labels.
 */

const ALIASES = Object.freeze({
  'admin-dashboard': 'dashboard',
  admin: 'dashboard',
});

/**
 * @param {string} pageOrPathFragment — raw page key or path segment after /admin/
 * @returns {string} canonical lowercase page key
 */
export function normalizeAdminPageKey(pageOrPath) {
  if (!pageOrPath) return 'dashboard';
  let key = String(pageOrPath).replace(/^\/+|\/+$/g, '').toLowerCase();
  // Strip org slug when a full path slipped through (e.g. itsco/admin/clients)
  key = key.replace(/^[^/]+\/admin\/?/, '').replace(/^admin\/?/, '') || 'dashboard';
  return ALIASES[key] || key;
}

/**
 * @param {string} path — full route path (e.g. /itsco/admin/clients)
 * @returns {string} canonical page key
 */
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
