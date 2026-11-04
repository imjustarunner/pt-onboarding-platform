import {Router} from 'express';
import {portalList,portalRead} from '../services/safetyPlans/records.js';
import {portalViewAs} from '../services/portalViewAs.service.js';
import {logAuditEvent} from '../services/auditEvent.service.js';
import {listMyClientIntakeSignedDocuments,getMyClientIntakeSignedDocumentDownloadUrl} from '../controllers/guardianPortal.controller.js';
import {listSharedFiles,sharedFile} from '../services/guardianFileShares.service.js';
import {listBalances,listReceipts} from '../services/familyLedger/views.js';
import {assertClientCanViewOwnShared,listSharedForClient,exportDeliverable} from '../services/assessmentDeliverable.service.js';
import {downloadEnrollmentCopy} from '../services/guardianEnrollmentCopies.service.js';
const router=Router();
const run=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
const context=req=>({actor:req.previewActor||req.user,agencyId:req.auricwellPreview?.agencyId||Number(req.query.agencyId),clientId:Number(req.params.clientId),userId:Number(req.params.userId)});
router.use((req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});if(req.method!=='GET')return res.status(403).json({error:{message:'Portal View as is read-only.'}});next();});
router.get('/clients/:clientId/accounts',run(async(req,res)=>res.json(await portalViewAs.accounts(context(req)))));
router.get('/clients/:clientId/accounts/:userId/activity',run(async(req,res)=>res.json(await portalViewAs.activity(context(req)))));
router.get('/clients/:clientId/accounts/:userId/read',run(async(req,res,next)=>{
  const c=context(req),{user}=await portalViewAs.target(c),resource=String(req.query.resource||'');
  // This is a fixed read adapter, never a proxy URL or impersonation credential.
  await logAuditEvent(req,{actionType:'portal_view_as',agencyId:c.agencyId,metadata:{clientId:c.clientId,targetUserId:user.id,resource}});
  const care={agencyId:c.agencyId};
  const targetReq={...req,user,params:{clientId:String(c.clientId),documentId:String(req.query.id||'')},query:care};
  if(resource==='forms')return res.json(await portalList(user,c.clientId,{agencyId:c.agencyId}));
  if(resource==='form')return res.json(await portalRead(user,Number(req.query.id),{agencyId:c.agencyId,clientId:c.clientId,auditActor:c.actor}));
  if(resource==='intake-documents')return listMyClientIntakeSignedDocuments(targetReq,res,next);
  if(resource==='intake-download')return getMyClientIntakeSignedDocumentDownloadUrl(targetReq,res,next);
  if(resource==='enrollment-copy'){
    const file=await downloadEnrollmentCopy({userId:user.id,clientId:c.clientId,agencyId:c.agencyId,submissionId:Number(req.query.id)});
    return res.type('application/pdf').send(file.body);
  }
  if(resource==='shared-files')return res.json({files:await listSharedFiles(user.id,c.clientId,care)});
  if(resource==='shared-file'){
    const file=await sharedFile(user.id,c.clientId,Number(req.query.id),care,{auditActorUserId:c.actor.id});
    return res.type(file.type).send(file.body);
  }
  if(resource==='assessments'||resource==='assessment-download'){
    await assertClientCanViewOwnShared({user,clientId:c.clientId});
    const docs=(await listSharedForClient({clientId:c.clientId})).filter(d=>Number(d.agencyId)===Number(c.agencyId));
    if(resource==='assessments')return res.json({deliverables:docs});
    const doc=docs.find(d=>Number(d.id)===Number(req.query.id));
    if(!doc) return res.status(404).json({error:{message:'Shared assessment unavailable.'}});
    const file=await exportDeliverable({id:doc.id,format:'pdf'});
    return res.type(file.mimeType).send(file.buffer);
  }
  if(resource==='balances')return res.json({balances:await listBalances({agencyId:c.agencyId,userId:user.id,clientId:c.clientId})});
  if(resource==='receipts')return res.json({receipts:await listReceipts({agencyId:c.agencyId,userId:user.id,clientId:c.clientId})});
  return res.status(404).json({error:{message:'This action is not available in read-only portal preview.'}});
}));
export default router;
