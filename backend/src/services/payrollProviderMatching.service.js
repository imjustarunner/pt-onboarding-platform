import pool from '../config/database.js';
export function canMatchPayrollUser(user) {
  return ![true, 1, '1'].includes(user?.is_archived) && String(user?.status || '').toUpperCase() !== 'ARCHIVED';
}
export async function payrollAliasUsers(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT u.id,a.first_name,a.last_name FROM payroll_provider_aliases a
    JOIN users u ON u.id=a.user_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=a.agency_id
    WHERE a.agency_id=? AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.status,'')<>'ARCHIVED'`, [agencyId]);
  return rows;
}

export async function archivedPayrollName(first, last, db = pool) {
  const [rows] = await db.execute(`SELECT id FROM users WHERE LOWER(TRIM(first_name))=LOWER(TRIM(?))
    AND LOWER(TRIM(last_name))=LOWER(TRIM(?)) AND (is_archived=1 OR status='ARCHIVED') LIMIT 1`, [first,last]);
  return rows.length > 0;
}
