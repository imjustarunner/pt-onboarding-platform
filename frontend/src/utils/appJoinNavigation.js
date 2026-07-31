/**
 * In-app video join links (supervision / team meetings).
 * Prefer same-tab navigation on the current origin so the existing session
 * (cookies + localStorage JWT) is preserved — critical on iPad Safari where
 * window.open(..., 'noreferrer') often lands as an unauthenticated join page.
 */

const APP_JOIN_PATH_RE = /\/join\/(supervision|team-meeting)\//i;

/**
 * @param {string} link
 * @returns {{ path: string, pathname: string } | null}
 */
export function extractAppJoinLocation(link) {
  const raw = String(link || '').trim();
  if (!raw) return null;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(raw, base);
    if (!APP_JOIN_PATH_RE.test(url.pathname)) return null;
    // Always use path on the current host — ignore FRONTEND_URL host mismatches
    // (www vs apex, staging aliases, etc.) so auth stays with this tab.
    return {
      path: `${url.pathname}${url.search}${url.hash}`,
      pathname: url.pathname
    };
  } catch {
    return null;
  }
}

/**
 * Navigate to an in-app join URL in the same tab, or open external links.
 * @param {import('vue-router').Router} router
 * @param {string} link
 * @param {{ externalTarget?: string }} [opts]
 * @returns {boolean} true if handled
 */
export function navigateToJoinLink(router, link, opts = {}) {
  const app = extractAppJoinLocation(link);
  if (app?.path && router) {
    void router.push(app.path);
    return true;
  }
  const raw = String(link || '').trim();
  if (!raw) return false;
  // Do not use 'noreferrer' — it can drop first-party auth context on iOS Safari.
  window.open(raw, opts.externalTarget || '_blank', 'noopener');
  return true;
}
