import pool from '../config/database.js';
const roles=new Set(['provider','provider_plus','staff','support','assistant_admin','supervisor','clinical_director']);
export async function hasTransitionClientImportAccess(user,agencyId,db=pool){
 const uid=Number(user?.id),aid=Number(agencyId);
 if(!roles.has(user?.role)||!Number.isSafeInteger(uid)||uid<1||![2,6,377].includes(aid))return false;
 const [[row]]=await db.execute(`SELECT u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN agencies a ON a.id=ua.agency_id
  WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
  AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING') AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
  AND JSON_CONTAINS(COALESCE(JSON_EXTRACT(a.feature_flags,'$.practiceTransitionClientImportUserIds'),JSON_ARRAY()),JSON_ARRAY(u.id))=1 LIMIT 1`,[uid,aid]);
 return !!row&&roles.has(row.role);
}
