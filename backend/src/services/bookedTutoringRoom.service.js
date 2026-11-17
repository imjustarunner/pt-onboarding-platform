import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import User from '../models/User.model.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';
import { ensureTutoringAppointmentWorkspace } from './tutoringAppointmentWorkspace.service.js';
import { tutoringVisit } from './tutoringOffice.service.js';
import * as media from './clinicalVideo.service.js';
import Video from './vonageVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import * as workspace from './therapyWorkspace.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { buildPublicFormBrandingForAgencyId } from './publicFormBranding.service.js';
import { TutoringSessionNote } from '../models/TutoringSessionLearning.model.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const terminal = new Set(['canceled','cancelled','canceled_by_client','canceled_by_provider','canceled_by_guardian','canceled_by_organization','late_canceled','no_show','rescheduled','voided','draft']);
export function bookedTutoringWindow(appointment, now = Date.now()) {
 const start = new Date(utcMysqlToIso(appointment.startAt) || appointment.startAt).getTime();
 const end = new Date(utcMysqlToIso(appointment.endAt) || appointment.endAt).getTime();
 if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw fail(409, 'This tutoring appointment needs a valid scheduled time.');
 return { opensAt:new Date(start-1800000).toISOString(), closesAt:new Date(end+1800000).toISOString(), available:!terminal.has(appointment.status)&&now>=start-1800000&&now<=end+1800000 };
}
export async function bookedTutoringAccess(req, appointmentId) {
 const appointment = await Appointment.findById(Number(appointmentId));
 if (!appointment || (!['tutoring','learning'].includes(appointment.businessType)||appointment.serviceCode!=='TUTORING')) throw fail(404, 'Tutoring appointment not found.');
 const clients = (await Appointment.listParticipants(appointment.id)).filter(p=>p.clientId);
 if (clients.length !== 1) throw fail(409, 'This room requires one scheduled student. Use the group workflow for a class.');
 const clientId = Number(clients[0].clientId), host = Number(req.user.id) === Number(appointment.providerUserId);
 if(req.dependentPortalAccess && Number(req.dependentPortalAccess.client_id)!==clientId)throw fail(403,'This personal portal opens only your own tutoring sessions.');
 if (host) {
  if (!(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===Number(appointment.agencyId))) throw fail(403, 'Your access to this tutoring organization is no longer active.');
  await assertLearningClientAccess(req,clientId,appointment.agencyId);
 } else {
  if (!['client','client_guardian','guardian'].includes(req.user.role)) throw fail(403, 'Only the assigned tutor or an authorized family participant can join this session.');
  const access = await assertLearningClientAccess(req,clientId,appointment.agencyId);
  if (access.service && Number(access.service.provider_user_id)!==Number(appointment.providerUserId)) throw fail(403, 'This appointment belongs to a different tutoring team.');
  if (access.permissions?.canViewAppointments===false) throw fail(403, 'Appointment access is required to join this session.');
 }
 if (req.query?.clientId && Number(req.query.clientId)!==clientId) throw fail(403,'This appointment belongs to a different student.');
 return {appointment,clientId,host,actor:`user-${req.user.id}`,req};
}
const transact = async operation => {
 const db = await pool.getConnection();
 try { await db.beginTransaction(); const result=await operation(db); await db.commit();return result; }
 catch(error){await db.rollback();throw error;}finally{db.release();}
};
async function linkedSession(ctx,db=pool,lock=false) {
 const [[row]]=await db.execute(`SELECT s.* FROM tutoring_appointment_sessions b JOIN learning_class_sessions s ON s.id=b.session_id
  JOIN learning_program_classes c ON c.id=s.learning_class_id WHERE b.appointment_id=? AND c.organization_id=? AND s.provider_user_id=?${lock?' FOR UPDATE':''}`,[ctx.appointment.id,ctx.appointment.agencyId,ctx.appointment.providerUserId]);
 if (row) {
  const [students]=await db.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=?',[row.id]);
  if (students.length!==1 || Number(students[0].client_id)!==ctx.clientId) throw fail(409,'The saved room has a different student. Ask Support to review this appointment.');
 }
 return row||null;
}
function requireOpen(ctx) {
 const window=bookedTutoringWindow(ctx.appointment);
 if (terminal.has(ctx.appointment.status)) throw fail(409,'This appointment was canceled or changed. Open the current booking from your calendar.');
 if (!window.available) throw fail(409,`This session opens at ${window.opensAt} and closes at ${window.closesAt}.`);
 if (ctx.appointment.status==='completed') throw fail(410,'This tutoring session has ended.');
}
async function lockAppointment(ctx,db) {
 const [[current]]=await db.execute('SELECT status,provider_user_id,agency_id FROM appointments WHERE id=? FOR UPDATE',[ctx.appointment.id]);
 if (!current || Number(current.provider_user_id)!==Number(ctx.appointment.providerUserId)||Number(current.agency_id)!==Number(ctx.appointment.agencyId)) throw fail(409,'The tutor assignment changed. Reopen the appointment.');
 ctx.appointment={...ctx.appointment,status:current.status};
}
const audit=(ctx,session,action,details,db)=>clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,role:ctx.host?'provider':'client',actor:ctx.actor,req:ctx.req},action,{appointmentId:ctx.appointment.id,...details},db);
async function prepareSession(ctx,db){
 let session=await linkedSession(ctx,db,true);
 if(session)return session;
 const owner={userId:ctx.appointment.providerUserId,agencyId:ctx.appointment.agencyId};
 const visit=await tutoringVisit(owner,{tutoringAppointmentId:ctx.appointment.id},db);
 await ensureTutoringAppointmentWorkspace(owner,visit,db,{actorUserId:ctx.req.user.id});
 session=await linkedSession(ctx,db,true);
 if(!session)throw fail(409,'The booked tutoring room could not be prepared. Your appointment is unchanged.');
 await audit(ctx,session,'tutoring_room_prepared',{},db);
 return session;
}
export async function tutoringRoomStatus(ctx) {
 const session=await linkedSession(ctx), window=bookedTutoringWindow(ctx.appointment);
 const safe={appointmentId:ctx.appointment.id,clientId:ctx.clientId,agencyId:ctx.appointment.agencyId,providerId:ctx.appointment.providerUserId,host:ctx.host,title:String(ctx.appointment.title||'General tutoring').replace(/\bTUTORING\b/g,'Tutoring').replace(/Clinical session/gi,'Tutoring session'),timeZone:ctx.appointment.sourceTimezone||'America/Denver',startAt:utcMysqlToIso(ctx.appointment.startAt),endAt:utcMysqlToIso(ctx.appointment.endAt),...window,unavailableReason:terminal.has(ctx.appointment.status)?'This appointment was canceled or changed. Open the current booking from your calendar.':null,sessionId:session?.id||null,status:terminal.has(ctx.appointment.status)?ctx.appointment.status:session?.status||ctx.appointment.status,startedAt:utcMysqlToIso(session?.actual_started_at),endedAt:utcMysqlToIso(session?.actual_ended_at),branding:await buildPublicFormBrandingForAgencyId(ctx.appointment.agencyId)};
 if (!session)return {...safe,visits:[],visit:null};
 const [visits]=await pool.execute(`SELECT v.id,v.user_id AS userId,v.status,v.admitted_at AS admittedAt,v.ended_at AS endedAt,v.duration_seconds AS durationSeconds,CONCAT_WS(' ',u.first_name,u.last_name) AS displayName FROM tutoring_session_visits v JOIN users u ON u.id=v.user_id WHERE v.session_id=? ${ctx.host?'':'AND v.user_id=?'} ORDER BY v.id`,ctx.host?[session.id]:[session.id,ctx.req.user.id]);
 const room=session.twilio_room_sid?await media.clinicalMedia(session.twilio_room_sid):null;
 if(ctx.host){const durations=await media.clinicalAttendance('tutoring',session.id);return {...safe,roomState:room?.state||'idle',visits:visits.map(v=>({...v,mediaDurationSeconds:durations.get(Number(v.id))??null}))};}
 const visit=visits.at(-1)||null;
 if(visit&&['waiting','admitted'].includes(visit.status))await pool.execute('UPDATE tutoring_session_visits SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[visit.id]);
 return {...safe,roomState:room?.state||'idle',visit};
}
export async function openBookedTutoringRoom(ctx) {
 if(!ctx.host)throw fail(403,'Only the assigned tutor can open this tutoring room.');
 try{media.requireClinicalVideoMonitoring();}catch(error){if(error.status===503)throw fail(503,'Tutoring video monitoring is unavailable. Contact Support before opening this session.');throw error;}
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=await prepareSession(ctx,db);
  if(session.status==='ended')throw fail(410,'This tutoring session has ended.');
  let mediaId=session.twilio_room_sid;
  if(mediaId){const current=await media.clinicalMedia(mediaId,db,true);if(!current||current.session_kind!=='tutoring')throw fail(409,'This older visit uses the previous room. Ask Support to close it; its evidence will be kept.');await media.requireActiveClinicalMedia(mediaId,db);}
  else {
   mediaId=await Video.createSession();
   await media.registerClinicalMedia(mediaId,{kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,req:ctx.req},db);
   await db.execute('UPDATE learning_class_sessions SET twilio_room_sid=?,twilio_room_unique_name=? WHERE id=?',[mediaId,`tutoring-appointment-${ctx.appointment.id}`,session.id]);
   await audit(ctx,session,'tutoring_room_opened',{},db);
  }
  return {sessionId:mediaId,applicationId:process.env.VONAGE_APPLICATION_ID,token:await media.clinicalVideoToken(mediaId,{actor:ctx.actor,role:'provider',req:ctx.req},db),participantRole:'provider'};
 });
}
export async function joinBookedTutoringRoom(ctx) {
 if(ctx.host)return openBookedTutoringRoom(ctx);
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=await prepareSession(ctx,db);
  if(session.status==='ended')throw fail(410,'This tutoring session has ended.');
  const [[existing]]=await db.execute("SELECT id,status FROM tutoring_session_visits WHERE session_id=? AND user_id=? AND status IN ('waiting','admitted') ORDER BY id DESC LIMIT 1",[session.id,ctx.req.user.id]);
  if(existing)return {visit:existing};
  const [result]=await db.execute('INSERT INTO tutoring_session_visits(session_id,user_id,client_id,actor) VALUES(?,?,?,?)',[session.id,ctx.req.user.id,ctx.clientId,ctx.actor]);
  await audit(ctx,session,'tutoring_waiting_room_joined',{visitId:result.insertId},db);
  return {visit:{id:result.insertId,status:'waiting'}};
 });
}
export async function admitBookedTutoringParticipant(ctx,visitId) {
 if(!ctx.host)throw fail(403,'Only the assigned tutor can admit participants.');
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=await linkedSession(ctx,db,true);
  if(!session?.twilio_room_sid||session.status==='ended')throw fail(409,'Open this tutoring room first.');
  await media.requireMonitoredProvider(session.twilio_room_sid,db);
  const [[visit]]=await db.execute("SELECT * FROM tutoring_session_visits WHERE id=? AND session_id=? AND client_id=? AND status='waiting' FOR UPDATE",[Number(visitId),session.id,ctx.clientId]);
  if(!visit)throw fail(409,'This participant is no longer waiting for this appointment.');
  // Recheck family authorization at admission, not only when entering the lobby.
  const [[person]]=await db.execute('SELECT id,role,is_active,is_archived FROM users WHERE id=?',[visit.user_id]);
  if(Number(person?.is_active)!==1||Number(person?.is_archived)===1)throw fail(403,'This participant no longer has an active account.');
  await bookedTutoringAccess({...ctx.req,user:person},ctx.appointment.id);
  await db.execute("UPDATE tutoring_session_visits SET status='admitted',admitted_at=COALESCE(admitted_at,UTC_TIMESTAMP()),last_seen_at=UTC_TIMESTAMP() WHERE id=?",[visit.id]);
  await db.execute("UPDATE learning_class_sessions SET status='live',actual_started_at=COALESCE(actual_started_at,UTC_TIMESTAMP()),started_by_user_id=COALESCE(started_by_user_id,?) WHERE id=? AND status IN ('scheduled','live')",[ctx.req.user.id,session.id]);
  await db.execute("UPDATE appointments SET status='in_progress',updated_by_user_id=? WHERE id=? AND status IN ('scheduled','confirmed','client_confirmed','in_progress')",[ctx.req.user.id,ctx.appointment.id]);
  await audit(ctx,session,'tutoring_participant_admitted',{visitId:visit.id},db);return {ok:true};
 });
}
export async function bookedTutoringToken(ctx) {
 if(ctx.host)return openBookedTutoringRoom(ctx);
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=await linkedSession(ctx,db,true);
  if(!session?.twilio_room_sid||session.status==='ended')throw fail(409,'Wait for your tutor to open this session.');
  const [[visit]]=await db.execute("SELECT id FROM tutoring_session_visits WHERE session_id=? AND user_id=? AND client_id=? AND status='admitted' ORDER BY id DESC LIMIT 1",[session.id,ctx.req.user.id,ctx.clientId]);
  if(!visit)throw fail(403,'Wait for your tutor to admit you to this appointment.');
  return {sessionId:session.twilio_room_sid,applicationId:process.env.VONAGE_APPLICATION_ID,token:await media.clinicalVideoToken(session.twilio_room_sid,{actor:ctx.actor,role:'client',visitId:visit.id,req:ctx.req},db),participantRole:'client'};
 });
}
export async function leaveBookedTutoringRoom(ctx) {
 await transact(async db=>{
  await lockAppointment(ctx,db);const session=await linkedSession(ctx,db,true);if(!session)return;
  if(session.twilio_room_sid)await media.revokeClinicalActor(session.twilio_room_sid,ctx.actor,db);
  await db.execute("UPDATE tutoring_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND user_id=? AND status IN ('waiting','admitted')",[session.id,ctx.req.user.id]);
  await audit(ctx,session,'tutoring_participant_left',{},db);
 });
 await media.retryClinicalDisconnections();return {ok:true};
}
export async function endBookedTutoringRoom(ctx) {
 if(!ctx.host)throw fail(403,'Only the assigned tutor can end this tutoring session.');
 let session;
 await transact(async db=>{
  await lockAppointment(ctx,db);session=await linkedSession(ctx,db,true);
  if(!session)throw fail(409,'This appointment has no opened tutoring room.');
  if(session.twilio_room_sid)await media.requestClinicalEnd(session.twilio_room_sid,ctx.req,db);
  await db.execute("UPDATE tutoring_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted')",[session.id]);
  await db.execute("UPDATE learning_class_sessions SET status='ended',ends_at=COALESCE(actual_ended_at,UTC_TIMESTAMP()),actual_ended_at=COALESCE(actual_ended_at,UTC_TIMESTAMP()),ended_by_user_id=COALESCE(ended_by_user_id,?) WHERE id=?",[ctx.req.user.id,session.id]);
  await audit(ctx,session,'tutoring_room_ended',{},db);
 });
 const disconnected=session.twilio_room_sid?await media.finishClinicalEnd(session.twilio_room_sid):{state:'ended'};
 let billingWarning=null;
 if(session.actual_started_at){try{const {completeLearningSession}=await import('../controllers/learningClassSessions.controller.js');const result=await completeLearningSession(session.id,ctx.req.user.id);billingWarning=result?.billingWarning||null;}catch(error){billingWarning=`The session is closed and attendance was kept. Billing needs office review: ${error.message}`;}}
 return {...disconnected,appointmentId:ctx.appointment.id,learningSessionId:session.id,billingWarning};
}
export async function bookedTutoringWorkspace(ctx,operation,input={}) {
 if(terminal.has(ctx.appointment.status)&&!(ctx.host&&operation==='read'))throw fail(410,'This appointment was canceled or changed. Its shared workspace is closed.');
 const session=await linkedSession(ctx);if(!session)throw fail(409,'The tutor has not opened this appointment yet.');
 const [[visit]]=ctx.host?[[null]]:await pool.execute("SELECT id FROM tutoring_session_visits WHERE session_id=? AND user_id=? AND status='admitted' ORDER BY id DESC LIMIT 1",[session.id,ctx.req.user.id]);
 if(!ctx.host&&!visit)throw fail(403,'Admission to this appointment is required.');
 const scope={kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,role:ctx.host?'provider':'client',actor:ctx.actor,clientId:ctx.clientId,visitId:visit?.id,req:ctx.req,historical:ctx.host&&session.status==='ended',afterId:input.afterId};
 if(operation==='read')return workspace.readWorkspace(scope);
 if(operation==='download')return workspace.recordWorkspaceDownload(scope,Number(input.artifactId));
 if(input.payload?.mode==='treatment'||input.type==='rating')throw fail(400,'Use learning plans and family progress in the tutoring portal.');
 return workspace.appendWorkspace(scope,input);
}

// Called only by the authorized scheduling mutation, after the canonical change.
// It closes media and preserves attendance; cancellation is never completion.
export async function closeChangedBookedTutoringRoom(appointment,actorUserId){
 if(appointment?.businessType!=='tutoring')return;
 let mediaId=null;
 await transact(async db=>{
  const ctx={appointment};await lockAppointment(ctx,db);
  const [[session]]=await db.execute(`SELECT s.* FROM tutoring_appointment_sessions b JOIN learning_class_sessions s ON s.id=b.session_id WHERE b.appointment_id=? FOR UPDATE`,[appointment.id]);
  if(!session?.twilio_room_sid)return;
  const current=await media.clinicalMedia(session.twilio_room_sid,db,true);
  if(current?.session_kind!=='tutoring')return; // Preserve older office evidence.
  mediaId=session.twilio_room_sid;await media.requestClinicalEnd(mediaId,null,db);
  await db.execute("UPDATE tutoring_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted')",[session.id]);
  await db.execute("UPDATE learning_class_sessions SET status='ended',actual_ended_at=IF(actual_started_at IS NULL,actual_ended_at,COALESCE(actual_ended_at,UTC_TIMESTAMP())),ends_at=IF(actual_started_at IS NULL,ends_at,COALESCE(actual_ended_at,UTC_TIMESTAMP())) WHERE id=?",[session.id]);
  await clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:appointment.agencyId,actor:'scheduling-system'},'tutoring_booking_room_closed',{appointmentId:appointment.id,cancellationActorUserId:actorUserId||null},db);
 });
 if(mediaId)await media.finishClinicalEnd(mediaId);
}

export async function bookedTutoringNote(ctx, input = null) {
 if(!ctx.host)throw fail(403,'Session notes are private to the assigned tutor.');
 return transact(async db=>{
  await lockAppointment(ctx,db);
  const session=await linkedSession(ctx,db,true);
  if(!session)throw fail(409,'Open this booked session before saving its notes.');
  const existing=await TutoringSessionNote.findBySession(session.id,db);
  if(existing&&(Number(existing.client_id)!==ctx.clientId||Number(existing.agency_id)!==Number(ctx.appointment.agencyId)))throw fail(409,'This note requires a record-link review. Its contents were kept.');
  if(input===null)return {note:existing};
  if(typeof input.summary!=='string'||input.summary.length>20000)throw fail(400,'Write a session note of up to 20,000 characters.');
  const body={summary:input.summary,status:'saved',generalSupport:!session.student_subject_id};
  for(const field of ['strengthsObserved','challengesObserved','nextSteps','homework']){if(input[field]!==undefined){if(typeof input[field]!=='string'||input[field].length>20000)throw fail(400,'Keep each session note field within 20,000 characters.');body[field]=input[field];}}
  const note=existing?await TutoringSessionNote.update(existing.id,body,ctx.req.user.id,db):await TutoringSessionNote.create({...body,agencyId:ctx.appointment.agencyId,clientId:ctx.clientId,studentSubjectId:session.student_subject_id||null,sessionId:session.id,sessionType:String(ctx.appointment.modality).toUpperCase()==='IN_PERSON'?'in_person':'virtual'},ctx.req.user.id,db);
  await audit(ctx,session,'tutoring_session_note_saved',{noteId:note.id},db);
  return {note};
 });
}
