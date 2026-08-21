import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import { useBrandingStore } from '../store/branding';
import { isSupervisor } from './helpers.js';
import { getOrganizationDashboardRoute } from './organizationContext.js';
import { hasProviderMobileAccess } from './providerMobileAccess.js';
import { isLikelyMobileViewport, isStandalonePwa } from './pwa.js';
import { isSummitPlatformRouteSlug } from './summitPlatformSlugs.js';
import {
  isSummitScopedOrg,
  resolveSummitStatsSlug,
  isDualHomedSummitUser
} from './summitRoutingContext.js';
import { getSstcSurfaceChoice, getPreferredWorkAgencyId } from './sstcSurfaceChoice.js';
import { isPractitionerOrgType } from './practitionerVertical.js';
import { isBookClubAgency, getBookClubParentSlug } from './bookClubAgency.js';
import { getCurrentPortalSlugFromHostCache } from './loginRedirect.js';
import { guessPortalSlugFromHostname } from './orgScopedPath.js';
import {
  isLikelyDemoTenant,
  pickFirstNonDemoTenant,
  pickOrgSlug,
  resolvePreferredAgencySlug,
  isLikelyDemoSlug
} from './demoTenant.js';

function hostImpliedPortalSlug() {
  try {
    const fromStore = String(useBrandingStore().portalHostPortalUrl || '').trim().toLowerCase();
    if (fromStore) return fromStore;
  } catch {
    /* ignore */
  }
  const fromCache = String(getCurrentPortalSlugFromHostCache() || '').trim().toLowerCase();
  if (fromCache) return fromCache;
  return String(guessPortalSlugFromHostname() || '').trim().toLowerCase() || '';
}

function adminHomePathForSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return '/admin';
  // On app.itsco.health, /itsco/admin is stripped back to /admin — return flat to avoid ping-pong.
  if (hostImpliedPortalSlug() === s) return '/admin';
  return `/${s}/admin`;
}

/**
 * Resolve preferred org slug + type for practitioner vertical landing.
 * Only returns a hit when org context / current agency is practitioner,
 * or the user belongs to exactly one org and it is practitioner.
 */
function resolvePractitionerOrg(user, agencyStore, organizationStore) {
  const orgContext = organizationStore.organizationContext || null;
  if (orgContext && isPractitionerOrgType(orgContext.organizationType)) {
    return {
      slug: orgContext.slug,
      orgType: String(orgContext.organizationType || '').toLowerCase()
    };
  }
  const currentAgency = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  if (currentAgency && isPractitionerOrgType(currentAgency.organization_type || currentAgency.organizationType)) {
    return {
      slug: currentAgency.slug || currentAgency.portal_url || currentAgency.portalUrl,
      orgType: String(currentAgency.organization_type || currentAgency.organizationType || '').toLowerCase()
    };
  }
  const fromUser = user?.agencies || [];
  const fromStore = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  const orgs = fromUser.length > 0 ? fromUser : (Array.isArray(fromStore) ? fromStore : []);
  if (orgs.length !== 1) return null;
  const hit = orgs[0];
  if (!isPractitionerOrgType(hit?.organization_type || hit?.organizationType)) return null;
  return {
    slug: hit.slug || hit.portal_url || hit.portalUrl,
    orgType: String(hit.organization_type || hit.organizationType || '').toLowerCase()
  };
}

/**
 * Returns the correct dashboard route based on user role and organization type
 * @returns {string} The dashboard route for the current user
 */
export function getDashboardRoute() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  const organizationStore = useOrganizationStore();
  const user = authStore.user;
  
  if (!user) {
    console.warn('getDashboardRoute: No user found, defaulting to /dashboard');
    return '/dashboard'; // Default fallback
  }
  
  const userRole = String(user.role || '').toLowerCase();
  const isProviderPlusExperienceRole =
    userRole === 'provider_plus' || userRole === 'clinical_practice_assistant';
  const orgs = Array.isArray(user.agencies) && user.agencies.length
    ? user.agencies
    : (Array.isArray(agencyStore.userAgencies?.value ?? agencyStore.userAgencies)
      ? (agencyStore.userAgencies?.value ?? agencyStore.userAgencies)
      : []);
  const orgContext = organizationStore.organizationContext || null;
  const currentAgency = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  const summitSlug = resolveSummitStatsSlug({
    organizationContext: orgContext,
    currentAgency,
    orgs
  });
  const orgContextSlug = String(orgContext?.slug || '').trim().toLowerCase();
  const orgContextParent = String(orgContext?.parentSlug || orgContext?.parent_slug || '').trim().toLowerCase();
  const currentAgencySlug = String(currentAgency?.slug || currentAgency?.portal_url || currentAgency?.portalUrl || '').trim().toLowerCase();
  const currentAgencyParent = String(currentAgency?.parent_slug || currentAgency?.parentSlug || '').trim().toLowerCase();
  const summitContextActive =
    isSummitPlatformRouteSlug(orgContextSlug) ||
    isSummitPlatformRouteSlug(orgContextParent) ||
    isSummitPlatformRouteSlug(currentAgencySlug) ||
    isSummitPlatformRouteSlug(currentAgencyParent);
  const summitOnlyMemberships = orgs.length > 0 && orgs.every(isSummitScopedOrg);
  const dualHomedEligible = isDualHomedSummitUser({ summitSlug, orgs });
  const surfaceChoice = getSstcSurfaceChoice();

  const shouldUseSummitHome =
    summitSlug &&
    (summitContextActive ||
      summitOnlyMemberships ||
      (dualHomedEligible && surfaceChoice === 'summit'));

  if (shouldUseSummitHome && !(dualHomedEligible && surfaceChoice === 'work')) {
    if (userRole === 'club_manager' || userRole === 'assistant_manager') {
      return `/${summitSlug}/club_manager_dashboard`;
    }
    // Land everyone on their club's hub page when the club ID is known
    const clubId = currentAgency?.id ?? null;
    if (clubId) {
      return `/${summitSlug}/clubs/${clubId}`;
    }
    return `/${summitSlug}/my_club_dashboard`;
  }

  if (dualHomedEligible && surfaceChoice === 'work') {
    const workOrgs = orgs.filter((o) => !isSummitScopedOrg(o));
    const prefId = getPreferredWorkAgencyId();
    let pick = prefId ? workOrgs.find((o) => Number(o?.id) === prefId) : null;
    if (!pick && workOrgs.length) pick = workOrgs[0];
    if (pick) {
      const slug = pick.slug || pick.portal_url || pick.portalUrl;
      if (slug && String(slug).trim()) {
        const orgType = String(pick.organization_type || pick.organizationType || '').toLowerCase();
        if (orgType === 'school') {
          if (isProviderPlusExperienceRole) return `/${slug}/operations-dashboard`;
          return `/${slug}/dashboard`;
        }
        if (userRole === 'clinical_practice_assistant') return `/${slug}/operations-dashboard`;
        return `/${slug}/dashboard`;
      }
    }
  }

  if (hasProviderMobileAccess(user) && isLikelyMobileViewport() && isStandalonePwa()) {
    const slug =
      organizationStore.organizationContext?.slug ||
      user.agencies?.[0]?.portal_url ||
      user.agencies?.[0]?.slug ||
      null;
    return slug ? `/${slug}/provider-mobile/schedule` : '/provider-mobile';
  }

  // Check if user is associated with a school organization
  // If organization context is available, use it
  if (organizationStore.organizationContext) {
    const orgType = organizationStore.organizationContext.organizationType;
    const slug = organizationStore.organizationContext.slug;
    
    if (orgType === 'school' && slug) {
      if (isProviderPlusExperienceRole) {
        return `/${slug}/operations-dashboard`;
      }
      // School users go to school portal dashboard
      return `/${slug}/dashboard`;
    }
  }
  
  // Check user's organizations for school type (fallback)
  const userOrgs = user.agencies || [];
  const schoolOrg = userOrgs.find(org => org.organization_type === 'school');
  if (schoolOrg && schoolOrg.slug) {
    if (isProviderPlusExperienceRole) {
      return `/${schoolOrg.slug}/operations-dashboard`;
    }
    return `/${schoolOrg.slug}/dashboard`;
  }
  
  // Approved employees go to on-demand training
  if (user.type === 'approved_employee') {
    return '/on-demand-training';
  }

  // Kiosk users go to kiosk app
  if (String(user.role || '').toLowerCase() === 'kiosk') {
    return '/kiosk/app';
  }

  // Guardian portal accounts go to the guardian portal (prefer branded slug if available).
  // Life coach / consultant clients land on the practitioner client dashboard shell.
  if (String(user.role || '').toLowerCase() === 'client_guardian') {
    const practitioner = resolvePractitionerOrg(user, agencyStore, organizationStore);
    if (practitioner?.slug) {
      return `/${practitioner.slug}/client-dashboard`;
    }
    const slug =
      organizationStore.organizationContext?.slug ||
      user.agencies?.[0]?.slug ||
      null;
    return slug ? `/${slug}/guardian` : '/guardian';
  }

  // Life coach / consultant practitioners land on org dashboard shell.
  // Skip platform super_admin/support so they retain /admin as home.
  if (userRole !== 'super_admin' && userRole !== 'superadmin' && userRole !== 'support') {
    const practitioner = resolvePractitionerOrg(user, agencyStore, organizationStore);
    if (practitioner?.slug && userRole !== 'client_guardian') {
      return `/${practitioner.slug}/dashboard`;
    }
  }

  if (userRole === 'club_manager') {
    const slug = resolveSummitStatsSlug({
      organizationContext: organizationStore.organizationContext || null,
      currentAgency: agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null,
      orgs
    });
    if (slug && !(dualHomedEligible && surfaceChoice === 'work')) {
      return `/${slug}/club_manager_dashboard`;
    }
    return '/dashboard';
  }
  
  // Supervisors (not admin/super_admin/support) use provider dashboard when they have a slug
  const isAdminLike = userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' || userRole === 'support';
  if (isSupervisor(user) && !isAdminLike) {
    const orgs = user.agencies || [];
    if (orgs.length === 1 && (orgs[0]?.slug || orgs[0]?.portal_url)) {
      const slug = orgs[0].slug || orgs[0].portal_url;
      if (slug && String(slug).trim()) return `/${slug}/dashboard`;
    }
  }

  // Admins/super admins/support/legacy-supervisor role go to admin dashboard.
  // Supervisor privileges on provider/staff are additive — those users stay on provider surfaces.
  const supervisorPrimaryRole = userRole === 'supervisor';
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' ||
      user.role === 'support' || supervisorPrimaryRole) {
    const adminOrgs = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? user.agencies ?? [];
    const orgs = Array.isArray(adminOrgs) ? adminOrgs : [];
    if (orgs.length === 1) {
      const org = orgs[0];
      const orgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
      if (orgType === 'affiliation') {
        const slug = org?.parent_slug || org?.slug || org?.portal_url || org?.portalUrl;
        if (slug && String(slug).trim()) return adminHomePathForSlug(slug);
      }
    }
    return '/admin';
  }

  // CPA and Provider+ default to Operations Dashboard (office approvals, coverage, ops tools).
  if (userRole === 'clinical_practice_assistant' || userRole === 'provider_plus') {
    const slug =
      organizationStore.organizationContext?.slug ||
      user.agencies?.[0]?.portal_url ||
      user.agencies?.[0]?.slug ||
      null;
    return slug ? `/${slug}/operations-dashboard` : '/operations-dashboard';
  }

  // Providers with agency membership should land on org-scoped dashboard for consistent branding/nav
  if (userRole === 'provider') {
    const fromUser = user.agencies || [];
    const fromStore = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
    const orgs = fromUser.length > 0 ? fromUser : (Array.isArray(fromStore) ? fromStore : []);
    const pickOrg = () => {
      if (!orgs.length) return null;
      if (orgs.length === 1) return orgs[0];
      // Prefer parent agency tenant when user also belongs to affiliated schools/programs.
      const agencyOrg = orgs.find((o) => {
        const t = String(o?.organization_type || o?.organizationType || '').toLowerCase();
        return t === 'agency' || (!t && !o?.affiliated_agency_id);
      });
      return agencyOrg || orgs[0];
    };
    const org = pickOrg();
    if (org && (org?.slug || org?.portal_url)) {
      const slug = org.slug || org.portal_url;
      const orgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
      if (slug && String(slug).trim()) {
        if (orgType === 'affiliation') {
          if (isBookClubAgency(org)) {
            const parentSlug = getBookClubParentSlug(org, orgs) || slug;
            return parentSlug ? `/${parentSlug}/dashboard` : '/dashboard';
          }
          const affiliationClubId = org?.id ?? null;
          return affiliationClubId ? `/${slug}/clubs/${affiliationClubId}` : `/${slug}/my_club_dashboard`;
        }
        return `/${slug}/dashboard`;
      }
    }
  }

  // Regular users go to regular dashboard
  return '/dashboard';
}

/**
 * Org-scoped My Dashboard path for tab deep-links (payroll, schedule, etc.).
 * Unlike getDashboardRoute(), this always targets the tabbed dashboard shell.
 */
export function getMyDashboardPath(opts = {}) {
  const slug = resolveOrgSlugForNavigation({ preferNonDemo: true, ...opts });
  return slug ? `/${slug}/dashboard` : '/dashboard';
}

/**
 * Best-effort portal slug for assistant / quick-nav navigation.
 */
export function resolveOrgSlugForNavigation(opts = {}) {
  const routeSlug = String(opts.orgSlug || '').trim();
  const preferNonDemo = opts.preferNonDemo === true;

  if (routeSlug && !preferNonDemo) return routeSlug;
  if (routeSlug && preferNonDemo && !isLikelyDemoSlug(routeSlug)) return routeSlug;

  const organizationStore = useOrganizationStore();
  const agencyStore = useAgencyStore();
  const authStore = useAuthStore();

  const user = authStore.user;
  const fromUser = user?.agencies || [];
  const fromStore = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  const orgs = fromUser.length > 0 ? fromUser : (Array.isArray(fromStore) ? fromStore : []);

  if (preferNonDemo) {
    const preferred = pickFirstNonDemoTenant(orgs);
    if (preferred) return pickOrgSlug(preferred);
  }

  const resolved = resolvePreferredAgencySlug(agencyStore.currentAgency, orgs, routeSlug);
  if (resolved) return resolved;

  const contextSlug = String(
    organizationStore.organizationContext?.slug ||
      agencyStore.currentAgency?.slug ||
      agencyStore.currentAgency?.portal_url ||
      agencyStore.currentAgency?.portalUrl ||
      ''
  ).trim();
  if (contextSlug && !isLikelyDemoTenant(agencyStore.currentAgency)) return contextSlug;

  const preferred = pickFirstNonDemoTenant(orgs);
  if (preferred) return pickOrgSlug(preferred);

  if (contextSlug) return contextSlug;

  if (Array.isArray(orgs) && orgs.length === 1) {
    return String(orgs[0]?.slug || orgs[0]?.portal_url || orgs[0]?.portalUrl || '').trim();
  }
  return '';
}

/**
 * Prefix bare /dashboard and /admin paths with the current org slug for vue-router.
 */
export function resolveAssistantNavigationPath(to, opts = {}) {
  const raw = String(to || '').trim();
  if (!raw) return raw;

  const qIndex = raw.indexOf('?');
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const search = qIndex >= 0 ? raw.slice(qIndex) : '';

  const preferNonDemo = opts.preferNonDemo === true || pathname.startsWith('/admin');
  const slug = resolveOrgSlugForNavigation({ ...opts, preferNonDemo });
  if (!slug) return raw;

  let path = pathname;
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    path = path.replace(/^\/dashboard/, `/${slug}/dashboard`);
  } else if (path.startsWith('/admin') && !path.startsWith(`/${slug}/`)) {
    path = `/${slug}${path}`;
  }

  return `${path}${search}`;
}
