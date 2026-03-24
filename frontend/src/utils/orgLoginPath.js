/**
 * Canonical org login paths:
 * - Agency / top-level portal: /{slug}/login
 * - Child under agency on the **main app host** (e.g. plottwisthq.com): /{parent}/{portal}/login
 * - Same child on a **custom domain that already maps to the agency** (e.g. app.itsco.health ≡ …/itsco):
 *   keep paths **flat** /{portal}/login — the host replaces the /itsco prefix in the URL bar.
 */

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {string} portalSlug — portal segment (e.g. school "rudy")
 * @param {string|null|undefined} parentOrgSlug — parent agency segment (e.g. "itsco") when path should be nested
 * @param {string|null|undefined} hostImpliedAgencySlug — agency the current hostname resolves to (portalHostPortalUrl)
 */
export function buildOrgLoginPath(portalSlug, parentOrgSlug = null, hostImpliedAgencySlug = null) {
  const o = norm(portalSlug);
  if (!o) return '/login';
  const p = norm(parentOrgSlug);
  const h = norm(hostImpliedAgencySlug);

  // Dedicated app host for this agency (e.g. app.itsco.health ≡ portal itsco): login is /login, not /itsco/login.
  if (h && h === o && !p) {
    return '/login';
  }

  // School (or other child) on the parent’s custom domain: host implies parent — /rudy/login not /itsco/rudy/login.
  if (p && h && p === h) {
    return `/${o}/login`;
  }

  if (p && p !== o) {
    return `/${p}/${o}/login`;
  }
  return `/${o}/login`;
}
