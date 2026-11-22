import StudentSubject from '../models/StudentSubject.model.js';
import {tutoringSessionHubEnabled} from '../utils/tutoringSessionHubPolicy.js';
import StudentLearningPlan from '../models/StudentLearningPlan.model.js';
import { saveLearningPlanSessionNote } from './tutoringSessionChecklist.service.js';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';
import { boardSkillProgress } from '../utils/tutoringBoardProgress.js';
import { draftBoardQuestion, lessonActivity, recordLessonReview } from './tutoringBoardLesson.service.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';
import { ensureTutoringAppointmentWorkspace } from './tutoringAppointmentWorkspace.service.js';
import { tutoringVisit } from './tutoringOffice.service.js';
import * as media from './clinicalVideo.service.js';
import Video from './vonageVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import * as workspace from './therapyWorkspace.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { buildPublicFormBrandingForAgencyId } from './publicFormBranding.service.js';
import {publishTutoringNote,getPublishedTutoringNote,getAppointmentFamilySummary,tutoringFamilyDraft,tutoringFamilyDraftMetadata} from './tutoringNotePublication.service.js';
import {appointmentServiceLabel,appointmentAttendanceView} from '../utils/appointmentPresentation.js';
import {resolveTutoringTrack} from './tutoringBookingContext.service.js';
import {getLearningOverview} from './tutoringLearningOs.service.js';
import { AcademicSkillEvidence, TutoringSessionNote, TutoringSessionBrief } from '../models/TutoringSessionLearning.model.js';
import {assertClinicalWorkActive} from './clinicalWorkArchiveRead.service.js';
import {endConnectedTutoringVisits} from './tutoringMediaAttendance.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const terminal = new Set(['canceled','cancelled','canceled_by_client','canceled_by_provider','canceled_by_guardian','canceled_by_organization','late_canceled','no_show','rescheduled','voided','draft','no_show_pending']);
export function bookedTutoringWindow(appointment, now = Date.now()) {
 const start = new Date(utcMysqlToIso(appointment.startAt) || appointment.startAt).getTime();
 const end = new Date(utcMysqlToIso(appointment.endAt) || appointment.endAt).getTime();
 if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw fail(409, 'This tutoring appointment needs a valid scheduled time.');
 return { opensAt:new Date(start-1800000).toISOString(), closesAt:new Date(end+1800000).toISOString(), available:appointment.status!=='completed'&&!terminal.has(appointment.status)&&now>=start-1800000&&now<=end+1800000 };
}
export async function bookedTutoringAccess(req, appointmentId) {
 const appointment = await Appointment.findById(Number(appointmentId));
 if (!appointment || (!['tutoring','learning'].includes(appointment.businessType)||appointment.serviceCode!=='TUTORING')) throw fail(404, 'Tutoring appointment not found.');
 const clients = (await Appointment.listParticipants(appointment.id)).filter(p=>p.clientId);
 if (clients.length !== 1) throw fail(409, 'This room requires one scheduled student. Use the group workflow for a class.');
 const selectedServiceId=Number(req.query?.serviceId);
 const appointedServiceId=Number(appointment.learningContext?.serviceEnrollmentId);
 if(selectedServiceId&&appointedServiceId&&selectedServiceId!==appointedServiceId){
  throw fail(403,'This appointment belongs to a different tutoring service.');
 }
 const clientId = Number(clients[0].clientId), host = Number(req.user.id) === Number(appointment.providerUserId);
 if(req.dependentPortalAccess && Number(req.dependentPortalAccess.client_id)!==clientId)throw fail(403,'This personal portal opens only your own tutoring sessions.');
 let access;
 if (host) {
  if (!(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===Number(appointment.agencyId))) throw fail(403, 'Your access to this tutoring organization is no longer active.');
  access = await assertLearningClientAccess(req,clientId,appointment.agencyId);
 } else {
  if (!['client','client_guardian','guardian'].includes(req.user.role)) throw fail(403, 'Only the assigned tutor or an authorized family participant can join this session.');
  access = await assertLearningClientAccess(req,clientId,appointment.agencyId);
  if(access.service&&appointment.learningContext?.serviceEnrollmentId&&Number(access.service.id)!==Number(appointment.learningContext.serviceEnrollmentId))throw fail(403,'This appointment belongs to a different tutoring service.');
  if (access.service && Number(access.service.provider_user_id)!==Number(appointment.providerUserId)) throw fail(403, 'This appointment belongs to a different tutoring team.');
  if (Array.isArray(access.services) && !access.services.some(s=>s.service_kind==='tutoring'&&Number(s.is_active)===1&&Number(s.provider_user_id)===Number(appointment.providerUserId)&&(!appointment.learningContext?.serviceEnrollmentId||Number(s.id)===Number(appointment.learningContext.serviceEnrollmentId)))) throw fail(403,'An active tutoring assignment is required to join this appointment.');
  if (access.permissions?.canViewAppointments===false) throw fail(403, 'Appointment access is required to join this session.');
 }
 if (req.query?.clientId && Number(req.query.clientId)!==clientId) throw fail(403,'This appointment belongs to a different student.');
 return {appointment,clientId,hubV2:tutoringSessionHubEnabled(await Agency.findById(appointment.agencyId)),studentName:access?.client?.full_name || clients[0].displayName || access?.client?.initials || null,host,actor:`user-${req.user.id}`,req};
}
const transact = async operation => {
 const db = await pool.getConnection();
 try { await db.beginTransaction(); const result=await operation(db); await db.commit();return result; }
 catch(error){await db.rollback();throw error;}finally{db.release();}
};
export async function linkedSession(ctx,db=pool,lock=false) {
 const [[row]]=await db.execute(`SELECT s.* FROM tutoring_appointment_sessions b JOIN learning_class_sessions s ON s.id=b.session_id
  JOIN learning_program_classes c ON c.id=s.learning_class_id WHERE b.appointment_id=? AND c.organization_id=? AND s.provider_user_id=?${lock?' FOR UPDATE':''}`,[ctx.appointment.id,ctx.appointment.agencyId,ctx.appointment.providerUserId]);
 if (row) {
  const [students]=await db.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=?',[row.id]);
  if (students.length!==1 || Number(students[0].client_id)!==ctx.clientId) throw fail(409,'The saved room has a different student. Ask Support to review this appointment.');
 }
 return row||null;
}
function requireOpen(ctx) {
 if(ctx.appointment.videoRoomMode==='none')throw fail(409,'This appointment has no video room.');
 if(!['VIRTUAL','ONLINE','VIDEO','TELEHEALTH'].includes(String(ctx.appointment.modality).toUpperCase()))throw fail(409,'This is an in-person appointment. Open its learning workspace from your calendar.');
 if (ctx.appointment.status==='completed') throw fail(410,'This tutoring session has ended.');
 const window=bookedTutoringWindow(ctx.appointment);
 if (terminal.has(ctx.appointment.status)) throw fail(409,'This appointment was canceled or changed. Open the current booking from your calendar.');
 if (!window.available) {
  const local=new Intl.DateTimeFormat('en-US',{timeZone:ctx.appointment.sourceTimezone||'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  if(Date.now()>Date.parse(window.closesAt))throw fail(410,'The join window for this tutoring session has closed.');
  throw fail(409,`This tutoring session opens ${local.format(new Date(window.opensAt))}.`);
 }
}
export async function lockAppointment(ctx,db) {
 await assertClinicalWorkActive({id:ctx.appointment.id,archiveResourceType:'appointment'},{db,currentRead:true});
 const [[current]]=await db.execute('SELECT status,provider_user_id,agency_id,start_at,end_at,modality,service_code,business_type,video_room_mode FROM appointments WHERE id=? FOR UPDATE',[ctx.appointment.id]);
 if (!current || Number(current.provider_user_id)!==Number(ctx.appointment.providerUserId)||Number(current.agency_id)!==Number(ctx.appointment.agencyId)) throw fail(409,'The tutor assignment changed. Reopen the appointment.');
 if((current.start_at&&utcMysqlToIso(current.start_at)!==utcMysqlToIso(ctx.appointment.startAt))||(current.end_at&&utcMysqlToIso(current.end_at)!==utcMysqlToIso(ctx.appointment.endAt)))throw fail(409,'This appointment was rescheduled. Reopen the current booking from your calendar.');
 if(current.service_code&&current.service_code!=='TUTORING')throw fail(409,'This appointment service changed. Reopen the current booking.');
 if(current.modality&&current.modality!==ctx.appointment.modality)throw fail(409,'This appointment format changed. Reopen the current booking.');
 ctx.appointment={...ctx.appointment,status:current.status,videoRoomMode:current.video_room_mode ?? ctx.appointment.videoRoomMode};
}
const audit=(ctx,session,action,details,db)=>clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,role:ctx.host?'provider':'client',actor:ctx.actor,req:ctx.req},action,{appointmentId:ctx.appointment.id,...details},db);
async function prepareSession(ctx,db,{workspaceOnly=false}={}){
 let session=await linkedSession(ctx,db,true);
 if(session)return session;
 if(ctx.appointment.status==='completed')throw fail(409,'This completed appointment has no linked learning record. Ask Support to review its existing attendance before adding a signed summary.');
 const owner={userId:ctx.appointment.providerUserId,agencyId:ctx.appointment.agencyId};
 const visit=workspaceOnly?{tutoringAppointmentId:ctx.appointment.id,learning_service_code:'TUTORING',starts_at:ctx.appointment.startAt,ends_at:ctx.appointment.endAt,title:appointmentServiceLabel(ctx.appointment),modality:ctx.appointment.modality,participants:[{id:ctx.clientId}],learning_context_json:ctx.appointment.learningContext}:await tutoringVisit(owner,{tutoringAppointmentId:ctx.appointment.id},db);
 await ensureTutoringAppointmentWorkspace(owner,visit,db,{actorUserId:ctx.req.user.id});
 session=await linkedSession(ctx,db,true);
 if(!session)throw fail(409,'The booked tutoring room could not be prepared. Your appointment is unchanged.');
 await audit(ctx,session,'tutoring_room_prepared',{},db);
 return session;
}
export async function tutoringRoomStatus(ctx) {
 const session=await linkedSession(ctx), window=bookedTutoringWindow(ctx.appointment);
 const {status,displayStatus}=appointmentAttendanceView(ctx.appointment,{learningSession:session});
 const closed=terminal.has(status)||['ended','completed'].includes(status);
 const safe={sessionHubV2:!!ctx.hubV2,appointmentId:ctx.appointment.id,clientId:ctx.clientId,agencyId:ctx.appointment.agencyId,
  providerId:ctx.appointment.providerUserId,studentName:ctx.studentName||null,host:ctx.host,
  title:appointmentServiceLabel(ctx.appointment),modality:ctx.appointment.modality,
  timeZone:ctx.appointment.sourceTimezone||'America/Denver',startAt:utcMysqlToIso(ctx.appointment.startAt),endAt:utcMysqlToIso(ctx.appointment.endAt),
  ...window,available:window.available&&!closed&&ctx.appointment.videoRoomMode!=='none',status,displayStatus,closed,sessionId:session?.id||null,
  startedAt:utcMysqlToIso(session?.actual_started_at),endedAt:utcMysqlToIso(session?.actual_ended_at),
  needsCompletion:!!(ctx.host&&session?.actual_started_at&&session?.actual_ended_at&&ctx.appointment.status==='in_progress'),
  branding:await buildPublicFormBrandingForAgencyId(ctx.appointment.agencyId,{enrollmentChannel:'tutoring'})};
 if(!ctx.host&&session?.actual_ended_at&&['ended','completed'].includes(status)) {
  safe.familySummary=await getAppointmentFamilySummary(ctx,session);
 }
 if (!session||closed)return {...safe,visits:[],visit:null};
 const [visits]=await pool.execute(`SELECT v.id,v.user_id AS userId,v.actor,v.status,v.last_seen_at AS lastSeenAt,v.admitted_at AS admittedAt,v.ended_at AS endedAt,v.duration_seconds AS durationSeconds,CONCAT_WS(' ',u.first_name,u.last_name) AS displayName FROM tutoring_session_visits v JOIN users u ON u.id=v.user_id WHERE v.session_id=? ${ctx.host?'':ctx.guestSessionId?'AND v.actor=?':'AND v.user_id=?'} ORDER BY v.id`,ctx.host?[session.id]:[session.id,ctx.guestSessionId?ctx.actor:ctx.req.user.id]);
 const room=session.booked_media_id?await media.clinicalMedia(session.booked_media_id):null;
 if(ctx.host){const durations=await media.clinicalAttendance('tutoring',session.id);return {...safe,roomState:room?.state||'idle',visits:visits.map(v=>({...v,present:Date.now()-Date.parse(utcMysqlToIso(v.lastSeenAt))<=20000,mediaDurationSeconds:durations.get(Number(v.id))??null}))};}
 const visit=visits.at(-1)||null;
 return {...safe,roomState:room?.state||'idle',visit};
}
export async function heartbeatBookedTutoringRoom(ctx) {
 if(ctx.host)return {ok:true};
 requireOpen(ctx);
 const session=await linkedSession(ctx);
 if(!session)return {ok:true,waitingForTutor:true};
 if(session.status==='ended')throw fail(410,'This tutoring session has ended.');
 await pool.execute(`UPDATE tutoring_session_visits SET last_seen_at=UTC_TIMESTAMP() WHERE session_id=? AND ${ctx.guestSessionId?'actor':'user_id'}=? AND status IN ('waiting','admitted')`,[session.id,ctx.guestSessionId?ctx.actor:ctx.req.user.id]);
 return {ok:true};
}
export async function maintainBookedTutoringRooms() {
 const [stale]=await pool.execute(`SELECT v.id,v.session_id,a.agency_id,a.id AS appointment_id FROM tutoring_session_visits v
  JOIN tutoring_appointment_sessions b ON b.session_id=v.session_id JOIN appointments a ON a.id=b.appointment_id
  WHERE v.status='waiting' AND v.last_seen_at<UTC_TIMESTAMP()-INTERVAL 20 SECOND ORDER BY v.last_seen_at LIMIT 100`);
 for(const visit of stale){
  const [updated]=await pool.execute("UPDATE tutoring_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=0 WHERE id=? AND status='waiting' AND last_seen_at<UTC_TIMESTAMP()-INTERVAL 20 SECOND",[visit.id]);
  if(updated.affectedRows)await clinicalAudit({kind:'tutoring',sessionId:visit.session_id,agencyId:visit.agency_id,actor:'system:tutoring-presence',role:'system'},'tutoring_waiting_room_expired',{appointmentId:visit.appointment_id,visitId:visit.id});
 }
 const [expired]=await pool.execute(`SELECT a.id FROM appointments a JOIN tutoring_appointment_sessions b ON b.appointment_id=a.id
  JOIN learning_class_sessions s ON s.id=b.session_id JOIN clinical_video_sessions m ON m.media_id=s.booked_media_id
  WHERE m.session_kind='tutoring' AND m.state='active' AND a.end_at<UTC_TIMESTAMP()-INTERVAL 30 MINUTE LIMIT 100`);
 for(const row of expired){
  const appointment=await Appointment.findById(row.id);if(!appointment||Date.now()<=Date.parse(bookedTutoringWindow(appointment).closesAt))continue;
  let mediaId;
  await transact(async db=>{
   await lockAppointment({appointment},db);
   const [[session]]=await db.execute('SELECT s.* FROM tutoring_appointment_sessions b JOIN learning_class_sessions s ON s.id=b.session_id WHERE b.appointment_id=? FOR UPDATE',[appointment.id]);
   if(!session?.booked_media_id)return;
   const current=await media.clinicalMedia(session.booked_media_id,db,true);if(current?.state!=='active'||current.session_kind!=='tutoring')return;
   mediaId=session.booked_media_id;await media.requestClinicalEnd(mediaId,null,db);
   await endConnectedTutoringVisits(session,db);
   await db.execute("UPDATE learning_class_sessions SET status='ended',actual_ended_at=COALESCE(actual_ended_at,UTC_TIMESTAMP()) WHERE id=?",[session.id]);
   await clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:appointment.agencyId,actor:'system:tutoring-window',role:'system'},'tutoring_join_window_closed',{appointmentId:appointment.id,requiresTutorCompletion:!!session.actual_started_at},db);
  });
  if(mediaId)await media.finishClinicalEnd(mediaId);
 }
}
export async function openBookedTutoringRoom(ctx) {
 if(!ctx.host)throw fail(403,'Only the assigned tutor can open this tutoring room.');
 try{media.requireClinicalVideoMonitoring();}catch(error){if(error.status===503)throw fail(503,'Tutoring video monitoring is unavailable. Contact Support before opening this session.');throw error;}
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=await prepareSession(ctx,db);
  if(session.status==='ended')throw fail(410,'This tutoring session has ended.');
  let mediaId=session.booked_media_id;
  if(mediaId){const current=await media.clinicalMedia(mediaId,db,true);if(!current||current.session_kind!=='tutoring')throw fail(409,'This older visit uses the previous room. Ask Support to close it; its evidence will be kept.');await media.requireActiveClinicalMedia(mediaId,db);}
  else {
   mediaId=await Video.createSession();
   await media.registerClinicalMedia(mediaId,{kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,req:ctx.req},db);
   await db.execute('UPDATE learning_class_sessions SET booked_media_id=? WHERE id=?',[mediaId,session.id]);
   await audit(ctx,session,'tutoring_room_opened',{},db);
  }
  return {sessionId:mediaId,applicationId:process.env.VONAGE_APPLICATION_ID,token:await media.clinicalVideoToken(mediaId,{actor:ctx.actor,role:'provider',req:ctx.req,displayName:[ctx.req.user.first_name,ctx.req.user.last_name].filter(Boolean).join(' ')||'Tutor'},db),participantRole:'provider'};
 });
}
export async function joinBookedTutoringRoom(ctx) {
 if(ctx.host)return openBookedTutoringRoom(ctx);
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=ctx.hubV2?await linkedSession(ctx,db,true):await prepareSession(ctx,db);
  if(!session)return {waitingForTutor:true};
  if(session.status==='ended')throw fail(410,'This tutoring session has ended.');
  const [[existing]]=await db.execute(`SELECT id,status FROM tutoring_session_visits WHERE session_id=? AND ${ctx.guestSessionId?'actor':'user_id'}=? AND status IN ('waiting','admitted') ORDER BY id DESC LIMIT 1`,[session.id,ctx.guestSessionId?ctx.actor:ctx.req.user.id]);
  if(existing)return {visit:existing};
  const [result]=await db.execute('INSERT INTO tutoring_session_visits(session_id,user_id,client_id,actor) VALUES(?,?,?,?)',[session.id,ctx.participantUserId||ctx.req.user.id,ctx.clientId,ctx.actor]);
  await audit(ctx,session,'tutoring_waiting_room_joined',{visitId:result.insertId},db);
  return {visit:{id:result.insertId,status:'waiting'}};
 });
}
export async function admitBookedTutoringParticipant(ctx,visitId) {
 if(ctx.appointment.status==='no_show_pending')throw fail(409,'Undo this pending no-show before admitting a late arrival.');
 if(!ctx.host)throw fail(403,'Only the assigned tutor can admit participants.');
 return transact(async db=>{
  await lockAppointment(ctx,db);if(ctx.appointment.status==='no_show_pending')throw fail(409,'Undo this pending no-show before admitting a late arrival.');requireOpen(ctx);
  const session=await linkedSession(ctx,db,true);
  if(!session?.booked_media_id||session.status==='ended')throw fail(409,'Open this tutoring room first.');
  await media.requireMonitoredProvider(session.booked_media_id,db);
  const [[visit]]=await db.execute("SELECT * FROM tutoring_session_visits WHERE id=? AND session_id=? AND client_id=? AND status='waiting' AND last_seen_at>=UTC_TIMESTAMP()-INTERVAL 20 SECOND FOR UPDATE",[Number(visitId),session.id,ctx.clientId]);
  if(!visit)throw fail(409,'This participant is no longer waiting for this appointment.');
  // Recheck family authorization at admission, not only when entering the lobby.
  const [[person]]=await db.execute('SELECT id,role,is_active,is_archived FROM users WHERE id=?',[visit.user_id]);
  if(Number(person?.is_active)!==1||Number(person?.is_archived)===1)throw fail(403,'This participant no longer has an active account.');
  if(String(visit.actor).startsWith('guest:'))await (await import('./tutoringGuest.service.js')).revalidateTutoringGuestVisit(visit.actor,ctx.appointment.id,db);
  else await bookedTutoringAccess({...ctx.req,user:person},ctx.appointment.id);
  await db.execute("UPDATE tutoring_session_visits SET status='admitted',admitted_at=COALESCE(admitted_at,UTC_TIMESTAMP()),last_seen_at=UTC_TIMESTAMP() WHERE id=?",[visit.id]);
  // Verified provider + family media connections start attendance, not Admit.
  await audit(ctx,session,'tutoring_participant_admitted',{visitId:visit.id},db);return {ok:true};
 });
}
export async function bookedTutoringToken(ctx) {
 if(ctx.host)return openBookedTutoringRoom(ctx);
 return transact(async db=>{
  await lockAppointment(ctx,db);requireOpen(ctx);
  const session=await linkedSession(ctx,db,true);
  if(!session?.booked_media_id||session.status==='ended')throw fail(409,'Wait for your tutor to open this session.');
  const [[visit]]=await db.execute(`SELECT id FROM tutoring_session_visits WHERE session_id=? AND ${ctx.guestSessionId?'actor':'user_id'}=? AND client_id=? AND status='admitted' ORDER BY id DESC LIMIT 1`,[session.id,ctx.guestSessionId?ctx.actor:ctx.req.user.id,ctx.clientId]);
  if(!visit)throw fail(403,'Wait for your tutor to admit you to this appointment.');
  return {sessionId:session.booked_media_id,applicationId:process.env.VONAGE_APPLICATION_ID,token:await media.clinicalVideoToken(session.booked_media_id,{actor:ctx.actor,role:'client',visitId:visit.id,req:ctx.req,displayName:ctx.studentName ? `${ctx.studentName}’s family` : 'Family participant'},db),participantRole:'client'};
 });
}
export async function leaveBookedTutoringRoom(ctx) {
 await transact(async db=>{
  await lockAppointment(ctx,db);const session=await linkedSession(ctx,db,true);if(!session)return;
  if(session.booked_media_id)await media.revokeClinicalActor(session.booked_media_id,ctx.actor,db);
  await endConnectedTutoringVisits(session,db,{column:ctx.guestSessionId?'actor':'user_id',value:ctx.guestSessionId?ctx.actor:ctx.req.user.id});
  await audit(ctx,session,'tutoring_participant_left',{},db);
 });
 await media.retryClinicalDisconnections();return {ok:true};
}
export async function endBookedTutoringRoom(ctx) {
 if(!ctx.host)throw fail(403,'Only the assigned tutor can end this tutoring session.');
 let session,connectedAttendance=false;
 await transact(async db=>{
  await lockAppointment(ctx,db);
  if(terminal.has(ctx.appointment.status))throw fail(409,'This appointment already has an attendance outcome.');
  session=await linkedSession(ctx,db,true);
  if(!session)throw fail(409,'This appointment has no opened tutoring room.');
  if(session.booked_media_id)await media.requestClinicalEnd(session.booked_media_id,ctx.req,db);
  connectedAttendance=await endConnectedTutoringVisits(session,db);
  await db.execute("UPDATE learning_class_sessions SET status=IF(actual_started_at IS NULL,'ended',status),ends_at=COALESCE(actual_ended_at,UTC_TIMESTAMP()),actual_ended_at=COALESCE(actual_ended_at,UTC_TIMESTAMP()),ended_by_user_id=COALESCE(ended_by_user_id,?) WHERE id=?",[ctx.req.user.id,session.id]);
  await audit(ctx,session,'tutoring_room_ended',{},db);
 });
 const disconnected=session.booked_media_id?await media.finishClinicalEnd(session.booked_media_id):{state:'ended'};
 let billingWarning=null;
 if(session.actual_started_at&&session.booked_media_id&&!connectedAttendance)billingWarning='The room is closed, but no connected family attendance has been confirmed. Support must review the evidence before billing.';
 else if(session.actual_started_at){try{const {completeLearningSession}=await import('../controllers/learningClassSessions.controller.js');const result=await completeLearningSession(session.id,ctx.req.user.id);billingWarning=result?.billingWarning||null;}catch(error){await pool.execute("UPDATE learning_class_sessions SET status='ended' WHERE id=? AND actual_ended_at IS NOT NULL",[session.id]);billingWarning=`The session is closed and attendance was kept. Billing needs office review: ${error.message}`;}}
 return {...disconnected,appointmentId:ctx.appointment.id,learningSessionId:session.id,billingWarning};
}
export async function bookedTutoringWorkspace(ctx,operation,input={}) {
 if(terminal.has(ctx.appointment.status)&&!(ctx.host&&operation==='read'))throw fail(410,'This appointment was canceled or changed. Its shared workspace is closed.');
 const session=await linkedSession(ctx);if(!session)throw fail(409,'The tutor has not opened this appointment yet.');
 const [[visit]]=ctx.host?[[null]]:await pool.execute(`SELECT id FROM tutoring_session_visits WHERE session_id=? AND ${ctx.guestSessionId?'actor':'user_id'}=? AND status='admitted' ORDER BY id DESC LIMIT 1`,[session.id,ctx.guestSessionId?ctx.actor:ctx.req.user.id]);
 if(!ctx.host&&!visit)throw fail(403,'Admission to this appointment is required.');
 const scope={kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,role:ctx.host?'provider':'client',actor:ctx.actor,clientId:ctx.clientId,visitId:visit?.id,req:ctx.req,learningWorkspace:!!ctx.hubV2,appointmentId:ctx.appointment.id,providerId:ctx.appointment.providerUserId,historical:ctx.host&&session.status==='ended',afterId:input.afterId};
 if(operation==='read')return workspace.readWorkspace(scope);
 if(input.type==='share'&&input.payload?.mode==='worksheet'){
  const [[v]]=await pool.execute("SELECT v.id FROM tutoring_material_versions v JOIN tutoring_material_shares sh ON sh.material_version_id=v.id AND sh.session_id=v.session_id WHERE v.id=? AND v.session_id=? AND v.client_id=? AND v.status='approved' AND sh.revoked_at IS NULL",[Number(input.payload.versionId),session.id,ctx.clientId]);
  if(!ctx.hubV2||!v||!ctx.host)throw fail(403,'Choose an approved worksheet from this session.');
  scope.verifiedWorksheet=true;
 }
 if(!ctx.host && input.type==='share')throw fail(403,'Only the assigned tutor can present lesson materials.');
 if(input.type==='board_review')throw fail(400,'Review learning activities from the session record.');
 if(input.type==='board_prompt'){
  if(!ctx.host)throw fail(403,'Only the assigned tutor can present or review a problem.');
  const subject=await resolveTutoringTrack(ctx.appointment,ctx.clientId,session.student_subject_id);
  if(input.payload?.excerpt?.materialId){
   const [rows]=await pool.execute('SELECT id FROM learning_class_session_materials WHERE session_id=? AND id=? AND storage_path IS NOT NULL',[session.id,input.payload.excerpt.materialId]);
   if(!rows.length)throw fail(409,'Choose a prepared worksheet from this session.');
  }
  if(input.payload?.goalId){
   const plan=subject&&await StudentLearningPlan.findActiveBySubject(subject.id);
   const goals=plan?.approved_at && await StudentLearningPlan.listGoals(plan.id);
   if(!goals||!goals.some(g=>Number(g.id)===input.payload.goalId))throw fail(409,'Choose a goal from this appointment’s approved learning plan.');
  }

 }
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
  if(!session?.booked_media_id)return;
  const current=await media.clinicalMedia(session.booked_media_id,db,true);
  if(current?.session_kind!=='tutoring')return; // Preserve older office evidence.
  mediaId=session.booked_media_id;await media.requestClinicalEnd(mediaId,null,db);
  await db.execute("UPDATE tutoring_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted')",[session.id]);
  await db.execute("UPDATE learning_class_sessions SET status='ended',actual_ended_at=IF(actual_started_at IS NULL,actual_ended_at,COALESCE(actual_ended_at,UTC_TIMESTAMP())),ends_at=IF(actual_started_at IS NULL,ends_at,COALESCE(actual_ended_at,UTC_TIMESTAMP())) WHERE id=?",[session.id]);
  await clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:appointment.agencyId,actor:'scheduling-system'},'tutoring_booking_room_closed',{appointmentId:appointment.id,cancellationActorUserId:actorUserId||null},db);
 });
 if(mediaId)await media.finishClinicalEnd(mediaId);
}

async function validateSessionGoals(ctx, session, goalIds, db) {
 if (!Array.isArray(goalIds) || goalIds.length > 20 || goalIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
  throw fail(400, 'Select goals from this student’s learning plan.');
 }
 if (!goalIds.length) return;
 const subject = await resolveTutoringTrack(ctx.appointment, ctx.clientId, session.student_subject_id);
 const plan = subject && await StudentLearningPlan.findActiveBySubject(subject.id, db);
 if (!plan?.approved_at || Number(plan.client_id) !== ctx.clientId || Number(plan.agency_id) !== Number(ctx.appointment.agencyId)) {
  throw fail(409, 'This session has no approved plan for the booked subject. Reload its learning goals.');
 }
 const goals = await StudentLearningPlan.listGoals(plan.id, db);
 const available = new Set(goals.filter(g => Number(g.student_subject_id) === Number(subject.id)).map(g => Number(g.id)));
 if (goalIds.some(id => !available.has(id))) throw fail(409, 'A selected goal is outside the current approved plan. Reload its learning goals.');
}

export async function bookedTutoringNote(ctx, input = null) {
 if(!ctx.host)throw fail(403,'Session notes are private to the assigned tutor.');
 const result = await transact(async db=>{
  await lockAppointment(ctx,db);
  const closed=terminal.has(ctx.appointment.status);
  if(input!==null&&closed)throw fail(409,'This appointment has an attendance outcome. The saved record is read-only.');
  const session=input===null?await linkedSession(ctx,db):await prepareSession(ctx,db,{workspaceOnly:true});
  if(!session)return {note:null,familyDraft:null};
  const existing=await TutoringSessionNote.findBySession(session.id,db);
  if(existing&&(Number(existing.client_id)!==ctx.clientId||Number(existing.agency_id)!==Number(ctx.appointment.agencyId)))throw fail(409,'This note requires a record-link review. Its contents were kept.');
  if(input===null)return {note:existing,familyDraft:tutoringFamilyDraft(existing),...(existing?.status==='signed'?{publication:await getPublishedTutoringNote(existing.id,db)}:{})};
  if(existing?.status==='signed'){if(input.signAndShare===true){const publication=await publishTutoringNote(ctx,session,existing,input,db);return {note:existing,publication};}throw fail(409,'This signed summary is read-only. Its original content has been kept.');}
  if(input.familySummary===true){
   await validateSessionGoals(ctx, session, input.goalIds ?? [], db);
   const metadata=tutoringFamilyDraftMetadata(existing,input);
   if(input.signAndShare===true)metadata.summaryNoticeRequested=true;
   let reviewedItems = [];
   if(input.signAndShare===true){
    const activity=await lessonActivity(ctx,session,db);
    if(activity.items.some(i=>!i.rating))throw Object.assign(fail(409,'Review each shared activity before signing. Choose Not assessed for material you only demonstrated.'),{code:'UNRATED_LESSON_ACTIVITY'});
    reviewedItems = activity.items;
    metadata.lessonActivity={activityIds:activity.items.map(i=>i.id),strokes:activity.strokes,snapshot:maybeEncryptNotePayload(JSON.stringify(activity.items))};
   }
   const note=existing?await TutoringSessionNote.update(existing.id,{metadata},ctx.req.user.id,db):await TutoringSessionNote.create({agencyId:ctx.appointment.agencyId,clientId:ctx.clientId,studentSubjectId:session.student_subject_id||null,sessionId:session.id,status:'saved',summary:'',metadata},ctx.req.user.id,db);
   const publication=input.signAndShare===true?await publishTutoringNote(ctx,session,note,input,db,reviewedItems):null;
   await audit(ctx,session,publication?'tutoring_summary_signed_shared':'tutoring_family_summary_draft_saved',{noteId:note.id,publicationId:publication?.id||null},db);
   return {note:publication?{...note,status:'signed'}:note,familyDraft:tutoringFamilyDraft(note),publication};
  }
  if(input.documentationMode==='learning_plan_checklist'){
   const subject=await StudentSubject.findById(input.studentSubjectId);
   if(!subject||Number(subject.client_id)!==ctx.clientId||Number(subject.agency_id)!==Number(ctx.appointment.agencyId))throw fail(403,'This learning plan belongs to a different student or tutor.');
   return saveLearningPlanSessionNote({...input,sessionId:session.id},ctx.req.user.id,{subject,db,req:ctx.req});
  }
  if(existing?.metadata_json?.documentationMode==='learning_plan_checklist')throw fail(409,'Use the learning-plan checklist to update this session note.');
  if(typeof input.summary!=='string'||input.summary.length>20000)throw fail(400,'Write a session note of up to 20,000 characters.');
  const body={summary:input.summary,status:'saved',generalSupport:!session.student_subject_id};
  if(input.howItWent!==undefined){if(typeof input.howItWent!=='string'||input.howItWent.length>20000)throw fail(400,'Keep How it went within 20,000 characters.');body.howItWent={text:input.howItWent};}
  if(input.goalIds!==undefined){await validateSessionGoals(ctx, session, input.goalIds, db);body.metadata={...(existing?.metadata_json||{}),goalIds:[...new Set(input.goalIds)]};}
  for(const field of ['strengthsObserved','challengesObserved','nextSteps','homework']){if(input[field]!==undefined){if(typeof input[field]!=='string'||input[field].length>20000)throw fail(400,'Keep each session note field within 20,000 characters.');body[field]=input[field];}}
  const note=existing?await TutoringSessionNote.update(existing.id,body,ctx.req.user.id,db):await TutoringSessionNote.create({...body,agencyId:ctx.appointment.agencyId,clientId:ctx.clientId,studentSubjectId:session.student_subject_id||null,sessionId:session.id,sessionType:String(ctx.appointment.modality).toUpperCase()==='IN_PERSON'?'in_person':'virtual'},ctx.req.user.id,db);
  await audit(ctx,session,'tutoring_session_note_saved',{noteId:note.id},db);
  const publication=input.signAndShare===true?await publishTutoringNote(ctx,session,note,input,db):null;
  if(publication)await audit(ctx,session,'tutoring_summary_signed_shared',{noteId:note.id,publicationId:publication.id},db);
  return {note:publication?{...note,status:'signed'}:note,publication};
 });
 if (input?.signAndShare && result.publication && (result.publication.newPublication || result.note?.metadata_json?.summaryNoticeRequested)) {
  try { result.summaryNotices = await (await import('./tutoringSummaryNotice.service.js')).notifyTutoringSummary(ctx,result.publication); }
  catch { result.summaryNoticePending = true; }
 }
 return result;
}

export async function prepareBookedTutoringHub(ctx){
 if(!ctx.host)throw fail(403,'Only the assigned tutor can prepare this Session Hub.');
 return transact(async db=>{await lockAppointment(ctx,db);if(terminal.has(ctx.appointment.status)||ctx.appointment.status==='no_show_pending')throw fail(409,'This appointment has an attendance outcome. Its saved history remains available.');const session=await prepareSession(ctx,db,{workspaceOnly:true});return {sessionId:Number(session.id)};});
}
export async function startBookedInPersonTutoring(ctx){
 if(!ctx.host)throw fail(403,'Only the assigned tutor can start this session.');
 if(String(ctx.appointment.modality).toUpperCase()!=='IN_PERSON')throw fail(409,'Open the virtual session and admit its participant.');
 return transact(async db=>{await lockAppointment(ctx,db);if(terminal.has(ctx.appointment.status)||ctx.appointment.status==='no_show_pending'||ctx.appointment.status==='completed')throw fail(409,'This appointment already has an attendance outcome.');const session=await prepareSession(ctx,db,{workspaceOnly:true});if(session.actual_ended_at||session.status==='ended')throw fail(409,'This session has already ended.');await db.execute("UPDATE learning_class_sessions SET status='live',actual_started_at=COALESCE(actual_started_at,UTC_TIMESTAMP()),started_by_user_id=COALESCE(started_by_user_id,?) WHERE id=?",[ctx.req.user.id,session.id]);await db.execute("UPDATE appointments SET status='in_progress',updated_by_user_id=? WHERE id=?",[ctx.req.user.id,ctx.appointment.id]);await audit(ctx,session,'tutoring_in_person_started',{},db);return {sessionId:Number(session.id)};});
}
export async function tutoringBoardMaterials(ctx){
 if(!ctx.host)throw fail(403,'Only the assigned tutor can select prepared materials.');
 const session=await linkedSession(ctx);
 if(!session)return {materials:[]};
 const [rows]=await pool.execute("SELECT id,title FROM learning_class_session_materials WHERE session_id=? AND storage_path IS NOT NULL AND material_type IN ('document_template','session_pdf','user_document') ORDER BY position_index,id",[session.id]);
 return {materials:rows};
}
export async function tutoringJoinLink(ctx){
 const agency=await Agency.findById(ctx.appointment.agencyId);
 if(ctx.hubV2){
  const {issueTutoringGuestLink}=await import('./tutoringGuest.service.js');
  if(!ctx.host)return {url:await issueTutoringGuestLink(ctx.appointment,ctx.clientId,ctx.req.user.id)};
  const recipientId=Number(ctx.req.query?.recipientUserId);
  if(recipientId){const url=await issueTutoringGuestLink(ctx.appointment,ctx.clientId,recipientId);if(!url)throw fail(409,'This appointment does not use a native tutoring room.');return {url};}
  const [people]=await pool.execute('SELECT DISTINCT u.id,u.first_name,u.last_name FROM client_guardians g JOIN users u ON u.id=g.guardian_user_id WHERE g.client_id=? AND g.access_enabled=1 AND u.is_active=1 AND u.is_archived=0',[ctx.clientId]);
  const recipients=[];
  for(const person of people){try{const {authorizedAppointmentClient}=await import('./guardianAppointments.service.js');const {guardianContextAllowsAppointment}=await import('./clientServiceEnrollment.service.js');const {tutoringInvitationAllowed}=await import('../utils/tutoringGuestPermissions.js');const access=await authorizedAppointmentClient(person.id,ctx.clientId,{agencyId:ctx.appointment.agencyId,serviceId:ctx.appointment.learningContext?.serviceEnrollmentId});if(tutoringInvitationAllowed(access,ctx.appointment,guardianContextAllowsAppointment))recipients.push({id:person.id,name:[person.first_name,person.last_name].filter(Boolean).join(' ')});}catch(e){if(![403,404].includes(e.status))throw e;}}
  return {recipients};
 }
 const query=new URLSearchParams({clientId:ctx.clientId,agencyId:ctx.appointment.agencyId});
 if(ctx.appointment.learningContext?.serviceEnrollmentId)query.set('serviceId',ctx.appointment.learningContext.serviceEnrollmentId);
 return {url:buildPublicAppUrl(agency,`tutoring/appointment/${ctx.appointment.id}?${query}`)};
}

export async function tutoringBoardDraft(ctx,input){
 if(!ctx.host||terminal.has(ctx.appointment.status)||ctx.appointment.status==='completed')throw fail(403,'Open an active tutoring appointment as its assigned tutor.');
 return draftBoardQuestion(ctx,await bookedTutoringLearningContext(ctx),input);
}
export async function tutoringLessonReview(ctx,input){
 if(!ctx.host)throw fail(403,'Only the assigned tutor may rate a learning activity.');
 return transact(async db=>{
  await lockAppointment(ctx,db);
  if(terminal.has(ctx.appointment.status))throw fail(409,'This appointment has an attendance outcome.');
  const session=await linkedSession(ctx,db,true);
  if(!session?.actual_started_at)throw fail(409,'Open the attended session first.');
  const note=await TutoringSessionNote.findBySession(session.id,db);
  if(note?.status==='signed')throw fail(409,'This session record is signed.');
  const subject=await resolveTutoringTrack(ctx.appointment,ctx.clientId,session.student_subject_id);
  const scope={kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,role:'provider',actor:ctx.actor,req:ctx.req,
    closedLessonReview:!!session.actual_ended_at,recordBoardReview:(conn,p,id)=>recordLessonReview(ctx,session,subject,conn,p,id)};
  return workspace.appendWorkspace(scope,{type:'board_review',requestId:input.requestId,payload:{targetId:input.targetId,rating:input.rating}},db);
 });
}
export async function tutoringLessonRecord(ctx){
 if(!ctx.host)throw fail(403,'The session activity record is private to the assigned tutor.');
 const session=await linkedSession(ctx);
 if(!session)return {items:[],strokes:0};
 const data=await lessonActivity(ctx,session,pool);
 const subject=await resolveTutoringTrack(ctx.appointment,ctx.clientId,session.student_subject_id);
 const evidence=subject?await AcademicSkillEvidence.listBySubject(subject.id):[];
 data.progress=boardSkillProgress(evidence.filter(row=>Number(row.client_id)===ctx.clientId&&Number(row.agency_id)===Number(ctx.appointment.agencyId)));
 await audit(ctx,session,'tutoring_lesson_activity_read',{activityCount:data.items.length},pool);
 return data;
}
export async function bookedTutoringLearningContext(ctx) {
 if(!ctx.host)throw fail(403,'Learning-session documentation is private to the assigned tutor.');
 const session=await linkedSession(ctx);
 const note=session?await TutoringSessionNote.findBySession(session.id):null;
 if(note&&(Number(note.client_id)!==ctx.clientId||Number(note.agency_id)!==Number(ctx.appointment.agencyId)))throw fail(409,'This note requires a record-link review. Its contents were kept.');
 const subject=await resolveTutoringTrack(ctx.appointment,ctx.clientId,session?.student_subject_id);
 const subjects=subject?[subject]:[];
 const tracks=[];
 for (const subject of subjects) {
  const plans = await StudentLearningPlan.listBySubject(subject.id);
  const active = plans.find(plan => plan.status === 'active' && plan.approved_at);
  const draft = plans.find(plan => ['draft','pending_review','active'].includes(plan.status) && !plan.approved_at);
  tracks.push({subject, bundle:active ? await StudentLearningPlan.getPlanBundle(active.id) : null,
   draftTitle:draft?.title || null});
 }
 const savedBrief=session?await TutoringSessionBrief.findBySession(session.id):null;
 const brief=savedBrief&&Number(savedBrief.client_id)===ctx.clientId&&Number(savedBrief.agency_id)===Number(ctx.appointment.agencyId)?savedBrief:null;
 return {appointmentId:ctx.appointment.id,clientId:ctx.clientId,tracks,note,brief,...await getLearningOverview(ctx.clientId,{agencyId:ctx.appointment.agencyId,providerId:ctx.appointment.providerUserId,subjectIds:subjects.map(s=>Number(s.id))})};
}
