/**
 * School-onboarding Hogwarts demo context.
 * When active, school-portal API calls are rewritten to public demo endpoints
 * so the real SchoolPortalView can render without a live login session.
 */

export const SCHOOL_ONBOARDING_PUBLIC_DEMO_TOKEN = 'public';

let activeToken = null;
let activeSchoolId = null;
let standaloneDemo = false;

export function activateSchoolOnboardingDemo({ token, schoolId, standalone = false } = {}) {
  activeToken = String(token || '').trim() || null;
  activeSchoolId = Number(schoolId || 0) || null;
  standaloneDemo = !!standalone;
}

export function deactivateSchoolOnboardingDemo() {
  activeToken = null;
  activeSchoolId = null;
  standaloneDemo = false;
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

export function isSchoolOnboardingStandaloneDemo() {
  return standaloneDemo;
}

/** True when the current route is a school-onboarding Hogwarts demo page. */
export function isSchoolOnboardingDemoRoute(routeOrPath) {
  if (!routeOrPath) return false;
  const path = typeof routeOrPath === 'string' ? routeOrPath : String(routeOrPath?.path || '');
  const name = typeof routeOrPath === 'string' ? '' : String(routeOrPath?.name || '');
  return (
    /^\/school-onboarding\/demo\/?$/i.test(path) ||
    /^\/school-onboarding\/[^/]+\/demo\/?$/i.test(path) ||
    name === 'SchoolOnboardingStandaloneDemo' ||
    name === 'SchoolOnboardingDemo'
  );
}

export function buildSchoolOnboardingStandaloneDemoPath() {
  return '/school-onboarding/demo';
}

function demoPortalBase() {
  return standaloneDemo
    ? '/public/school-onboarding/demo/portal'
    : `/public/school-onboarding/${encodeURIComponent(activeToken)}/demo/portal`;
}

/**
 * Rewrite authenticated school-portal URLs (and a few related APIs) to public demo portal URLs.
 * Returns null when no rewrite applies.
 */
export function rewriteSchoolPortalUrlForDemo(url) {
  if (!activeToken) return null;
  const raw = String(url || '');
  const pathOnly = raw.split('?')[0];
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  const base = demoPortalBase();

  // Match /school-portal/:orgId/... or /api/school-portal/:orgId/...
  const m = pathOnly.match(/^(?:\/api)?\/school-portal\/(\d+)(?:\/(.*))?$/i);
  if (m) {
    const orgId = Number(m[1]);
    if (activeSchoolId && orgId && orgId !== activeSchoolId) {
      // Keep demo locked to Hogwarts only.
      return null;
    }
    const rest = String(m[2] || '').replace(/^\/+/, '');
    if (!rest) return `${base}${query}`;
    return `${base}/${rest}${query}`;
  }

  // Messages, Contact Admin, client tickets, and notification prefs are not under school-portal.
  const chat = pathOnly.match(/^(?:\/api)?\/chat\/(.*)$/i);
  if (chat) {
    return `${base}/chat/${chat[1]}${query}`;
  }

  const tickets = pathOnly.match(/^(?:\/api)?\/support-tickets(?:\/(.*))?$/i);
  if (tickets) {
    const rest = String(tickets[1] || '').replace(/^\/+/, '');
    return rest ? `${base}/support-tickets/${rest}${query}` : `${base}/support-tickets${query}`;
  }

  const prefs = pathOnly.match(/^(?:\/api)?\/users\/(\d+)\/preferences$/i);
  if (prefs) {
    return `${base}/users/${prefs[1]}/preferences${query}`;
  }

  const psychotherapy = pathOnly.match(/^(?:\/api)?\/psychotherapy-compliance\/summary$/i);
  if (psychotherapy) {
    return `${base}/psychotherapy-compliance/summary${query}`;
  }

  return null;
}
