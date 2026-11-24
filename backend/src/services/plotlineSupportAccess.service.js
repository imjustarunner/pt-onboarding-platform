import pool from '../config/database.js';
// Company hiring permissions and an assignment are not platform support grants.
export async function canWorkPlotlineSupport(userId,db=pool){
  if(!Number.isSafeInteger(Number(userId))||Number(userId)<1)return false;
  const [[user]]=await db.execute(`SELECT id FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0
    AND UPPER(COALESCE(status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE') AND (LOWER(role)='super_admin' OR has_platform_support=1)`,[userId]);
  return !!user;
}
