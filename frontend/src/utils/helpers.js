/**
 * Check if a user is a supervisor (using has_supervisor_privileges as source of truth).
 * Supervisor is always additive: it only adds the supervision card and supervisee access.
 * It must never remove permissions from the user's primary role (admin, staff, provider, etc.).
 * @param {Object} user - User object
 * @returns {boolean} True if user is a supervisor
 */
export function isSupervisor(user) {
  if (!user) return false;
  
  // Primary check: has_supervisor_privileges boolean (source of truth)
  // Handle different formats: true, 1, '1'
  const hasPrivileges = user.has_supervisor_privileges === true || 
                        user.has_supervisor_privileges === 1 || 
                        user.has_supervisor_privileges === '1' ||
                        user.hasSupervisorPrivileges === true ||
                        user.hasSupervisorPrivileges === 1 ||
                        user.hasSupervisorPrivileges === '1';
  
  if (hasPrivileges) {
    return true;
  }
  
  // Fallback: role check for backward compatibility (case-insensitive)
  if (String(user.role || '').toLowerCase() === 'supervisor') {
    return true;
  }
  
  return false;
}

/**
 * Check if a supervisor has the group-supervision privilege flag.
 */
export function isGroupSupervisionEligible(user) {
  if (!user || !isSupervisor(user)) return false;
  return user.group_supervision_eligible === true ||
    user.group_supervision_eligible === 1 ||
    user.group_supervision_eligible === '1' ||
    user.groupSupervisionEligible === true ||
    user.groupSupervisionEligible === 1 ||
    user.groupSupervisionEligible === '1';
}

/**
 * Who may schedule multi-person / group supervision and use practice invite groups:
 * admin, super_admin, support, clinical_practice_assistant, or group-eligible supervisors.
 */
export function canScheduleGroupSupervision(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'clinical_practice_assistant'].includes(role)) {
    return true;
  }
  return isGroupSupervisionEligible(user);
}
