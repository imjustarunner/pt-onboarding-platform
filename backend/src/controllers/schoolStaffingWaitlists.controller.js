import pool from '../config/database.js';
import {currentSchoolYear} from '../services/providerYearUpdate.service.js';
import {getSchoolStaffingWaitlists} from '../services/schoolStaffingWaitlists.service.js';

export const SCHOOL_STAFFING_VIEW_ROLES=new Set(['super_admin','admin','support','staff','clinical_practice_assistant','schedule_manager','provider','provider_plus','intern','intern_plus','supervisor']);
export async function listSchoolStaffingWaitlists(req,res,next) {
 try {
  const agencyId=Number(req.query.agencyId),schoolYear=String(req.query.schoolYear||currentSchoolYear());
  if(!Number.isSafeInteger(agencyId)||agencyId<1||!/^\d{4}-\d{2}$/.test(schoolYear))return res.status(400).json({error:{message:'Choose an agency and valid school year.'}});
  if(!SCHOOL_STAFFING_VIEW_ROLES.has(String(req.user?.role||'').toLowerCase()))return res.status(403).json({error:{message:'School staffing is available to the authorized agency care team.'}});
  if(req.user.role!=='super_admin') {
   const [[member]]=await pool.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND UPPER(COALESCE(u.status,'')) NOT IN ('PROSPECTIVE','INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','TERMINATED_PENDING') LIMIT 1`,[agencyId,req.user.id]);
   if(!member)return res.status(403).json({error:{message:'Active agency membership is required.'}});
  }
  res.json(await getSchoolStaffingWaitlists({agencyId,schoolYear}));
 }catch(error){next(error);}
}
