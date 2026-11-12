import pool from '../config/database.js';

export async function canManagePayrollForAgency({userId,role,agencyId},db=pool) {
  if(!agencyId || !userId)return false;
  if(role==='super_admin')return true;
  const [[membership]]=await db.execute(`SELECT ua.has_payroll_access FROM user_agencies ua
    JOIN users u ON u.id=ua.user_id JOIN agencies a ON a.id=ua.agency_id
    WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 LIMIT 1`,[userId,agencyId]);
  return [true,1,'1'].includes(membership?.has_payroll_access);
}
