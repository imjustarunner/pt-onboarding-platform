// Family, client, and school accounts must never enter employee assignment lists.
export const STAFF_ROLES = ['super_admin', 'admin', 'assistant_admin', 'support', 'staff', 'provider', 'provider_plus', 'clinical_practice_assistant', 'supervisor', 'intern', 'facilitator', 'clinician'];
export const isStaffAccount = (user) => STAFF_ROLES.includes(String(user?.role || '').toLowerCase());
export const isAssignableSupervisor = (user) => isStaffAccount(user)
  && ![false, 0, '0'].includes(user?.is_active)
  && ['', 'ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user?.status || '').toUpperCase())
  && ([true, 1, '1'].includes(user?.has_supervisor_privileges) || user?.role === 'supervisor');
