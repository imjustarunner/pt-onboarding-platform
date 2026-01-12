import { useAuthStore } from '../store/auth';
import { isSupervisor } from './helpers.js';

/**
 * Returns the correct dashboard route based on user role
 * @returns {string} The dashboard route for the current user
 */
export function getDashboardRoute() {
  const authStore = useAuthStore();
  const user = authStore.user;
  
  if (!user) {
    console.warn('getDashboardRoute: No user found, defaulting to /dashboard');
    return '/dashboard'; // Default fallback
  }
  
  // Debug logging
  console.log('getDashboardRoute - User role:', user.role, 'Type:', user.type, 'Status:', user.status);
  
  // Admins, super admins, support, supervisors, and CPAs go to admin dashboard
  // Check role with case-insensitive comparison and handle variations
  const userRole = user.role?.toLowerCase();
  if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin' || 
      user.role === 'support' || isSupervisor(user) || user.role === 'clinical_practice_assistant') {
    console.log('getDashboardRoute: Routing to /admin for role:', user.role);
    return '/admin';
  }
  
  // Regular users go to regular dashboard
  console.log('getDashboardRoute: Routing to /dashboard for role:', user.role);
  return '/dashboard';
}

