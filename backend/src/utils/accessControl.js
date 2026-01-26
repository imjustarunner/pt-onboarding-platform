/**
 * Access Control Helper
 * Determines what a user can access based on their status and permission attributes
 */

/**
 * Check if user has provider access (either through role or permission attribute)
 * @param {Object} user - User object with role and has_provider_access fields
 * @returns {boolean} Whether user has provider access
 */
export function hasProviderAccess(user) {
  if (!user) return false;
  
  // Direct provider role
  if (user.role === 'provider') {
    return true;
  }
  
  // Staff with provider access attribute
  if (user.role === 'staff' && user.has_provider_access) {
    return true;
  }
  
  // Admin and super_admin always have provider access
  if (user.role === 'admin' || user.role === 'super_admin') {
    return true;
  }
  
  return false;
}

/**
 * Check if user has staff access (either through role or permission attribute)
 * @param {Object} user - User object with role and has_staff_access fields
 * @returns {boolean} Whether user has staff access
 */
export function hasStaffAccess(user) {
  if (!user) return false;
  
  // Direct staff role
  if (user.role === 'staff' || user.role === 'support') {
    return true;
  }
  
  // Provider with staff access attribute
  if (user.role === 'provider' && user.has_staff_access) {
    return true;
  }
  
  // Admin and super_admin always have staff access
  if (user.role === 'admin' || user.role === 'super_admin') {
    return true;
  }
  
  return false;
}

/**
 * Check user access permissions based on status
 * @param {Object} user - User object with status field
 * @returns {Object} Access permissions object
 */
export function checkAccess(user) {
  if (!user) {
    return {
      canAccessOnDemand: false,
      canAccessDashboard: false,
      canAccessTraining: false,
      canAccessDocuments: false,
      canAccessAdmin: false
    };
  }

  const status = user.status;
  const userRole = user.role;

  // Superadmins have full access regardless of status (except ARCHIVED)
  if (userRole === 'super_admin' && status !== 'ARCHIVED') {
    return {
      canAccessOnDemand: true,
      canAccessDashboard: true,
      canAccessTraining: true,
      canAccessDocuments: true,
      canAccessAdmin: true
    };
  }

  // Base access permissions based on status
  let canAccessOnDemand = false;
  let canAccessDashboard = false;
  let canAccessTraining = false;
  let canAccessDocuments = false;
  let canAccessAdmin = false;

  switch (status) {
    case 'PENDING_SETUP':
      // No access until password is set
      canAccessOnDemand = false;
      canAccessDashboard = false;
      canAccessTraining = false;
      canAccessDocuments = false;
      canAccessAdmin = false;
      break;

    case 'PREHIRE_OPEN':
      // Pre-hire tasks only
      canAccessOnDemand = false;
      canAccessDashboard = true; // But only pre-hire content
      canAccessTraining = true; // Pre-hire training only
      canAccessDocuments = true; // Pre-hire documents only
      canAccessAdmin = false;
      break;

    case 'PREHIRE_REVIEW':
      // Waiting screen only
      canAccessOnDemand = false;
      canAccessDashboard = true; // But shows waiting screen
      canAccessTraining = false;
      canAccessDocuments = false;
      canAccessAdmin = false;
      break;

    case 'ONBOARDING':
      // Onboarding training and tasks
      canAccessOnDemand = false;
      canAccessDashboard = true; // Onboarding content
      canAccessTraining = true; // Onboarding training only
      canAccessDocuments = true; // Onboarding documents only
      canAccessAdmin = false;
      break;

    case 'ACTIVE_EMPLOYEE':
      // Full access including on-demand
      canAccessOnDemand = true;
      canAccessDashboard = true;
      canAccessTraining = true; // All training + on-demand
      canAccessDocuments = true; // All documents
      canAccessAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'support';
      break;

    case 'TERMINATED_PENDING':
      // 7-day grace period - same access as ACTIVE_EMPLOYEE
      canAccessOnDemand = true;
      canAccessDashboard = true;
      canAccessTraining = true; // All training + on-demand
      canAccessDocuments = true; // All documents
      canAccessAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'support';
      break;

    case 'ARCHIVED':
      // No access
      canAccessOnDemand = false;
      canAccessDashboard = false;
      canAccessTraining = false;
      canAccessDocuments = false;
      canAccessAdmin = false;
      break;

    default:
      // Unknown status - default to no access for safety
      console.warn(`Unknown user status: ${status} for user ${user.id}`);
      canAccessOnDemand = false;
      canAccessDashboard = false;
      canAccessTraining = false;
      canAccessDocuments = false;
      canAccessAdmin = false;
  }

  return {
    canAccessOnDemand,
    canAccessDashboard,
    canAccessTraining,
    canAccessDocuments,
    canAccessAdmin
  };
}

/**
 * Check if user can login based on status
 * @param {Object} user - User object with status and password_hash fields
 * @returns {boolean} Whether user can login
 */
export function canLogin(user) {
  if (!user) return false;

  const status = user.status;
  const userRole = user.role;

  // Superadmins can always login (except if ARCHIVED)
  if (userRole === 'super_admin' && status !== 'ARCHIVED') {
    return true;
  }

  // ARCHIVED users cannot login
  if (status === 'ARCHIVED') {
    return false;
  }

  // PENDING_SETUP users can only login if they have a password set
  if (status === 'PENDING_SETUP') {
    return user.password_hash !== null && user.password_hash !== undefined;
  }

  // All other statuses can login
  return true;
}

/**
 * Check if user's access has expired (for TERMINATED_PENDING)
 * @param {Object} user - User object with status and termination_date fields
 * @returns {boolean} Whether access has expired
 */
export function isAccessExpired(user) {
  if (!user || user.status !== 'TERMINATED_PENDING') {
    return false;
  }

  if (!user.termination_date) {
    return false;
  }

  const terminationDate = new Date(user.termination_date);
  const sevenDaysLater = new Date(terminationDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  return now > sevenDaysLater;
}
