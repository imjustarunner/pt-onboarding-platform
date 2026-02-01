/**
 * Check if a user is a supervisor (using has_supervisor_privileges as source of truth)
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
