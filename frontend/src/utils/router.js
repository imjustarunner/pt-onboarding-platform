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
  
  // Check if user is associated with a school organization
  // If organization context is available, use it
  if (organizationStore.organizationContext) {
    const orgType = organizationStore.organizationContext.organizationType;
    const slug = organizationStore.organizationContext.slug;
    
    if (orgType === 'school' && slug) {
      // School users go to school portal dashboard
      return `/${slug}/dashboard`;
    }
  }
  
  // Check user's organizations for school type (fallback)
  const userOrgs = user.agencies || [];
  const schoolOrg = userOrgs.find(org => org.organization_type === 'school');
  if (schoolOrg && schoolOrg.slug) {
    return `/${schoolOrg.slug}/dashboard`;
  }
  
  // Approved employees go to on-demand training
  if (user.type === 'approved_employee') {
    return '/on-demand-training';
  }
  
  // Admins, super admins, support, supervisors, and CPAs go to admin dashboard
  // Check role with case-insensitive comparison and handle variations
  const userRole = user.role?.toLowerCase();
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' || 
      user.role === 'support' || isSupervisor(user) || user.role === 'clinical_practice_assistant') {
    return '/admin';
  }
  
  // Regular users go to regular dashboard
  return '/dashboard';
}

