import crypto from 'node:crypto';
import pool from '../config/database.js';
import Video from './vonageVideo.service.js';
import * as clinical from './clinicalVideo.service.js';
import {counselingClient} from './counselingInvitationAccess.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const canceled=status=>['canceled','cancelled','completed','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','no_show','rescheduled','voided','draft'].includes(String(status).toLowerCase());
export async function officeSchedule(room,{from,to}={},req) {
 const start=new Date(from),end=new Date(to);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>48*3600000)throw fail(400,'Choose one day for your office schedule.');
 const [rows]=await pool.execute(`SELECT a.id,a.title,a.start_at,a.end_at,a.modality,a.business_type,a.status,
  (SELECT s.id FROM counseling_sessions s WHERE s.appointment_id=a.id AND s.agency_id=a.agency_id AND s.provider_user_id=a.provider_user_id ORDER BY s.id DESC LIMIT 1) counseling_session_id
  FROM appointments a WHERE a.agency_id=? AND a.provider_user_id=? AND a.start_at<? AND a.end_at>? ORDER BY a.start_at LIMIT 200`,[room.agencyId,room.userId,end,start]);
 const [arrivals]=await pool.execute(`SELECT s.id,s.appointment_id,s.status,COUNT(v.id) waiting_count FROM counseling_sessions s
  LEFT JOIN counseling_session_visits v ON v.session_id=s.id AND v.status='waiting' AND v.last_seen_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)
  WHERE s.agency_id=? AND s.provider_user_id=? GROUP BY s.id`,[room.agencyId,room.userId]);
 const [participants]=await pool.execute(`SELECT DISTINCT p.appointment_id,c.id,c.full_name,c.initials FROM appointment_participants p
  JOIN appointments a ON a.id=p.appointment_id JOIN clients c ON c.id=p.client_id
  WHERE a.agency_id=? AND a.provider_user_id=? AND a.start_at<? AND a.end_at>?
   AND (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=TRUE))`,[room.agencyId,room.userId,end,start,room.agencyId,room.agencyId]);
 const [standalone]=await pool.execute(`SELECT id,title,status,started_at,created_at FROM counseling_sessions
  WHERE agency_id=? AND provider_user_id=? AND appointment_id IS NULL AND COALESCE(started_at,created_at)>=? AND COALESCE(started_at,created_at)<? ORDER BY created_at LIMIT 100`,[room.agencyId,room.userId,start,end]);
 const [learning]=await pool.execute(`SELECT s.id,s.title,s.description,s.status,s.starts_at,s.ends_at FROM learning_class_sessions s
  JOIN learning_program_classes c ON c.id=s.learning_class_id
  WHERE c.organization_id=? AND s.provider_user_id=? AND s.delivery_context='virtual'
   AND s.starts_at>=? AND s.starts_at<? ORDER BY s.starts_at LIMIT 100`,[room.agencyId,room.userId,start,end]);
 const items=rows.filter(a=>String(a.modality).toUpperCase()==='TELEHEALTH'&&(!a.business_type||['mental_health','healthcare'].includes(a.business_type))).map(a=>({key:`appointment-${a.id}`,appointmentId:a.id,sessionId:a.counseling_session_id,title:a.title||'Scheduled session',startAt:a.start_at,endAt:a.end_at,status:a.status,
  canOpen:!canceled(a.status)&&String(a.modality).toUpperCase()==='TELEHEALTH'&&(!a.business_type||['mental_health','healthcare'].includes(a.business_type)),kind:a.business_type||'mental_health',modality:a.modality}));
 for(const s of standalone)items.push({key:`session-${s.id}`,sessionId:s.id,title:s.title||'Counseling session',startAt:s.started_at||s.created_at,status:s.status,canOpen:s.status!=='ended',kind:'mental_health',modality:'TELEHEALTH'});
 for(const item of items){const arrival=arrivals.find(a=>Number(a.id)===Number(item.sessionId));item.waitingCount=Number(arrival?.waiting_count)||0;if(arrival?.status==='ended'){item.status='ended';item.canOpen=false;}item.participants=participants.filter(p=>Number(p.appointment_id)===Number(item.appointmentId)).map(p=>({id:Number(p.id),displayName:p.full_name||p.initials||'Client'}));}
 for(const s of learning)items.push({key:`learning-${s.id}`,type:'meeting',title:s.title||'Tutoring session',details:s.description||'',startAt:s.starts_at,endAt:s.ends_at,status:s.status,canOpen:!['ended','cancelled'].includes(s.status),kind:'tutoring',url:`/tutoring-session/${s.id}`});
 items.sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));
 await clinicalAudit({kind:'office',sessionId:room.id,agencyId:room.agencyId,role:'provider',req},'clinical_office_schedule_read',{count:items.length});
 return {items};
}
export async function officeEncounterLink(roomId,generation,db=pool) {
 const [[link]]=await db.execute('SELECT * FROM virtual_office_encounters WHERE room_id=? AND generation=?',[roomId,generation]);return link||null;
}
export async function scheduledParticipants(sessionId,agencyId,db=pool) {
 const [rows]=await db.execute(`SELECT DISTINCT c.id,c.initials,c.full_name FROM counseling_sessions s
  JOIN appointments a ON a.id=s.appointment_id AND a.agency_id=s.agency_id
  JOIN appointment_participants p ON p.appointment_id=a.id JOIN clients c ON c.id=p.client_id
  WHERE s.id=? AND s.agency_id=? AND (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=TRUE))`,[sessionId,agencyId,agencyId,agencyId]);
 if(!rows.length){const [[session]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? AND agency_id=?',[sessionId,agencyId]);if(session&&!session.appointment_id){try{rows.push(await counselingClient(session,db));}catch(e){if(e.status!==409)throw e;}}}
 return rows.map(c=>({id:Number(c.id),displayName:c.full_name||c.initials||'Client'}));
}
// Caller holds the office row. The appointment row serializes creation with other
// office requests. A named lock also coordinates the existing invitation endpoint.
export async function openScheduledOffice(db,room,office,{appointmentId,sessionId,req}) {
 if((appointmentId&&!validId(appointmentId))||(sessionId&&!validId(sessionId)))throw fail(400,'Choose a scheduled session.');
 let appointment,session;
 if(appointmentId) {
  [[appointment]]=await db.execute('SELECT * FROM appointments WHERE id=? AND agency_id=? AND provider_user_id=? FOR UPDATE',[appointmentId,room.agencyId,room.userId]);
  if(!appointment)throw fail(404,'Appointment not found in your office.');
  if(canceled(appointment.status)||String(appointment.modality).toUpperCase()!=='TELEHEALTH'||(appointment.business_type&&!['mental_health','healthcare'].includes(appointment.business_type)))throw fail(409,'Choose an available virtual clinical appointment.');
  [[session]]=await db.execute('SELECT * FROM counseling_sessions WHERE appointment_id=? AND agency_id=? AND provider_user_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE',[appointmentId,room.agencyId,room.userId]);
 } else {
  [[session]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? AND agency_id=? AND provider_user_id=? FOR UPDATE',[sessionId,room.agencyId,room.userId]);
  if(!session)throw fail(404,'Session not found in your office.');
  if(session.appointment_id) {
   [[appointment]]=await db.execute('SELECT * FROM appointments WHERE id=? AND agency_id=? AND provider_user_id=?',[session.appointment_id,room.agencyId,room.userId]);
   if(!appointment||canceled(appointment.status)||String(appointment.modality).toUpperCase()!=='TELEHEALTH'||(appointment.business_type&&!['mental_health','healthcare'].includes(appointment.business_type)))throw fail(409,'This appointment is not available in the clinical office.');
  }
 }
 if(session?.status==='ended')throw fail(409,'This scheduled session has ended. Choose your next appointment or open an unscheduled visit.');
 const current=office.video_session_id?await clinical.clinicalMedia(office.video_session_id,db,true):null;
 if(current?.state==='ending')throw fail(409,'Finish disconnecting the current visit before opening another.');
 if(current?.state==='active'&&current.session_kind==='counseling'&&Number(current.session_id)!==Number(session?.id))throw fail(409,'End the current session before opening another appointment.');
 let adoptEmptyOffice=false;
 if(current?.state==='active'&&current.session_kind==='office') {
  const [[used]]=await db.execute(`SELECT
   (SELECT COUNT(*) FROM private_virtual_office_visits WHERE room_id=? AND generation=?) visits,
   (SELECT COUNT(*) FROM clinical_video_grants WHERE media_id=? AND participant_role='client') clients,
   (SELECT COUNT(*) FROM therapy_session_artifacts WHERE session_kind='office' AND session_id=? AND generation=?) artifacts`,[room.id,office.generation,current.media_id,room.id,office.generation]);
  if(Number(used.visits)||Number(used.clients)||Number(used.artifacts)||session?.vonage_session_id)throw fail(409,'End the current visit before opening this scheduled session.');
  adoptEmptyOffice=true;
 }
 if(!session) {
  const [result]=await db.execute(`INSERT INTO counseling_sessions (agency_id,provider_user_id,appointment_id,status,title,guest_invite_token,public_id)
   VALUES (?,?,?,'scheduled',?,?,?)`,[room.agencyId,room.userId,appointment.id,appointment.title||'Scheduled session',crypto.randomBytes(24).toString('hex'),crypto.randomUUID()]);
  session={id:result.insertId,appointment_id:appointment.id,agency_id:room.agencyId};
 }
 let mediaId=session.vonage_session_id;
 if(adoptEmptyOffice) {
  mediaId=current.media_id;
  await db.execute("UPDATE clinical_video_sessions SET session_kind='counseling',session_id=?,generation=0 WHERE media_id=?",[session.id,mediaId]);
  await clinicalAudit({kind:'counseling',sessionId:session.id,agencyId:room.agencyId,role:'provider',req},'clinical_empty_office_assigned',{roomId:room.id,generation:office.generation},db);
 } else if(!mediaId) {
  clinical.requireClinicalVideoMonitoring();mediaId=await Video.createSession();
  await clinical.registerClinicalMedia(mediaId,{kind:'counseling',sessionId:session.id,agencyId:room.agencyId,req},db);
 } else await clinical.requireActiveClinicalMedia(mediaId,db);
 const generation=current?.state==='active'?Number(office.generation):Number(office.generation)+1;
 await db.execute(`UPDATE counseling_sessions SET vonage_session_id=?,vonage_application_id=?,status='active' WHERE id=?`,[mediaId,process.env.VONAGE_APPLICATION_ID,session.id]);
 await db.execute('UPDATE private_virtual_office_sessions SET video_session_id=?,generation=? WHERE room_id=?',[mediaId,generation,room.id]);
 await db.execute(`INSERT INTO virtual_office_encounters (room_id,generation,counseling_session_id,appointment_id,agency_id,linked_by_user_id)
  VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE counseling_session_id=counseling_session_id`,[room.id,generation,session.id,session.appointment_id||null,room.agencyId,room.userId]);
 const link=await officeEncounterLink(room.id,generation,db);
 if(Number(link?.counseling_session_id)!==Number(session.id))throw fail(409,'This office visit is already linked to another session.');
 await clinicalAudit({kind:'counseling',sessionId:session.id,agencyId:room.agencyId,role:'provider',req},'clinical_office_session_opened',{roomId:room.id,generation,appointmentId:session.appointment_id||null},db);
 return mediaId;
}
export async function markOfficeAttendance(sessionId,db=pool) {
 await db.execute('UPDATE virtual_office_encounters SET attendance_version=attendance_version+1 WHERE counseling_session_id=?',[sessionId]);
}
