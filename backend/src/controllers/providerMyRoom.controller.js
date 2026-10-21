import {readOfficeMessages,sendOfficeMessage} from '../services/officeWaitingMessages.service.js';
import {activeMeetingAgencyIds} from '../services/meetingJoinPolicy.service.js';
import {officeSchedule,officeEncounterLink} from '../services/virtualOfficeSchedule.service.js';
import {admitCounselingVisit} from '../services/counselingSessionVisit.service.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import {maybeDecryptNotePayload} from '../services/clinicalNoteCrypto.service.js';
import pool from '../config/database.js';
import {buildPublicFormBrandingForAgencyId,requestBaseUrl} from '../services/publicFormBranding.service.js';
import { networkEvidence } from '../utils/securityEvidence.js';
import { clinicalAudit } from '../services/clinicalSessionAudit.service.js';
import { virtualOfficePresentation } from '../services/virtualOfficePresentation.service.js';
import * as workspace from '../services/therapyWorkspace.service.js';
import User from '../models/User.model.js';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import * as office from '../services/privateVirtualOffice.service.js';
import {assignedTutoringStudents} from '../services/tutoringOffice.service.js';
import { getMeetingPlan, setMeetingPlan, MEETING_PLANS } from '../services/meetingAccessPlan.service.js';

const respond = fn => async (req,res,next) => {
 res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 try { res.json(await fn(req)); }
 catch(e) { if(e.status) return res.status(e.status).json({error:{message:e.message}}); next(e); }
};
async function host(req) {
 const agencies = await User.getAgencies(req.user.id);
 return office.officeForHost(req.user.id, Number(req.query.agencyId || req.body?.agencyId || agencies?.[0]?.id));
}
async function ownerOfVisit(req) {
 const {room} = await host(req);
 if (!room) throw Object.assign(new Error('Office not found.'),{status:404});
 await office.assertOfficeAccess(room);
 return room;
}
export const getMyRoomPlan = respond(async req => ({plan:await getMeetingPlan(req.user.id),plans:MEETING_PLANS}));
export const putMyRoomPlan = respond(async req => ({plan:await setMeetingPlan(Number(req.params.userId),req.body.tier,req.user.id)}));
export const getMyRoomMe = respond(async req => { const {room,plan}=await host(req); return {room:await virtualOfficePresentation(room,req),plan}; });
export const getMyRoomLobby = respond(async req => { const {room}=await host(req); return office.officeLobby(room,req); });
export const getTutoringStudents=respond(async req=>({students:await assignedTutoringStudents((await host(req)).room)}));
export const openTutoringBinder=respond(async req=>({tutoring:await office.openStudentBinder((await host(req)).room,req.body,req)}));
export const getMyRoomHostVideo = respond(async req => office.officeHostVideo((await host(req)).room,{appointmentId:req.body?.appointmentId,sessionId:req.body?.sessionId,learningSessionId:req.body?.learningSessionId,tutoringAppointmentId:req.body?.tutoringAppointmentId,req}));
export const getOfficeScheduleScopes = respond(async req => {
 const agencies=await User.getAgencies(req.user.id);
 // The selected tenant may be outside a super-admin's explicit memberships.
 const candidates=[...(agencies || []).map(a=>a.id),req.query.agencyId];
 const agencyIds=await activeMeetingAgencyIds(candidates,req.user.id);
 if(!agencyIds.length){const {room}=await host(req);if(room.demoAccess)agencyIds.push(room.agencyId);}
 return {agencyIds};
});
export const getOfficeSchedule = respond(async req => {
 const {room}=await host(req);
 const data=await officeSchedule(room,req.query,req);
 const branding=await buildPublicFormBrandingForAgencyId(room.agencyId,{baseUrl:process.env.BACKEND_PUBLIC_URL||process.env.BACKEND_URL||requestBaseUrl(req)});
 return {...data,branding};
});
export const admitOfficeScheduledVisit = respond(async req => {
 const {room}=await host(req);
 const [[current]]=await pool.execute('SELECT generation FROM private_virtual_office_sessions WHERE room_id=?',[room.id]);
 const link=current?await officeEncounterLink(room.id,current.generation):null;
 if(!link)throw Object.assign(new Error('Open the scheduled session first.'),{status:409});
 return admitCounselingVisit({id:link.counseling_session_id,agency_id:room.agencyId},Number(req.params.visitId),req);
});
export const postMyRoomHeartbeat = respond(async req => office.officeHostHeartbeat((await host(req)).room));
export const endMyRoom = respond(async req => {
 const agencies=await User.getAgencies(req.user.id);
 const agencyId=Number(req.query.agencyId||req.body?.agencyId||agencies?.[0]?.id);
 const room=await ProviderMyRoom.findByUserId(req.user.id,agencyId);
 if (!room) throw Object.assign(new Error('Office not found.'),{status:404});
 // Owners can close and release media even after a plan expires.
 return office.endOffice(room,req);
});
export const getMyRoomPublic = respond(async req => {
 const room=await office.officeBySlug(req.params.slug);
 return {room:await virtualOfficePresentation(room,req)};
});
export const joinMyRoomLobby = respond(async req => ({lobby:await office.joinOffice(await office.officeBySlug(req.params.slug),req.body,networkEvidence(req).clientIp,networkEvidence(req).ipSource)}));
export const getMyRoomLobbyGuestStatus = respond(async req => ({lobby:await office.officeGuestStatus(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit'))}));
export const getMyRoomGuestVideo = respond(async req => office.officeGuestVideo(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit')));
export const admitMyRoomLobbyGuest = respond(async req => office.admitOfficeGuest(await ownerOfVisit(req),Number(req.params.lobbyId),{sameEncounter:req.body?.sameEncounter===true,clientId:Number(req.body?.clientId)||null,confirmIdentity:req.body?.confirmIdentity===true,req}));
export const dismissMyRoomLobbyGuest = respond(async req => office.dismissOfficeGuest(await ownerOfVisit(req),Number(req.params.lobbyId)));

export const resumeMyRoom = respond(async req => office.resumeOfficeVisit(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit')));
export const leaveMyRoom = respond(async req => office.leaveOffice(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit')));
export const getMyRoomHistory = respond(async req => office.officeHistory((await host(req)).room));
async function workspaceContext(req) {
 if(req.params.slug) return office.officeWorkspaceContext(await office.officeBySlug(req.params.slug),{id:Number(req.params.lobbyId),credential:req.get('X-Office-Visit')});
 return office.officeWorkspaceContext((await host(req)).room);
}
export const getOfficeWorkspace = respond(async req => workspace.readWorkspace({...await workspaceContext(req),afterId:req.query.afterId,req}));
export const getOfficeTreatmentPlans = respond(async req=>{const ctx=await workspaceContext(req);if(ctx.role!=='provider'||!ctx.clientId)throw Object.assign(new Error('Choose an identified client session.'),{status:403});return {plans:(await ClinicalTreatmentPlan.listByClient({agencyId:ctx.agencyId,clientId:ctx.clientId})).filter(p=>!['voided','superseded'].includes(p.status)).map(p=>({id:p.id,title:p.title||'Treatment plan',status:p.status}))};});
export const postOfficeWorkspace = respond(async req => {
 const ctx={...await workspaceContext(req),req};let body=req.body;
 if(body?.type==='share'&&body.payload?.mode==='treatment'){
  if(ctx.role!=='provider'||!ctx.clientId)throw Object.assign(new Error('Choose an identified client session.'),{status:403});
  const plan=await ClinicalTreatmentPlan.findById(Number(body.payload.planId));
  if(!plan||Number(plan.agency_id)!==Number(ctx.agencyId)||Number(plan.client_id)!==Number(ctx.clientId))throw Object.assign(new Error('Treatment plan not found for this client.'),{status:404});
  ctx.verifiedTreatment=true;body={type:'share',payload:{mode:'treatment',planId:plan.id,clientId:ctx.clientId,title:plan.title||'Your treatment goals',goals:(plan.goals||[]).filter(g=>!g.superseded_at).map(g=>({id:g.id,text:maybeDecryptNotePayload(g.goal_text)}))}};
 }
 return workspace.appendWorkspace(ctx,body);
});
export const downloadOfficeArtifact = respond(async req => workspace.recordWorkspaceDownload({...await workspaceContext(req),req},Number(req.body.artifactId)));
export const downloadOfficeHistoryArtifact = respond(async req=>{
 const {room}=await host(req);
 return workspace.recordWorkspaceDownload({req,...await office.officeHistoryContext(room,Number(req.params.generation))},Number(req.body.artifactId));
});

export const getOfficeVisitArtifacts = respond(async req => {
 const {room}=await host(req);
 const generation=Number(req.params.generation);
 if(!Number.isSafeInteger(generation)||generation<1)throw Object.assign(new Error('Invalid visit.'),{status:400});
 return workspace.readWorkspace({req,...await office.officeHistoryContext(room,generation),afterId:req.query.afterId});
});

const officeMessageActor=req=>req.params.slug?{role:'guest',credential:req.get('X-Office-Visit'),req}:{role:'provider',userId:req.user.id,req};
async function officeMessageRoom(req){return req.params.slug?office.officeBySlug(req.params.slug):ownerOfVisit(req);}
export const getOfficeMessages=respond(async req=>readOfficeMessages(await officeMessageRoom(req),Number(req.params.visitId),officeMessageActor(req)));
export const postOfficeMessage=respond(async req=>sendOfficeMessage(await officeMessageRoom(req),Number(req.params.visitId),officeMessageActor(req),req.body));
