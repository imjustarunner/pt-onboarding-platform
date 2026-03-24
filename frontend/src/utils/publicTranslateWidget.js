/**
 * Where to show the Google Translate–powered EN ⇄ ES toggle (public-facing flows only).
 * Uses route meta, name, and path heuristics so we do not offer it on login/admin/staff tools.
 */

const LOGIN_PATH_SNIPPETS = [
  '/login',
  'passwordless',
  '/reset-password',
  '/new_account/',
  '/verify-club-manager',
  '/change-password',
  '/signup/club-manager'
];

/** Route names that are clearly public marketing / intake / events (not staff login). */
const PUBLIC_TRANSLATION_ROUTE_NAMES = new Set([
  'PublicMarketingHub',
  'PublicMarketingHubSubPage',
  'PublicIntakeSigning',
  'PublicIntakeSigningShort',
  'PublicProviderFinder',
  'PublicAgencyEventsOpen',
  'PublicOpenEventsLegacySkillBuilders',
  'PublicProgramEventsOpen',
  'PublicProgramEvents',
  'PublicAgencyEventsBranded',
  'OrganizationSkillBuildersEventKioskEntry',
  'OrganizationSkillBuildersEventKioskStation',
  'SchoolFinder',
  'JoinSupervision',
  'JoinTeamMeeting',
  'OrganizationSplash',
  'OrganizationParticipantSignup',
  'OrganizationClubSearch',
  'ReferralUpload',
  'Kiosk'
]);

export function shouldShowPublicTranslate(route) {
  if (!route?.path) return false;
  const p = String(route.path).toLowerCase();

  if (route.meta?.publicTranslation === false) return false;
  // Block staff/admin areas (including /{orgSlug}/admin/...).
  if (p.startsWith('/admin') || /\/admin(\/|$)/.test(p)) return false;

  for (const s of LOGIN_PATH_SNIPPETS) {
    if (p.includes(s)) return false;
  }

  if (route.matched.some((r) => r.meta?.requiresAuth === true)) return false;

  if (route.meta?.publicTranslation === true) return true;

  const name = route.name != null ? String(route.name) : '';
  if (name && PUBLIC_TRANSLATION_ROUTE_NAMES.has(name)) return true;

  if (p.startsWith('/p/')) return true;
  if (p.startsWith('/intake/') || p.startsWith('/i/')) return true;
  if (p.startsWith('/find-provider/')) return true;
  if (p.startsWith('/open-events/')) return true;
  if (p === '/schools') return true;
  if (p.startsWith('/kiosk/') && !p.startsWith('/kiosk/login') && !p.startsWith('/kiosk/app')) return true;

  return false;
}

export function clearGoogleTranslateCookie() {
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = `googtrans=;path=/;expires=${expires};SameSite=Lax`;
  const host = window.location.hostname;
  if (host && host !== 'localhost') {
    document.cookie = `googtrans=;path=/;domain=.${host};expires=${expires};SameSite=Lax`;
  }
}

export function setGoogleTranslateCookieEnToEs() {
  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `googtrans=${encodeURIComponent('/en/es')};path=/;max-age=${maxAge};SameSite=Lax`;
}

export function isGoogleTranslateSpanishActive() {
  return document.cookie.split(';').some((c) => c.trim().startsWith('googtrans=') && c.includes('/en/es'));
}
