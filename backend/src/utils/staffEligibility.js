// Family, client, and school accounts must never enter employee assignment lists.
export const STAFF_ROLES = ['super_admin', 'admin', 'assistant_admin', 'support', 'staff', 'provider', 'provider_plus', 'clinical_practice_assistant', 'supervisor', 'intern', 'intern_plus', 'facilitator', 'tutor', 'clinician'];
// Use only with users u and the selected agency's user_agencies ua join.
export const EMPLOYEE_ROSTER_SQL = `LOWER(u.role) IN (${STAFF_ROLES.map(role => `'${role}'`).join(',')})
  AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.created_via_dev_fill,0)=0`;
export const ACTIVE_EMPLOYEE_SQL = `${EMPLOYEE_ROSTER_SQL}
  AND COALESCE(ua.is_active,1)=1
  AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
  AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED')`;
export const isStaffAccount = (user) => STAFF_ROLES.includes(String(user?.role || '').toLowerCase());
export const isInactiveStaffAccount = (user) => [false, 0, '0'].includes(user?.is_active)
  || [true, 1, '1'].includes(user?.is_archived)
  || ['INACTIVE', 'INACTIVE_EMPLOYEE', 'ARCHIVED', 'TERMINATED', 'TERMINATED_PENDING'].includes(String(user?.status || '').trim().toUpperCase());
export const isAssignableSupervisor = (user) => isStaffAccount(user)
  && ![false, 0, '0'].includes(user?.is_active)
  && ['', 'ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user?.status || '').toUpperCase())
  && ([true, 1, '1'].includes(user?.has_supervisor_privileges) || user?.role === 'supervisor');
