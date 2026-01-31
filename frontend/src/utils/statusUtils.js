/**
 * Status utility functions for user status lifecycle
 */

/**
 * Get display label for user status
 * @param {string} status - User status value
 * @returns {string} Display label
 */
export function getStatusLabel(status) {
  const statusMap = {
    'PROSPECTIVE': 'Prospective (Applicant)',
    'PENDING_SETUP': 'Pending Setup',
    'PREHIRE_OPEN': 'Pre-Hire',
    'PREHIRE_REVIEW': 'Ready for Review',
    'ONBOARDING': 'Onboarding',
    'ACTIVE_EMPLOYEE': 'Active',
    'TERMINATED_PENDING': 'Terminated (Grace Period)',
    'ARCHIVED': 'Archived',
    // Legacy statuses for backward compatibility during transition
    'pending': 'Pre-Hire',
    'ready_for_review': 'Ready for Review',
    'active': 'Active',
    'completed': 'Active',
    'terminated': 'Terminated (Grace Period)'
  };
  
  return statusMap[status] || status || 'Unknown';
}

/**
 * Get badge class for user status
 * @param {string} status - User status value
 * @param {boolean} isActive - Legacy is_active field (deprecated)
 * @returns {string} Badge CSS class
 */
export function getStatusBadgeClass(status, isActive) {
  // Map new status values to badge classes
  switch (status) {
    case 'PROSPECTIVE':
      return 'badge-info';
    case 'PENDING_SETUP':
      return 'badge-warning';
    case 'PREHIRE_OPEN':
      return 'badge-info';
    case 'PREHIRE_REVIEW':
      return 'badge-primary';
    case 'ONBOARDING':
      return 'badge-info';
    case 'ACTIVE_EMPLOYEE':
      return 'badge-success';
    case 'TERMINATED_PENDING':
      return 'badge-warning';
    case 'ARCHIVED':
      return 'badge-danger';
    // Legacy statuses
    case 'pending':
      return 'badge-info';
    case 'ready_for_review':
      return 'badge-primary';
    case 'active':
      return 'badge-success';
    case 'completed':
      return 'badge-success';
    case 'terminated':
      return 'badge-warning';
    default:
      return 'badge-secondary';
  }
}

/**
 * Check if status allows on-demand access
 * @param {string} status - User status value
 * @returns {boolean} Whether user can access on-demand training
 */
export function canAccessOnDemand(status) {
  return status === 'ACTIVE_EMPLOYEE' || status === 'TERMINATED_PENDING' ||
         status === 'active' || status === 'completed'; // Legacy support
}

/**
 * Check if status allows dashboard access
 * @param {string} status - User status value
 * @returns {boolean} Whether user can access dashboard
 */
export function canAccessDashboard(status) {
  return status !== 'ARCHIVED' && status !== 'PENDING_SETUP' && status !== 'PROSPECTIVE';
}
