import { protectFileResource } from '../services/activityProtection.service.js';
export function fileOperation(req){
 const path=decodeURIComponent(String(req.originalUrl||req.path||'').split('?')[0]).replace(/\/+/g,'/').toLowerCase();
 if(!['GET','POST','HEAD'].includes(req.method)||/^\/api\/(account-security|security-evidence)(?:\/|$)/.test(path))return false;
 // These two endpoints export employee pay summaries, not client files. Their
 // controllers still require agency payroll access, and authentication/session
 // verification still runs. Keep this exact: raw reports, receipts and future
 // payroll document endpoints must not inherit a blanket payroll exemption.
 if (['GET','HEAD'].includes(req.method) && /^\/api\/payroll\/periods\/\d+\/export\.csv\/?$/.test(path)) return false;
 if (req.method==='POST' && /^\/api\/payroll\/periods\/\d+\/adp\/export\/?$/.test(path)) return false;
 // This authenticated endpoint builds the provider's own introduction from
 // public profile/school details; it contains no client record. Its controller
 // still verifies the provider and assigned school. Do not spend client-file
 // download allowances or inherit an unrelated client-file review hold.
 if (['GET','HEAD'].includes(req.method) && /^\/api\/school-contact-plan\/pdf-preview\/?$/.test(path)) return false;
 if (req.method==='POST' && /\/print-upload$/.test(path)) return false;
 if (/\/printable-packet\/(availability|template(?:\/.*)?|org-version-history)$/.test(path)) return false;
 return /(?:^|[/.-])(download|exports?|pdf|csv|zip|print|printable-packet|completion-package)(?:[./-]|$)/i.test(path)
  || /^\/api\/support-tickets\/\d+\/attachments\/\d+\/view\/?$/.test(path)
  || /^\/api\/phi-documents\/(?:\d+\/view|school-attachments\/\d+\/view|enrollment-receipts\/\d+\/view|signed-school-packets\/\d+|clients\/\d+\/chart-artifacts\/[^/]+\/view)\/?$/.test(path)
  || /^\/uploads\/(?:uploads\/)*(phi-documents|intake_signed|intake_uploads)\//.test(path);
}
export async function enforceActivityProtection(req,res,next){try{
 if(fileOperation(req)&&!req.protectionRouteChecked){
  await protectFileResource(`route:${req.originalUrl||req.path}:${req.method==='POST'?JSON.stringify(req.body||{}):''}`,{req,forceReview:/(?:^|[/.-])(bulk|bundle|zip|exports?|roster)(?:[/?\.-]|$)/i.test(decodeURIComponent(req.originalUrl||''))});
  req.protectionRouteChecked=true;
 }
 next();
}catch(e){next(e);}}
