/** Route access is separate from API authorization; support must be explicitly allowed. */
export function hasRequiredRouteRole(userRole, requiredRole, { guardianPreview = false } = {}) {
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  return requiredRoles.some(role => {
    if (role === 'admin') return userRole === 'admin' || userRole === 'super_admin';
    if (role === 'schedule_manager') {
      return ['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'support'].includes(userRole);
    }
    if (role === 'supervisor_or_cpa') {
      return ['supervisor', 'clinical_practice_assistant', 'provider_plus'].includes(userRole);
    }
    if (role === 'clinical_practice_assistant') {
      return ['clinical_practice_assistant', 'provider_plus'].includes(userRole);
    }
    if (role === 'client_guardian' && userRole === 'super_admin' && guardianPreview) return true;
    return userRole === role;
  });
}
