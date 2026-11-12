import pool from '../config/database.js';
import {readProviderServices} from './providerServiceOfferings.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function assertManagedTutoringProfileTarget(actor,agencyId,userId,{db=pool,services=readProviderServices}={}){
 if(!actor?.id||!['super_admin','admin','support','staff'].includes(actor.role))throw fail(403,'Agency staff access is required to manage tutoring profiles.');
 if(!Number.isSafeInteger(Number(userId))||Number(userId)<=0)throw fail(400,'Choose a valid tutor.');
 const [[target]]=await db.execute(`SELECT u.id,u.is_active,u.is_archived,u.status,COALESCE(ua.is_active,1) AS membership_active FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? WHERE u.id=?`,[Number(agencyId),Number(userId)]);
 if(!target||Number(target.membership_active)!==1)throw fail(404,'Tutor not found in this agency.');
 if(Number(target.is_active)!==1||Number(target.is_archived||0)===1||!['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(target.status).toUpperCase()))throw fail(409,'Complete this employee’s normal activation before publishing a tutoring profile.');
 const offered=await services(Number(userId),Number(agencyId),db);
 if(!offered.careEligibility.canProvideCare||!offered.services.some(service=>service.serviceType==='tutoring'&&service.offered))throw fail(403,'Enable the tutoring service for this active employee in this agency before editing its tutoring profile. Clinical service access alone does not enable tutoring.');
 return target;
}
