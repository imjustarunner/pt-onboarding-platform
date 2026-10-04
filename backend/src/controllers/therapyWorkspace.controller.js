import { clinicalMedia } from '../services/clinicalVideo.service.js';
import { assertSessionAccess } from './counselingSessions.controller.js';
import { counselingClient } from '../services/counselingInvitationAccess.service.js';
import * as workspace from '../services/therapyWorkspace.service.js';
import * as visits from '../services/counselingSessionVisit.service.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
const respond=fn=>async(req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});try{res.json(await fn(req));}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}};
async function access(req,{requireAdmission=true}={}) {
 const {session,participantRole}=await assertSessionAccess(req,req.params.sessionId);
 if(session.status==='ended'&&req.method!=='GET'&&!(participantRole==='provider'&&req.path.endsWith('/workspace/download')))throw Object.assign(new Error('This session has ended.'),{status:410});
 if(requireAdmission&&participantRole!=='provider')await visits.requireCounselingAdmission(req,session);
 return {session,participantRole};
}
export const getVisits=respond(async req=>{const {session,participantRole}=await access(req,{requireAdmission:false});const data=await visits.counselingVisitStatus(req,session,participantRole==='provider');if(data.visits){let label='Client';try{const client=await counselingClient(session);label=client.initials||'Client';}catch(e){if(e.status!==409)throw e;}data.visits=data.visits.map(v=>({...v,displayName:label}));}return data;});
export const admitVisit=respond(async req=>{const {session,participantRole}=await access(req);if(participantRole!=='provider')throw Object.assign(new Error('Only the provider may admit clients.'),{status:403});return visits.admitCounselingVisit(session,Number(req.params.visitId),req);});
export const leaveVisit=respond(async req=>{const {session}=await access(req,{requireAdmission:false});return visits.leaveCounselingVisit(req,session);});
async function context(req) {
 const {session,participantRole}=await access(req);
 let clientId=null;try{clientId=(await counselingClient(session)).id;}catch(e){if(e.status!==409)throw e;}
 const visit=participantRole==='client'?await visits.requireCounselingAdmission(req,session):null;
 return {req,visitId:visit?.id,historical:participantRole==='provider'&&session.status==='ended',kind:'counseling',sessionId:session.id,agencyId:session.agency_id,role:participantRole,actor:req.counselingInvitationAccess?`client-${req.counselingInvitationAccess.clientId}`:`user-${req.user.id}`,clientId};
}
export const getWorkspace=respond(async req=>workspace.readWorkspace({...await context(req),afterId:req.query.afterId}));
export const downloadArtifact=respond(async req=>workspace.recordWorkspaceDownload(await context(req),Number(req.body.artifactId)));
export const postWorkspace=respond(async req=>{
 const ctx=await context(req);let body=req.body;
 if(body.type==='share'&&body.payload?.mode==='treatment') {
  if(ctx.role!=='provider'||!ctx.clientId)throw Object.assign(new Error('Select an identified client session.'),{status:403});
  const plan=await ClinicalTreatmentPlan.findById(Number(body.payload.planId));
  if(!plan||Number(plan.agency_id)!==Number(ctx.agencyId)||Number(plan.client_id)!==Number(ctx.clientId))throw Object.assign(new Error('Treatment plan not found for this client.'),{status:404});
  ctx.verifiedTreatment=true;
  body={type:'share',payload:{mode:'treatment',planId:plan.id,clientId:ctx.clientId,title:plan.title||'Your treatment goals',goals:(plan.goals||[]).filter(g=>!g.superseded_at).map(g=>({id:g.id,text:maybeDecryptNotePayload(g.goal_text)}))}};
 }
 return workspace.appendWorkspace(ctx,body);
});
export const getTreatmentPlans=respond(async req=>{
 const ctx=await context(req);
 if(ctx.role!=='provider'||!ctx.clientId)throw Object.assign(new Error('An identified client is required.'),{status:403});
 const rows=await ClinicalTreatmentPlan.listByClient({agencyId:ctx.agencyId,clientId:ctx.clientId});
 return {plans:rows.filter(p=>!['voided','superseded'].includes(p.status)).map(p=>({id:p.id,title:p.title||'Treatment plan',status:p.status}))};
});

export const getDisconnection=respond(async req=>{const {session,participantRole}=await access(req,{requireAdmission:false});if(participantRole!=='provider')throw Object.assign(new Error('Provider access required.'),{status:403});const media=session.vonage_session_id?await clinicalMedia(session.vonage_session_id):null;return {state:media?.state||(session.status==='ended'?'ended':'active')};});
