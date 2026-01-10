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
    return '/dashboard'; // Default fallback
  }
  
  // Approved employees go to on-demand training
  if (user.type === 'approved_employee') {
    return '/on-demand-training';
  }
  
  // Admins, super admins, support, supervisors, and CPAs go to admin dashboard
  if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support' || 
      isSupervisor(user) || user.role === 'clinical_practice_assistant') {
    return '/admin';
  }
  
  // Regular users go to regular dashboard
  return '/dashboard';
}

