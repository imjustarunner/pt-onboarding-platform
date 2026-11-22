import crypto from 'node:crypto';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import {authorizedAppointmentClient} from './guardianAppointments.service.js';
import {guardianContextAllowsAppointment} from './clientServiceEnrollment.service.js';
import {bookedTutoringWindow} from './bookedTutoringRoom.service.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {tutoringSessionHubEnabled} from '../utils/tutoringSessionHubPolicy.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import {clinicalAudit} from './clinicalSessionAudit.service.js';
import {tutoringInvitationAllowed} from '../utils/tutoringGuestPermissions.js';
import {utcMysqlToIso} from '../utils/zonedWallTime.util.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export const tutoringGuestBookingHash=a=>hash(JSON.stringify([a.id,a.agencyId,a.providerUserId,utcMysqlToIso(a.startAt),utcMysqlToIso(a.endAt),a.learningContext?.serviceEnrollmentId||0,a.modality,a.videoRoomMode,a.externalMeetingUrl||'']));
const stopped=new Set(['completed','ended','no_show','no_show_pending','late_canceled','rescheduled','voided','draft','canceled','cancelled','canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization']);
export async function issueTutoringGuestLink(appointment,clientId,recipientUserId,db=pool) {
 const agency=await Agency.findById(appointment.agencyId);
 if(!tutoringSessionHubEnabled(agency))return null;
 if(stopped.has(appointment.status)||['none','external'].includes(appointment.videoRoomMode)||!['VIRTUAL','TELEHEALTH','VIDEO','ONLINE'].includes(appointment.modality))return null;
 const access=await authorizedAppointmentClient(recipientUserId,clientId,{agencyId:appointment.agencyId,serviceId:appointment.learningContext?.serviceEnrollmentId});
 if(!tutoringInvitationAllowed(access,appointment,guardianContextAllowsAppointment))throw fail(403,'This tutoring invitation is unavailable.');
 const bookingHash=tutoringGuestBookingHash(appointment);
 let [[grant]]=await db.execute('SELECT id,token_envelope FROM tutoring_guest_grants WHERE appointment_id=? AND recipient_user_id=? AND booking_hash=? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',[appointment.id,recipientUserId,bookingHash]);
 let token;
 if(grant)token=maybeDecryptNotePayload(grant.token_envelope);
 else {
  token=crypto.randomBytes(32).toString('base64url');grant={id:crypto.randomUUID()};
  await db.execute('INSERT INTO tutoring_guest_grants(id,appointment_id,agency_id,client_id,recipient_user_id,booking_hash,token_hash,token_envelope) VALUES(?,?,?,?,?,?,?,?)',[grant.id,appointment.id,appointment.agencyId,clientId,recipientUserId,bookingHash,hash(token),maybeEncryptNotePayload(token)]);
 }
 return buildPublicAppUrl(agency,'tutoring/invite#'+token);
}
async function grantContext(req,grant) {
 const appointment=await Appointment.findById(grant.appointment_id);
 const agency=appointment&&await Agency.findById(appointment.agencyId);
 if(!appointment||!tutoringSessionHubEnabled(agency)||grant.revoked_at||Number(grant.agency_id)!==Number(appointment.agencyId)||grant.booking_hash!==tutoringGuestBookingHash(appointment)||stopped.has(appointment.status))throw fail(410,'This session link has ended or changed. Ask your tutor for the current appointment link.');
 const window=bookedTutoringWindow(appointment);
 if(Date.now()>Date.parse(window.closesAt))throw fail(410,'This session link has expired.');
 const person=await User.findById(grant.recipient_user_id);
 if(!person||Number(person.is_active)!==1||Number(person.is_archived)===1)throw fail(403,'This invitation is no longer available.');
 const access=await authorizedAppointmentClient(grant.recipient_user_id,grant.client_id,{agencyId:appointment.agencyId,serviceId:appointment.learningContext?.serviceEnrollmentId});
 if(!tutoringInvitationAllowed(access,appointment,guardianContextAllowsAppointment))throw fail(403,'This invitation is no longer available.');
 const participants=await Appointment.listParticipants(appointment.id);
 if(participants.filter(p=>p.clientId).length!==1||!participants.some(p=>Number(p.clientId)===Number(grant.client_id)))throw fail(403,'This invitation belongs to another session.');
 return {appointment,agency,access,person};
}
export async function exchangeTutoringGuest(req,token) {
 if(!/^[A-Za-z0-9_-]{43}$/.test(String(token||'')))throw fail(404,'Session invitation not found.');
 const [[grant]]=await pool.execute('SELECT * FROM tutoring_guest_grants WHERE token_hash=?',[hash(token)]);
 if(!grant)throw fail(404,'Session invitation not found.');
 const context=await grantContext(req,grant);
 const id=crypto.randomUUID(),proof=crypto.randomBytes(32).toString('base64url');
 await pool.execute('INSERT INTO tutoring_guest_sessions(id,grant_id,proof_hash) VALUES(?,?,?)',[id,grant.id,hash(proof)]);
 await clinicalAudit({kind:'tutoring',sessionId:0,agencyId:context.appointment.agencyId,actor:'guest:'+id,role:'invited_family',req:{...req,user:null}},'tutoring_guest_link_exchanged',{grantId:grant.id,appointmentId:context.appointment.id});
 return {id,proof,agencyId:context.appointment.agencyId,expiresAt:bookedTutoringWindow(context.appointment).closesAt};
}
export async function tutoringGuestAccess(req,id,proof) {
 if(!/^[a-f0-9-]{36}$/.test(String(id||''))||!proof)throw fail(401,'Open the session link from your invitation.');
 const [[session]]=await pool.execute('SELECT s.*,g.appointment_id,g.agency_id,g.client_id,g.recipient_user_id,g.booking_hash,g.revoked_at AS grant_revoked_at FROM tutoring_guest_sessions s JOIN tutoring_guest_grants g ON g.id=s.grant_id WHERE s.id=? AND s.proof_hash=?',[id,hash(String(proof))]);
 if(!session||session.revoked_at||session.grant_revoked_at)throw fail(401,'Open the session link from your invitation.');
 const {appointment,access,person}=await grantContext(req,{...session,revoked_at:session.grant_revoked_at});
 await pool.execute('UPDATE tutoring_guest_sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[id]);
 return {appointment,hubV2:true,clientId:Number(session.client_id),studentName:access.full_name||access.client?.full_name||access.initials||null,host:false,actor:'guest:'+id,participantUserId:Number(session.recipient_user_id),guestSessionId:id,guestGrantId:session.grant_id,
  req:{...req,user:{id:null,role:'invited_family'},tutoringGuest:{id,recipientUserId:session.recipient_user_id}},guestDisplayName:[person.first_name,person.last_name].filter(Boolean).join(' ')||'Invited family'};
}

export async function revalidateTutoringGuestVisit(actor,appointmentId,db=pool){
 const id=String(actor||'').replace(/^guest:/,'');
 const [[row]]=await db.execute('SELECT s.revoked_at AS session_revoked_at,g.* FROM tutoring_guest_sessions s JOIN tutoring_guest_grants g ON g.id=s.grant_id WHERE s.id=?',[id]);
 if(!row||row.session_revoked_at||Number(row.appointment_id)!==Number(appointmentId))throw fail(403,'This invitation is no longer active.');
 return grantContext({},row);
}
export async function revokeTutoringInvitation(ctx,recipientId){
 if(!ctx.host)throw fail(403,'Only the assigned tutor can end a session invitation.');
 await pool.execute('UPDATE tutoring_guest_grants SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE appointment_id=? AND agency_id=? AND recipient_user_id=?',[ctx.appointment.id,ctx.appointment.agencyId,Number(recipientId)]);
 const [sessions]=await pool.execute('SELECT s.id FROM tutoring_guest_sessions s JOIN tutoring_guest_grants g ON g.id=s.grant_id WHERE g.appointment_id=? AND g.recipient_user_id=?',[ctx.appointment.id,Number(recipientId)]);
 for(const session of sessions)await disconnectGuest(session.id);
 await clinicalAudit({kind:'tutoring',sessionId:ctx.appointment.id,agencyId:ctx.appointment.agencyId,actor:ctx.actor,role:'provider',req:ctx.req},'tutoring_invitation_revoked',{appointmentId:ctx.appointment.id,recipientUserId:Number(recipientId)});
 return {ok:true};
}

async function disconnectGuest(id,db=pool){
 const [visits]=await db.execute("SELECT v.id,v.session_id,s.booked_media_id FROM tutoring_session_visits v JOIN learning_class_sessions s ON s.id=v.session_id WHERE v.actor=? AND v.status IN ('waiting','admitted')",['guest:'+id]);
 const media=await import('./clinicalVideo.service.js');
 for(const visit of visits){
  if(visit.booked_media_id)await media.revokeClinicalActor(visit.booked_media_id,'guest:'+id,db);
  await db.execute("UPDATE tutoring_session_visits SET status='ended',ended_at=COALESCE(ended_at,UTC_TIMESTAMP()),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE id=?",[visit.id]);
 }
}
export async function sweepTutoringGuestAccess(){
 let rows;
 try{[rows]=await pool.execute("SELECT DISTINCT s.id,g.appointment_id,s.last_checked_at FROM tutoring_guest_sessions s JOIN tutoring_guest_grants g ON g.id=s.grant_id JOIN tutoring_session_visits v ON v.actor=CONCAT('guest:',s.id) AND v.status IN ('waiting','admitted') ORDER BY s.last_checked_at,s.id LIMIT 100");}catch(e){if(e.code==='ER_NO_SUCH_TABLE')return;throw e;}
 for(const row of rows){
  try{await revalidateTutoringGuestVisit('guest:'+row.id,row.appointment_id);}
  catch(e){if(![401,403,404,409,410].includes(e.status))throw e;await pool.execute('UPDATE tutoring_guest_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE id=?',[row.id]);await disconnectGuest(row.id);await clinicalAudit({kind:'tutoring',sessionId:row.appointment_id,actor:'system:tutoring-guest-access',role:'system'},'tutoring_guest_access_ended',{guestSessionId:row.id});}
  finally{await pool.execute('UPDATE tutoring_guest_sessions SET last_checked_at=UTC_TIMESTAMP() WHERE id=?',[row.id]);}
 }
}
