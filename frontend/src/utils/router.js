import { useAuthStore } from '../store/auth';
import { useOrganizationStore } from '../store/organization';
import { isSupervisor } from './helpers.js';
import { getOrganizationDashboardRoute } from './organizationContext.js';

/**
 * Returns the correct dashboard route based on user role and organization type
 * @returns {string} The dashboard route for the current user
 */
export function getDashboardRoute() {
  const authStore = useAuthStore();
  const organizationStore = useOrganizationStore();
  const user = authStore.user;
  
  if (!user) {
    console.warn('getDashboardRoute: No user found, defaulting to /dashboard');
    return '/dashboard'; // Default fallback
  }
  
  const userRole = String(user.role || '').toLowerCase();
  const isProviderPlusExperienceRole =
    userRole === 'provider_plus' || userRole === 'clinical_practice_assistant';

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
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' ||
      user.role === 'support' || isSupervisor(user)) {
    return '/admin';
  }

  if (isProviderPlusExperienceRole) {
    return '/operations-dashboard';
  }

  // Regular users go to regular dashboard
  return '/dashboard';
}

