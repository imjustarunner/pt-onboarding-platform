/**
 * Where to show the public-facing EN ⇄ ES toggle (powered by vue-i18n +
 * AI-backed translations cache, not Google Translate). Uses route meta,
 * name, and path heuristics so we do not offer it on login/admin/staff
 * tools. Admin/staff surfaces are intentionally English-only per product
 * scope.
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

/**
 * Route names that show the bottom-right EN ⇄ ES toggle.
 *
 * Digital intake forms (PublicIntakeSigning / PublicIntakeSigningShort) are
 * intentionally excluded: they have their own in-page language toggle that
 * swaps to the admin-linked Spanish form. The bottom-right widget is
 * redundant there and confuses users when no Spanish form is linked.
 */
const PUBLIC_TRANSLATION_ROUTE_NAMES = new Set([
  'PublicMarketingHub',
  'PublicMarketingHubSubPage',
  'PublicProviderFinder',
  'PublicAgencyEventsOpen',
  'PublicAgencyEnrollOpen',
  'PublicProgramEnrollOpen',
  'PublicProgramEnroll',
  'PublicAgencyEnrollBranded',
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
  // /intake/ and /i/ paths are digital intake forms — they handle language
  // switching themselves via the in-page linked-Spanish-form toggle, so we
  // suppress the bottom-right widget there.
  if (p.startsWith('/find-provider/')) return true;
  if (p.startsWith('/open-events/')) return true;
  if (/\/enroll(\/|$)/.test(p)) return true;
  if (p === '/schools') return true;
  if (p.startsWith('/kiosk/') && !p.startsWith('/kiosk/login') && !p.startsWith('/kiosk/app')) return true;

  return false;
}

/**
 * Best-effort cleanup of any legacy Google Translate cookie left over from
 * the previous widget implementation. Safe to call on every public page
 * load so users with stale cookies aren't stuck on a page-level GT layer
 * that conflicts with the new i18n system.
 */
export function clearLegacyGoogleTranslateCookie() {
  try {
    const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `googtrans=;path=/;expires=${expires};SameSite=Lax`;
    const host = window.location.hostname;
    if (host && host !== 'localhost') {
      document.cookie = `googtrans=;path=/;domain=.${host};expires=${expires};SameSite=Lax`;
    }
  } catch { /* ignore */ }
}
