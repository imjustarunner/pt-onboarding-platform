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
 const room = await ProviderMyRoom.findByUserId(req.user.id);
 if (!room) throw Object.assign(new Error('Office not found.'),{status:404});
 await office.assertOfficeAccess(room);
 return room;
}
export const getMyRoomPlan = respond(async req => ({plan:await getMeetingPlan(req.user.id),plans:MEETING_PLANS}));
export const putMyRoomPlan = respond(async req => ({plan:await setMeetingPlan(Number(req.params.userId),req.body.tier,req.user.id)}));
export const getMyRoomMe = respond(async req => { const {room,plan}=await host(req); return {room:{slug:room.slug,displayName:room.displayName},plan}; });
export const getMyRoomLobby = respond(async req => { const {room}=await host(req); return office.officeLobby(room); });
export const getMyRoomHostVideo = respond(async req => office.officeHostVideo((await host(req)).room));
export const postMyRoomHeartbeat = respond(async req => office.officeHostHeartbeat((await host(req)).room));
export const endMyRoom = respond(async req => {
 const room=await ProviderMyRoom.findByUserId(req.user.id);
 if (!room) throw Object.assign(new Error('Office not found.'),{status:404});
 // Owners can close and release media even after a plan expires.
 return office.endOffice(room);
});
export const getMyRoomPublic = respond(async req => {
 const room=await office.officeBySlug(req.params.slug);
 return {room:{slug:room.slug,displayName:room.displayName}};
});
export const joinMyRoomLobby = respond(async req => ({lobby:await office.joinOffice(await office.officeBySlug(req.params.slug),req.body)}));
export const getMyRoomLobbyGuestStatus = respond(async req => ({lobby:await office.officeGuestStatus(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit'))}));
export const getMyRoomGuestVideo = respond(async req => office.officeGuestVideo(await office.officeBySlug(req.params.slug),Number(req.params.lobbyId),req.get('X-Office-Visit')));
export const admitMyRoomLobbyGuest = respond(async req => office.admitOfficeGuest(await ownerOfVisit(req),Number(req.params.lobbyId)));
export const dismissMyRoomLobbyGuest = respond(async req => office.dismissOfficeGuest(await ownerOfVisit(req),Number(req.params.lobbyId)));
