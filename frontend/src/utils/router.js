import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import { isSupervisor } from './helpers.js';
import { getOrganizationDashboardRoute } from './organizationContext.js';
import { hasProviderMobileAccess } from './providerMobileAccess.js';
import { isLikelyMobileViewport, isStandalonePwa } from './pwa.js';

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

  // Guardian portal accounts go to the guardian portal (prefer branded slug if available)
  if (String(user.role || '').toLowerCase() === 'client_guardian') {
    const slug =
      organizationStore.organizationContext?.slug ||
      user.agencies?.[0]?.slug ||
      null;
    return slug ? `/${slug}/guardian` : '/guardian';
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
  // Summit Stats club managers (admin with only affiliation agencies) go to their club admin
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' ||
      user.role === 'support' || isSupervisor(user)) {
    const adminOrgs = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? user.agencies ?? [];
    const orgs = Array.isArray(adminOrgs) ? adminOrgs : [];
    if (orgs.length === 1) {
      const org = orgs[0];
      const orgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
      if (orgType === 'affiliation') {
        const slug = org?.slug || org?.portal_url || org?.portalUrl;
        if (slug && String(slug).trim()) return `/${slug}/admin`;
      }
    }
    return '/admin';
  }

  // Provider Plus/CPA default to the personal My Dashboard.
  // Operations dashboard is available as a separate destination in navigation.
  if (isProviderPlusExperienceRole) {
    const slug =
      organizationStore.organizationContext?.slug ||
      user.agencies?.[0]?.portal_url ||
      user.agencies?.[0]?.slug ||
      null;
    return slug ? `/${slug}/dashboard` : '/dashboard';
  }

  // Providers with a single agency should land on org-scoped dashboard for consistent branding/nav
  if (userRole === 'provider') {
    const fromUser = user.agencies || [];
    const fromStore = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
    const orgs = fromUser.length > 0 ? fromUser : (Array.isArray(fromStore) ? fromStore : []);
    if (orgs.length === 1 && (orgs[0]?.slug || orgs[0]?.portal_url)) {
      const slug = orgs[0].slug || orgs[0].portal_url;
      if (slug && String(slug).trim()) return `/${slug}/dashboard`;
    }
  }

  // Regular users go to regular dashboard
  return '/dashboard';
}

