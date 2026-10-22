import pool from '../config/database.js';
export const dependentRecordScopes=['treatment_plan','clinical_documents'];
export const dependentBaseScopes=['session_frequency','clinical_messages'];
export const dependentError=(status,message)=>Object.assign(new Error(message),{status});
export async function dependentAccess(userId,db=pool){
 const [[row]]=await db.execute('SELECT * FROM dependent_portal_access WHERE user_id=?',[userId]);
 return row||null;
}
export function personalBillingRouteAllowed(method,path,clientId){
 if(method==='GET'&&['/api/guardian-billing/overview','/api/guardian-billing/payment-cards','/api/guardian-billing/insurance'].includes(path))return true;
 if(method==='POST'&&['/api/guardian-billing/insurance','/api/guardian-billing/insurance/read-card','/api/guardian-billing/card-setup','/api/guardian-billing/card-setup/complete'].includes(path))return true;
 if(new RegExp(`^/api/guardian-billing/clients/${Number(clientId)}/(responsibility|payment-method|recurring)$`).test(path))return ['POST','DELETE'].includes(method);
 if(method==='DELETE'&&/^\/api\/guardian-billing\/payment-cards\/\d+$/.test(path))return true;
 if(method==='GET'&&/^\/api\/family-billing\/(balances|receipts|tasks|splits|payers|payment-preference|statement\.pdf|receipts\/\d+\.pdf)$/.test(path))return true;
 if(/^\/api\/family-billing\/insurance-cards(?:\/\d+(?:\/upload|\/action|\/file\/[a-z_]+)?)?$/.test(path))return ['GET','POST'].includes(method);
 if(/^\/api\/family-billing\/(tasks\/\d+|task-link\/[a-f0-9]{64})(?:\/(authorize|complete))?$/.test(path))return method==='GET'&&!/\/(authorize|complete)$/.test(path)||method==='POST'&&/\/(authorize|complete)$/.test(path);
 if(method==='PUT'&&path==='/api/family-billing/payment-preference')return true;
 return method==='POST'&&/^\/api\/family-billing\/(allocations\/\d+\/pay|plans\/\d+\/(accept|cancel)|balances\/\d+\/split|splits\/\d+\/respond)$/.test(path);
}
export function dependentRouteAllowed(method,path,clientId){
 if(path.startsWith('/api/dependent-portal/'))return !/\/(manage|staff)\//.test(path);
 if(/^\/api\/account-security(?:\/.*)?$/.test(path))return true;
 if(method==='POST'&&['/api/auth/activity-log','/api/auth/platform-session/heartbeat'].includes(path))return true;
 if(method==='POST'&&path==='/api/users/change-password')return true;
 if(method==='GET'&&/^\/api\/icons\/\d+$/.test(path))return true;
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
  if(personalBillingRouteAllowed(req.method,path,access.client_id)){
   const [[independent]]=await pool.execute("SELECT client_id FROM client_portal_independence WHERE client_id=? AND user_id=? AND status='active'",[access.client_id,req.user.id]);
   if(independent){
    if([req.body?.clientId,req.query?.clientId,...(Array.isArray(req.body?.clientIds)?req.body.clientIds:[])].filter(v=>v!=null).some(v=>Number(v)!==Number(access.client_id)))return res.status(403).json({error:{message:'This login only opens your own account.'}});
    if(req.method==='GET'&&path.startsWith('/api/family-billing/'))req.query.clientId=String(access.client_id);
    const receipt=path.match(/^\/api\/family-billing\/receipts\/(\d+)\.pdf$/);
    if(receipt){const [[owned]]=await pool.execute(`SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id WHERE p.id=? AND r.client_id=?`,[receipt[1],access.client_id]);if(!owned)return res.sendStatus(403);}
    return next();
   }
  }
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
