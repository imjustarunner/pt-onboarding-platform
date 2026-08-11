import {
  activeBriefingSections,
  isAgencyTenantOrg,
  parseBrandPalette,
  schoolBriefingItemsFromNotifications,
  tenantBriefingNotifications
} from './privilegedLoginBriefing';

const PROVIDER_BRIEFING_ROLES = new Set([
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'supervisor',
  'intern',
  'intern_plus',
  'staff',
  'facilitator'
]);

const PRIVILEGED_LOGIN_ROLES = new Set(['admin', 'support', 'super_admin', 'superadmin']);
const EXCLUDED_BRIEFING_ROLES = new Set(['school_staff', 'client_guardian', 'kiosk', 'club_manager']);
const INACTIVE_ACCOUNT_STATUSES = new Set(['INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED']);

export const PROVIDER_BRIEFING_SECTION_ORDER = Object.freeze([
  'notifications',
  'messages',
  'tasks',
  'calendar',
  'clientUpdates',
  'notesToSign',
  'tickets',
  'supervision',
  'yearUpdate',
  'overdueNotes'
]);

export function pickPortalKey(agency) {
  return String(agency?.portal_url || agency?.portalUrl || agency?.slug || '').trim().toLowerCase();
}

export function isProviderLoginBriefingUser(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  const status = String(user?.status || '').trim().toUpperCase();
  if (PRIVILEGED_LOGIN_ROLES.has(role)) return false;
  if (EXCLUDED_BRIEFING_ROLES.has(role)) return false;
  if (INACTIVE_ACCOUNT_STATUSES.has(status)) return false;
  return PROVIDER_BRIEFING_ROLES.has(role);
}

/**
 * Resolve the tenant agency for login briefing branding and API scoping.
 * Prefers the host portal the user logged in through (e.g. app.itsco.health → ITSCO).
 */
export function resolveLoginTenantAgency({
  agencies = [],
  hostPortalSlug = '',
  currentAgency = null
} = {}) {
  const tenantAgencies = (agencies || []).filter(isAgencyTenantOrg);
  const host = String(hostPortalSlug || '').trim().toLowerCase();

  if (host) {
    const fromHost = tenantAgencies.find((agency) => pickPortalKey(agency) === host);
    if (fromHost) return fromHost;
  }

  const currentId = Number(currentAgency?.id || 0);
  if (currentId > 0 && isAgencyTenantOrg(currentAgency)) {
    if (!host || pickPortalKey(currentAgency) === host) return currentAgency;
  }

  return tenantAgencies[0] || null;
}

/** Route prefix for briefing navigation — flat on dedicated app.{tenant}.health hosts. */
export function briefingPathPrefix({ agency = null, hostPortalSlug = '', routeSlug = '' } = {}) {
  const host = String(hostPortalSlug || '').trim().toLowerCase();
  const route = String(routeSlug || '').trim().toLowerCase();
  const agencySlug = pickPortalKey(agency);
  const slug = route || agencySlug;
  if (!slug) return '';
  if (host && host === slug) return '';
  return `/${slug}`;
}

export function providerBriefingDashboardPath(role, prefix = '') {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'provider_plus' || normalized === 'clinical_practice_assistant') {
    return `${prefix}/operations-dashboard`;
  }
  return `${prefix}/dashboard`;
}

export function activeProviderBriefingSections(source = {}) {
  return PROVIDER_BRIEFING_SECTION_ORDER
    .filter((key) => {
      const section = source[key];
      return section && (Number(section?.count || 0) > 0 || (Array.isArray(section?.items) && section.items.length > 0));
    })
    .map((key) => ({ key, ...source[key] }));
}

/** Provider briefing cards — always include today's schedule so the day agenda is visible even when empty. */
export function providerBriefingDisplaySections(source = {}) {
  const active = activeProviderBriefingSections(source);
  const calendar = source.calendar;
  if (!calendar) return active;

  const withoutCalendar = active.filter((section) => section.key !== 'calendar');
  return [{ key: 'calendar', ...calendar }, ...withoutCalendar];
}

export function splitProviderBriefingNotifications(notifications = []) {
  const schoolRows = schoolBriefingItemsFromNotifications(notifications);
  const tenantRows = tenantBriefingNotifications(notifications);
  return { tenantRows, schoolRows };
}

export {
  activeBriefingSections,
  isAgencyTenantOrg,
  parseBrandPalette,
  schoolBriefingItemsFromNotifications,
  tenantBriefingNotifications
};
