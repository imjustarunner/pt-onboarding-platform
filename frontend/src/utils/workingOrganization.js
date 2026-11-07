import { isBookClubAgency } from './bookClubAgency.js';
import { pickFirstNonDemoTenant, pickOrgSlug } from './demoTenant.js';
import { isTenantOrganizationType } from './organizationTypes.js';
import { isSchoolCareBridgeOnly } from './schoolCareBridgeTenant.js';

/** One saved choice per person. URL and host hints never replace it. */
const STORAGE_KEY = 'pt_chosen_organization';

function organizationType(org) {
  return String(org?.organization_type || org?.organizationType || '').toLowerCase();
}

export function readChosenOrganizationId(userId) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || Number(raw.userId) !== Number(userId)) return null;
    const id = Number(raw.organizationId);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function rememberChosenOrganization(userId, organizationId) {
  if (typeof localStorage === 'undefined') return;
  const user = Number(userId);
  const organization = Number(organizationId);
  if (!Number.isFinite(user) || user <= 0 || !Number.isFinite(organization) || organization <= 0) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: user, organizationId: organization }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearChosenOrganization() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The organization this person is working in.
 *
 * 1. School staff and club managers keep their existing landing rules.
 * 2. An explicit choice wins for everyone else, including after reload.
 * 3. A URL slug selects only when nobody has chosen yet (opening a link).
 * 4. The last persisted organization is kept when it is still a membership.
 * 5. Otherwise prefer a full agency over a SchoolCareBridge-only company,
 *    including a QA agency whose slug contains "demo".
 */
/** Router and the organization menu share this so they cannot disagree. */
export function workingOrganizationForNavigation(to, authStore, agencyStore) {
  const memberships = agencyStore?.userAgencies?.length
    ? agencyStore.userAgencies
    : (authStore?.user?.agencies || []);
  const current = agencyStore?.currentAgency?.value ?? agencyStore?.currentAgency ?? null;
  return resolveWorkingOrganization({
    memberships,
    chosenOrganizationId: readChosenOrganizationId(authStore?.user?.id),
    currentOrganization: current,
    routeSlug: to?.params?.organizationSlug || '',
    role: authStore?.user?.role
  });
}

export function resolveWorkingOrganization({
  memberships = [],
  chosenOrganizationId = null,
  currentOrganization = null,
  routeSlug = '',
  role = ''
} = {}) {
  const list = (Array.isArray(memberships) ? memberships : []).filter(Boolean);
  if (!list.length) return null;
  const roleNorm = String(role || '').toLowerCase();
  const byId = (id) => list.find((org) => Number(org?.id) === Number(id)) || null;

  if (roleNorm === 'school_staff') {
    const portal = list.find((org) => ['school', 'program', 'learning'].includes(organizationType(org)));
    if (portal) return portal;
  }
  if (roleNorm === 'club_manager') {
    const affiliation = list.find((org) => organizationType(org) === 'affiliation' && !isBookClubAgency(org));
    if (affiliation) return affiliation;
  }

  const chosen = byId(chosenOrganizationId);
  if (chosen) return chosen;

  const route = String(routeSlug || '').trim().toLowerCase();
  if (route) {
    const fromRoute = list.find((org) => pickOrgSlug(org).toLowerCase() === route);
    if (fromRoute) return fromRoute;
  }

  const current = byId(currentOrganization?.id);
  if (current) return current;

  return pickFirstNonDemoTenant(list)
    || list.find((org) => isTenantOrganizationType(org) && !isBookClubAgency(org) && !isSchoolCareBridgeOnly(org))
    || list.find((org) => isTenantOrganizationType(org) && !isBookClubAgency(org))
    || list.find((org) => !isBookClubAgency(org))
    || list[0]
    || null;
}
