import { networkEvidence } from '../utils/securityEvidence.js';
import { clinicalAudit } from '../services/clinicalSessionAudit.service.js';
import { buildPublicFormBrandingForAgencyId } from '../services/publicFormBranding.service.js';
import * as workspace from '../services/therapyWorkspace.service.js';
import User from '../models/User.model.js';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import * as office from '../services/privateVirtualOffice.service.js';
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
export const getMyRoomMe = respond(async req => { const {room,plan}=await host(req); return {room:{slug:room.slug,displayName:room.displayName,agencyId:room.agencyId,branding:await buildPublicFormBrandingForAgencyId(room.agencyId)},plan}; });
export const getMyRoomLobby = respond(async req => { const {room}=await host(req); return office.officeLobby(room,req); });
export const getMyRoomHostVideo = respond(async req => office.officeHostVideo((await host(req)).room));
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
 return {room:{slug:room.slug,displayName:room.displayName,agencyId:room.agencyId,branding:await buildPublicFormBrandingForAgencyId(room.agencyId)}};
});
export const joinMyRoomLobby = respond(async req => ({lobby:await office.joinOffice(await office.officeBySlug(req.params.slug),req.body,networkEvidence(req).clientIp,networkEvidence(req).ipSource)}));
export const getMyRoomLobbyGuestStatus = respond(async req => ({lobby:await office.officeGuestStatus(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit'))}));
export const getMyRoomGuestVideo = respond(async req => office.officeGuestVideo(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit')));
export const admitMyRoomLobbyGuest = respond(async req => office.admitOfficeGuest(await ownerOfVisit(req),Number(req.params.lobbyId),{sameEncounter:req.body?.sameEncounter===true,req}));
export const dismissMyRoomLobbyGuest = respond(async req => office.dismissOfficeGuest(await ownerOfVisit(req),Number(req.params.lobbyId)));

export const leaveMyRoom = respond(async req => office.leaveOffice(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit')));
export const getMyRoomHistory = respond(async req => office.officeHistory((await host(req)).room));
async function workspaceContext(req) {
 if(req.params.slug) return office.officeWorkspaceContext(await office.officeBySlug(req.params.slug),{id:Number(req.params.lobbyId),credential:req.get('X-Office-Visit')});
 return office.officeWorkspaceContext((await host(req)).room);
}
export const getOfficeWorkspace = respond(async req => workspace.readWorkspace({...await workspaceContext(req),afterId:req.query.afterId,req}));
export const postOfficeWorkspace = respond(async req => workspace.appendWorkspace({...await workspaceContext(req),req},req.body));
export const downloadOfficeArtifact = respond(async req => workspace.recordWorkspaceDownload({...await workspaceContext(req),req},Number(req.body.artifactId)));
export const downloadOfficeHistoryArtifact = respond(async req=>{
 const {room}=await host(req);
 return workspace.recordWorkspaceDownload({req,historical:true,kind:'office',sessionId:room.id,generation:Number(req.params.generation),agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`},Number(req.body.artifactId));
});

export const getOfficeVisitArtifacts = respond(async req => {
 const {room}=await host(req);
 const generation=Number(req.params.generation);
 if(!Number.isSafeInteger(generation)||generation<1)throw Object.assign(new Error('Invalid visit.'),{status:400});
 return workspace.readWorkspace({req,historical:true,kind:'office',sessionId:room.id,generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`,afterId:req.query.afterId});
});
