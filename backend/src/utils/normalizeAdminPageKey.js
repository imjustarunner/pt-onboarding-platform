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
  const stripped = String(path || '')
    .replace(/^\/[^/]+\/admin\/?/, '')
    .replace(/^\/admin\/?/, '');
  return normalizeAdminPageKey(stripped || 'dashboard');
}
