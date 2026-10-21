import pool from '../config/database.js';
export const dependentRecordScopes=['treatment_plan','clinical_documents'];
export const dependentBaseScopes=['session_frequency','clinical_messages'];
export const dependentError=(status,message)=>Object.assign(new Error(message),{status});
export async function dependentAccess(userId,db=pool){
 const [[row]]=await db.execute('SELECT * FROM dependent_portal_access WHERE user_id=?',[userId]);
 return row||null;
}
export function dependentRouteAllowed(method,path,clientId){
 if(path.startsWith('/api/dependent-portal/'))return !/\/(manage|staff)\//.test(path);
 if(/^\/api\/account-security(?:\/.*)?$/.test(path))return true;
 if(method==='POST'&&['/api/auth/activity-log','/api/auth/platform-session/heartbeat'].includes(path))return true;
 if(/^\/api\/auth\/(me|logout|session-activity|session-lock-config|verify-session-pin|refresh|change-password|security(?:\/.*)?|sessions(?:\/.*)?|passkeys(?:\/.*)?)\/?$/.test(path))return true;
 if(method==='GET'&&/^\/api\/(users\/me(?:\/agencies)?|branding(?:\/.*)?|agencies\/[^/]+\/(branding|public))$/.test(path))return true;
 // The authenticated appointment-entry page still uses the same tutor office.
 if(new RegExp(`^/api/tutoring-learning-os/clients/${Number(clientId)}/office-(entry|status|visit)$`).test(path))return true;
 return false;
}
export async function enforceDependentPortalScope(req,res,next){
 try{
  if(!req.user?.id||!['client_guardian','client','guardian'].includes(req.user.role))return next();
  const access=await dependentAccess(req.user.id);
  if(!access)return next();
  req.dependentPortalAccess=access;
  const path=String(req.originalUrl||req.path).split('?')[0].replace(/\/$/,'');
  if(access.revoked_at&&path!=='/api/auth/logout')return res.status(403).json({error:{message:'This personal portal invitation is no longer active. Contact your care team.'}});
  if(!dependentRouteAllowed(req.method,path,access.client_id))return res.status(403).json({error:{code:'PERSONAL_PORTAL_ONLY',message:'This login only opens your personal portal.'}});
  return next();
 }catch(e){next(e);}
}
export async function dependentClinicalScopes(userId,clientId,agencyId,db=pool){
 const access=await dependentAccess(userId,db);
 if(!access)return null;
 if(access.revoked_at||Number(access.client_id)!==Number(clientId))return [];
 const [[share]]=await db.execute('SELECT scopes_json FROM dependent_portal_clinical_shares WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 let scopes=share?.scopes_json||[];if(typeof scopes==='string')scopes=JSON.parse(scopes);
 return [...dependentBaseScopes,...scopes.filter(s=>dependentRecordScopes.includes(s))];
}
