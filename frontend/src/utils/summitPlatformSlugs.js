/**
 * Single source of truth for “Summit Stats platform tenant” URL slugs (SSC, SSTC, legacy names, env overrides).
 *
 * When the platform org slug changes (e.g. summit-stats → ssc, or per-env VITE_*), update **only** this module
 * so routes, guards, dashboards, and chrome stay aligned — do not scatter `'ssc' === slug` checks.
 */

const norm = (s) => String(s || '').toLowerCase().trim();

/** Canonical native / default portal segment (Capacitor redirects, fallbacks). */
export const NATIVE_APP_ORG_SLUG = String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'sstc')
  .trim()
  .toLowerCase();

const ENV_SUMMIT_PLATFORM = String(import.meta.env.VITE_SUMMIT_STATS_PLATFORM_SLUG || '')
  .trim()
  .toLowerCase();

/** Every slug that should behave as the Summit platform org in `/:slug/...` routes. */
export const SUMMIT_PLATFORM_ROUTE_SLUGS = new Set(
  ['ssc', 'sstc', 'summit-stats', NATIVE_APP_ORG_SLUG, ENV_SUMMIT_PLATFORM].filter(Boolean).map(norm)
);

export function isSummitPlatformRouteSlug(slug) {
  return SUMMIT_PLATFORM_ROUTE_SLUGS.has(norm(slug));
}
