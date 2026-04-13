import { resolveSummitStatsSlug, isDualHomedSummitUser } from './summitRoutingContext.js';

export const SST_SURFACE_CHOICE_KEY = 'sstc_surface_choice';
export const SST_PREFERRED_WORK_AGENCY_KEY = 'preferred_work_agency_id';

/** @returns {'work' | 'summit' | null} */
export function getSstcSurfaceChoice() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(SST_SURFACE_CHOICE_KEY);
    if (v === 'work' || v === 'summit') return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {'work' | 'summit'} choice */
export function setSstcSurfaceChoice(choice) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SST_SURFACE_CHOICE_KEY, choice);
  } catch {
    /* ignore */
  }
}

export function getPreferredWorkAgencyId() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SST_PREFERRED_WORK_AGENCY_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setPreferredWorkAgencyId(agencyId) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (agencyId == null) sessionStorage.removeItem(SST_PREFERRED_WORK_AGENCY_KEY);
    else sessionStorage.setItem(SST_PREFERRED_WORK_AGENCY_KEY, String(agencyId));
  } catch {
    /* ignore */
  }
}

/** True when session says “work” and user has both Summit-scoped and non–Summit-scoped memberships. */
export function userChoseWorkOverSummit({ organizationContext, currentAgency, orgs }) {
  if (getSstcSurfaceChoice() !== 'work') return false;
  const summitSlug = resolveSummitStatsSlug({ organizationContext, currentAgency, orgs });
  return isDualHomedSummitUser({ summitSlug, orgs });
}

export function userChoseWorkOverSummitFromStores(authStore, agencyStore, organizationStore) {
  const user = authStore?.user;
  const orgs =
    Array.isArray(user?.agencies) && user.agencies.length
      ? user.agencies
      : Array.isArray(agencyStore.userAgencies?.value ?? agencyStore.userAgencies)
        ? (agencyStore.userAgencies?.value ?? agencyStore.userAgencies)
        : [];
  return userChoseWorkOverSummit({
    organizationContext: organizationStore?.organizationContext || null,
    currentAgency: agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null,
    orgs
  });
}
