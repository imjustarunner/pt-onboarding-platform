import pool from '../config/database.js';
import {hasTransitionClientImportAccess} from '../services/transitionClientImportAccess.service.js';
import {logAuditEvent} from '../services/auditEvent.service.js';

// Compatibility adapter for the existing import handlers' administrator checks.
// Only the listed, practice-bound import operations receive an effective role.
// The authenticated human ID/session is preserved; the account role never changes.
export function transitionImportOperation(method,path,body={}){
 if(method==='POST'&&path==='/api/clients'&&body.recordsImport===true)return {};
 if(method==='POST'&&path==='/api/clients/import-candidates')return {};
 if(method==='GET'&&path==='/api/office-clients/providers')return {};
 const office=path.match(/^\/api\/users\/(\d+)\/office-assignments$/);if(method==='GET'&&office)return {targetUserId:Number(office[1])};
 if(method==='POST'&&/^\/api\/portal-migration\/staff\/transition-(preview|prepare|send)$/.test(path))return {clientId:Number(body.clientId)};
 if(method==='POST'&&path==='/api/medical-billing/treatment-plans'&&body.recordsImport&&typeof body.recordsImport==='object'&&body.finalize!==true&&(!body.status||body.status==='draft')&&!body.signature)return {clientId:Number(body.clientId)};
 const match=path.match(/^\/api\/clients\/(\d+)(.*)$/);if(!match)return null;
 const clientId=Number(match[1]),suffix=match[2];
 if(method==='GET'&&['','/service-enrollments','/agency-affiliations','/affiliations'].includes(suffix))return {clientId};
 if(method==='POST'&&['/service-enrollments','/agency-affiliations','/affiliations','/provider-assignments','/demographics/parse','/demographics/import'].includes(suffix))return {clientId};
 if(method==='PUT'&&suffix==='/provider')return {clientId};
 if(method==='POST'&&suffix==='/intake-note/import'&&body.recordsImport&&typeof body.recordsImport==='object'&&!body.finalize&&!body.signature)return {clientId};
 const imports={GET:/^\/chart-import\/(?:drafts(?:\/[a-zA-Z_]+)?|records|responsible-billing-contact|payer-readiness|medical-history(?:\/\d+\/view)?)$/,
  PUT:/^\/chart-import\/(?:drafts\/[a-zA-Z_]+|responsible-billing-contact)$/,
  POST:/^\/chart-import\/(?:start|complete|sections\/[a-zA-Z_]+|contacts\/\d+\/portal-account|payer-(?:automation|search|link)|medical-history(?:\/\d+\/check)?)$/};
 return imports[method]?.test(suffix)?{clientId}:null;
}
export async function transitionClientImportAccess(req,res,next){
 try{
  if(['admin','super_admin'].includes(req.user?.role))return next();
  const path=new URL(req.originalUrl,'https://app.invalid').pathname.replace(/\/$/,'');
  const operation=transitionImportOperation(req.method,path,req.body);if(!operation)return next();
  const raw=[req.get?.('X-Agency-Id'),req.query?.agencyId,req.query?.agency_id,req.body?.agencyId,req.body?.agency_id,...String(req.query?.agencyIds||'').split(',')].filter(v=>v!=null&&String(v).trim());
  const requested=[...new Set(raw.map(Number))];if(requested.some(v=>!Number.isSafeInteger(v)||v<1)||requested.length>1)return next();
  let agencyId=requested[0]||null;
  if(operation.clientId){
   const [[client]]=await pool.execute('SELECT agency_id FROM clients WHERE id=?',[operation.clientId]);
   if(!client||agencyId&&agencyId!==Number(client.agency_id))return next();agencyId=Number(client.agency_id);
  }
  if(operation.targetUserId){if(!agencyId)return next();const [[member]]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[operation.targetUserId,agencyId]);if(!member)return next();}
  if(!agencyId||!await hasTransitionClientImportAccess(req.user,agencyId))return next();
  const originalRole=req.user.role;
  await logAuditEvent(req,{actionType:'transition_client_import_delegated',agencyId,required:true,metadata:{permission:'practice_transition_client_import',originalRole,effectiveRole:'admin',method:req.method,path,clientId:operation.clientId||null}});
  req.clientImportDelegation={agencyId,originalRole};
  req.user={...req.user,role:'admin',effectiveRole:'admin',clientImportDelegation:req.clientImportDelegation};
  next();
 }catch(error){next(error);}
}
