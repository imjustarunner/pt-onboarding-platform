import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
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

  // Admins/super admins/support/supervisors (with multiple orgs or no slug) go to admin dashboard.
  // CPAs should land on personal dashboard so "My Schedule" is immediately available.
  // Summit Stats club managers (admin with only affiliation agencies) go to parent slug admin (e.g. /ssc/admin)
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' ||
      user.role === 'support' || isSupervisor(user)) {
    const adminOrgs = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? user.agencies ?? [];
    const orgs = Array.isArray(adminOrgs) ? adminOrgs : [];
    if (orgs.length === 1) {
      const org = orgs[0];
      const orgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
      if (orgType === 'affiliation') {
        const slug = org?.parent_slug || org?.slug || org?.portal_url || org?.portalUrl;
        if (slug && String(slug).trim()) return `/${slug}/admin`;
      }
    }
    return '/admin';
  }

  // CPAs land on Operations Dashboard (office approvals, coverage, ops tools).
  // Provider Plus keeps the personal My Dashboard; ops is still in nav.
  if (userRole === 'clinical_practice_assistant' || userRole === 'provider_plus') {
    const slug =
      organizationStore.organizationContext?.slug ||
      user.agencies?.[0]?.portal_url ||
      user.agencies?.[0]?.slug ||
      null;
    if (userRole === 'clinical_practice_assistant') {
      return slug ? `/${slug}/operations-dashboard` : '/operations-dashboard';
    }
    return slug ? `/${slug}/dashboard` : '/dashboard';
  }

  // Providers with a single agency should land on org-scoped dashboard for consistent branding/nav
  if (userRole === 'provider') {
    const fromUser = user.agencies || [];
    const fromStore = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
    const orgs = fromUser.length > 0 ? fromUser : (Array.isArray(fromStore) ? fromStore : []);
    if (orgs.length === 1 && (orgs[0]?.slug || orgs[0]?.portal_url)) {
      const slug = orgs[0].slug || orgs[0].portal_url;
      const orgType = String(orgs[0]?.organization_type || orgs[0]?.organizationType || '').toLowerCase();
      if (slug && String(slug).trim()) {
        if (orgType === 'affiliation') {
          const affiliationClubId = orgs[0]?.id ?? null;
          return affiliationClubId ? `/${slug}/clubs/${affiliationClubId}` : `/${slug}/my_club_dashboard`;
        }
        return `/${slug}/dashboard`;
      }
    }
  }

  // Regular users go to regular dashboard
  return '/dashboard';
}
