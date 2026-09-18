import { protectFileResource } from '../services/activityProtection.service.js';
export function fileOperation(req){
 const path=decodeURIComponent(String(req.originalUrl||req.path||'').split('?')[0]).replace(/\/+/g,'/').toLowerCase();
 if(!['GET','POST','HEAD'].includes(req.method)||/^\/api\/(account-security|security-evidence)(?:\/|$)/.test(path))return false;
 if (req.method==='POST' && /\/print-upload$/.test(path)) return false;
 if (/\/printable-packet\/(availability|template(?:\/.*)?|org-version-history)$/.test(path)) return false;
 return /(?:^|[/.-])(download|exports?|pdf|csv|zip|print|printable-packet|completion-package)(?:[./-]|$)/i.test(path)
  || /^\/api\/phi-documents\/(?:\d+\/view|signed-school-packets\/\d+|clients\/\d+\/chart-artifacts\/[^/]+\/view)$/.test(path)
  || /^\/uploads\/(?:uploads\/)*(phi-documents|intake_signed|intake_uploads)\//.test(path);
}
export async function enforceActivityProtection(req,res,next){try{
 if(fileOperation(req)&&!req.protectionRouteChecked){
  await protectFileResource(`route:${req.originalUrl||req.path}:${req.method==='POST'?JSON.stringify(req.body||{}):''}`,{req,forceReview:/(?:^|[/.-])(bulk|bundle|zip|exports?|roster)(?:[/?\.-]|$)/i.test(decodeURIComponent(req.originalUrl||''))});
  req.protectionRouteChecked=true;
 }
 next();
}catch(e){next(e);}}
