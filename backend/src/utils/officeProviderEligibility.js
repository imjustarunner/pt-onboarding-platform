// Room reservations belong to people, including admins and staff. Eligibility
// follows active account state, never the person's clinical role.
export const inactiveOfficeProvider = user => !!user && (Number(user.is_active ?? 1) === 0 || Number(user.is_archived) === 1 || ['ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED'].includes(String(user.status || '').toUpperCase()));
export const activeOfficeProviderSql = alias => `COALESCE(${alias}.is_active,1)=1 AND COALESCE(${alias}.is_archived,0)=0 AND UPPER(COALESCE(${alias}.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED')`;
