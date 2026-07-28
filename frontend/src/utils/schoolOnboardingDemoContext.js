/**
 * School-onboarding Hogwarts demo context.
 * When active, school-portal API calls are rewritten to public demo endpoints
 * so the real SchoolPortalView can render without a live login session.
 */

let activeToken = null;
let activeSchoolId = null;

export function activateSchoolOnboardingDemo({ token, schoolId } = {}) {
  activeToken = String(token || '').trim() || null;
  activeSchoolId = Number(schoolId || 0) || null;
}

export function deactivateSchoolOnboardingDemo() {
  activeToken = null;
  activeSchoolId = null;
}

export function getSchoolOnboardingDemoToken() {
  return activeToken;
}

export function getSchoolOnboardingDemoSchoolId() {
  return activeSchoolId;
}

export function isSchoolOnboardingDemoActive() {
  return !!activeToken;
}

/**
 * Rewrite authenticated school-portal URLs to public demo portal URLs.
 * Returns null when no rewrite applies.
 */
export function rewriteSchoolPortalUrlForDemo(url) {
  if (!activeToken) return null;
  const raw = String(url || '');
  const pathOnly = raw.split('?')[0];
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';

  // Match /school-portal/:orgId/... or /api/school-portal/:orgId/...
  const m = pathOnly.match(/^(?:\/api)?\/school-portal\/(\d+)(?:\/(.*))?$/i);
  if (!m) return null;

  const orgId = Number(m[1]);
  if (activeSchoolId && orgId && orgId !== activeSchoolId) {
    // Keep demo locked to Hogwarts only.
    return null;
  }

  const rest = String(m[2] || '').replace(/^\/+/, '');
  const base = `/public/school-onboarding/${encodeURIComponent(activeToken)}/demo/portal`;
  if (!rest) return `${base}${query}`;
  return `${base}/${rest}${query}`;
}
