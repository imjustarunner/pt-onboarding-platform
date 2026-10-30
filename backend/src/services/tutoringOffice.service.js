import pool from '../config/database.js';
import { clinicalMedia } from './clinicalVideo.service.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import {ensureTutoringAppointmentWorkspace} from './tutoringAppointmentWorkspace.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const terminal = new Set(['ended','completed','cancelled','canceled','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','no_show','rescheduled','voided','draft']);
const virtual = value => ['virtual','online','telehealth','video'].includes(String(value || '').toLowerCase());
export function validateTutoringVisit(session, room) {
  if (!session || Number(session.agency_id) !== Number(room.agencyId) || Number(session.provider_user_id) !== Number(room.userId)) throw fail(404, 'Tutoring appointment not found in this office.');
  if (!virtual(session.modality) || terminal.has(String(session.status).toLowerCase())) throw fail(409, 'Choose an available virtual tutoring appointment.');
  if (!parseUtcDate(session.starts_at) || !parseUtcDate(session.ends_at) || +parseUtcDate(session.ends_at)<=+parseUtcDate(session.starts_at)) throw fail(409, 'Set the appointment time before opening this tutoring visit.');
  return session;
}

export async function tutoringVisit(room, { learningSessionId, tutoringAppointmentId }, db = pool) {
  if (!!learningSessionId === !!tutoringAppointmentId) throw fail(400, 'Choose one tutoring appointment.');
  const id = Number(learningSessionId || tutoringAppointmentId);
  if (!Number.isSafeInteger(id) || id < 1) throw fail(400, 'Choose a valid tutoring appointment.');
  let session, participants;
  if (learningSessionId) {
    [[session]] = await db.execute(`SELECT s.id,s.title,s.status,s.starts_at,s.ends_at,s.provider_user_id,s.student_subject_id,
      s.delivery_context AS modality,s.session_subtype,s.mode,c.organization_id AS agency_id FROM learning_class_sessions s
      JOIN learning_program_classes c ON c.id=s.learning_class_id WHERE s.id=? AND c.organization_id=? AND s.provider_user_id=?`, [id, room.agencyId, room.userId]);
    validateTutoringVisit(session, room);
    if(session.session_subtype!=='tutoring'&&session.mode!=='individual')throw fail(409,'Use the class room for this group class.');
    [participants] = await db.execute(`SELECT DISTINCT c.id,c.full_name,c.initials,c.grade,c.is_demo FROM learning_class_sessions s
      JOIN tutoring_session_clients m ON m.session_id=s.id
      JOIN clients c ON c.id=m.client_id WHERE s.id=? AND (c.agency_id=? OR EXISTS
      (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`, [id, room.agencyId, room.agencyId]);
  } else {
    [[session]] = await db.execute(`SELECT a.id,a.title,a.status,a.start_at AS starts_at,a.end_at AS ends_at,a.provider_user_id,a.modality,a.agency_id,
      COALESCE(NULLIF(a.service_code,''),t.service_code) AS learning_service_code
      FROM appointments a LEFT JOIN tenant_services t ON t.id=a.tenant_service_id AND t.agency_id=a.agency_id
      WHERE a.id=? AND a.agency_id=? AND a.provider_user_id=? AND a.business_type IN ('learning','tutoring')`, [id, room.agencyId, room.userId]);
    validateTutoringVisit(session, room);
    [participants] = await db.execute(`SELECT DISTINCT c.id,c.full_name,c.initials,c.grade,c.is_demo FROM appointment_participants p
      JOIN clients c ON c.id=p.client_id WHERE p.appointment_id=? AND (c.agency_id=? OR EXISTS
      (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`, [id, room.agencyId, room.agencyId]);
  }
  if (room.demoAccess && participants.some(c=>Number(c.is_demo)!==1)) throw fail(403,'Demo offices can only open fictional student visits.');
  if (!participants.length) throw fail(409, 'Assign the student to this appointment before opening their visit.');
  if (session.mode==='individual' && participants.length!==1) throw fail(409, 'Review the student assigned to this individual visit before opening it.');
  return { ...session, kind:'tutoring', learningSessionId:learningSessionId ? id : null, tutoringAppointmentId:tutoringAppointmentId ? id : null,
    participants:participants.map(c => ({ id:Number(c.id), displayName:c.full_name || c.initials || 'Student', grade:c.grade })) };
}

export async function tutoringOfficeLink(room, generation, db = pool) {
  const [[row]] = await db.execute('SELECT * FROM tutoring_office_encounters WHERE room_id=? AND generation=? AND agency_id=?', [room.id, generation, room.agencyId]);
  return row || null;
}

export async function assignedTutoringStudents(room,db=pool){
 const [students]=await db.execute(`SELECT DISTINCT c.id,c.full_name,c.initials,c.grade,c.is_demo FROM clients c
  WHERE (c.agency_id=? OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))
  AND (EXISTS(SELECT 1 FROM client_service_enrollments e WHERE e.client_id=c.id AND e.agency_id=? AND e.provider_user_id=? AND e.service_kind='tutoring' AND e.is_active=1)
   OR EXISTS(SELECT 1 FROM student_subjects s WHERE s.client_id=c.id AND s.agency_id=? AND s.primary_tutor_user_id=? AND s.status NOT IN ('completed','discharged','archived')))
  ORDER BY c.full_name,c.id`,[room.agencyId,room.agencyId,room.agencyId,room.userId,room.agencyId,room.userId]);
 return students.filter(c=>!room.demoAccess||Number(c.is_demo)===1).map(c=>({id:Number(c.id),displayName:c.full_name||c.initials||'Student',grade:c.grade}));
}

export async function officeTutoringContext(room,office,db=pool){
 const link=await tutoringOfficeLink(room,office.generation,db);
 if(!link)return null;
 if(link.learning_session_id||link.appointment_id)return tutoringVisit(room,link.learning_session_id?{learningSessionId:link.learning_session_id}:{tutoringAppointmentId:link.appointment_id},db);
 const [visits]=await db.execute('SELECT DISTINCT tutoring_client_id FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND tutoring_client_id IS NOT NULL AND admitted_at IS NOT NULL',[room.id,office.generation]);
 const students=await assignedTutoringStudents(room,db);
 return {kind:'tutoring',manualBinder:true,title:'Student learning binder',participants:students.filter(s=>visits.some(v=>Number(v.tutoring_client_id)===s.id))};
}

export async function attachTutoringBinder(room,office,{clientId,visitId,confirmIdentity},db,req){
 if(confirmIdentity!==true)throw fail(400,'Confirm which admitted student this binder belongs to.');
 const media=office.video_session_id?await clinicalMedia(office.video_session_id,db,true):null;
 if(media?.state!=='active'||media.session_kind!=='office')throw fail(409,'Open your office and admit the student first.');
 const students=await assignedTutoringStudents(room,db);
 if(!students.some(s=>s.id===Number(clientId)))throw fail(403,'Choose a student assigned to you for tutoring with this agency.');
 const [visits]=await db.execute('SELECT id,tutoring_client_id,status FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND admitted_at IS NOT NULL FOR UPDATE',[room.id,office.generation]);
 const guest=visits.find(v=>Number(v.id)===Number(visitId)&&v.status==='admitted');
 if(!guest)throw fail(409,'Choose a student currently admitted to your office.');
 if(visits.some(v=>v.tutoring_client_id&&Number(v.tutoring_client_id)!==Number(clientId)))throw fail(409,'End this visit before opening a different student’s binder.');
 const existing=await officeTutoringContext(room,office,db);
 if(existing&&!existing.participants.some(s=>s.id===Number(clientId)))throw fail(409,'This office visit is already linked to a different student.');
 if(existing&&!existing.manualBinder)return existing;
 await db.execute('UPDATE private_virtual_office_visits SET tutoring_client_id=? WHERE id=?',[clientId,guest.id]);
 await db.execute('INSERT IGNORE INTO tutoring_office_encounters(room_id,generation,agency_id) VALUES(?,?,?)',[room.id,office.generation,room.agencyId]);
 await clinicalAudit({kind:'office',sessionId:room.id,generation:office.generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`,req},'tutoring_binder_opened',{clientId:Number(clientId),visitId:guest.id},db);
 return {kind:'tutoring',manualBinder:true,title:'Student learning binder',participants:students.filter(s=>s.id===Number(clientId))};
}

// The caller holds the office row lock, the same lock used by admission and end.
export async function prepareTutoringOffice(room, office, options, db) {
  const visit = await tutoringVisit(room, options, db);
  const media = office.video_session_id ? await clinicalMedia(office.video_session_id, db, true) : null;
  const existing = await tutoringOfficeLink(room, office.generation, db);
  if (media?.state === 'ending') throw fail(409, 'Wait for the previous visit to finish disconnecting.');
  if (media?.state === 'active') {
    if (media.session_kind !== 'office') throw fail(409, 'End the current session before loading another student.');
    if (existing) {
      const sameVisit=visit.tutoringAppointmentId?Number(existing.appointment_id)===visit.tutoringAppointmentId:Number(existing.learning_session_id)===visit.learningSessionId;
      if (!sameVisit) throw fail(409, 'End the current visit before loading another student.');
      return ensureTutoringAppointmentWorkspace(room,visit,db);
    }
    const [[used]] = await db.execute(`SELECT
      (SELECT COUNT(*) FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND admitted_at IS NOT NULL) visits,
      (SELECT COUNT(*) FROM therapy_session_artifacts WHERE session_kind='office' AND session_id=? AND generation=?) artifacts`, [room.id, office.generation, room.id, office.generation]);
    if (Number(used.visits) || Number(used.artifacts)) throw fail(409, 'End the current visit before loading this student’s materials.');
  }
  return ensureTutoringAppointmentWorkspace(room,visit,db);
}

export async function linkTutoringOffice(room, generation, visit, db, req) {
  await db.execute(`INSERT INTO tutoring_office_encounters (room_id,generation,agency_id,learning_session_id,appointment_id)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE room_id=VALUES(room_id)`, [room.id,generation,room.agencyId,visit.learningSessionId,visit.tutoringAppointmentId]);
  await clinicalAudit({kind:'office',sessionId:room.id,generation,agencyId:room.agencyId,role:'provider',actor:`user-${room.userId}`,req}, 'tutoring_office_loaded', {learningSessionId:visit.learningSessionId,appointmentId:visit.tutoringAppointmentId}, db);
}

async function requireSameTutoringSession(room,office,guest,sameEncounter,db){
 const returning=!!guest.admitted_at&&Number(guest.generation)===Number(office.generation);
 if(returning)return;
 const [[prior]]=await db.execute('SELECT COUNT(*) total FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND admitted_at IS NOT NULL AND id<>?',[room.id,office.generation,guest.id]);
 if(Number(prior?.total)>0&&sameEncounter!==true)throw fail(409,'Confirm that this parent or other invited participant belongs to the current tutoring session, or end it before the next student.');
}

export async function confirmTutoringGuest(room, office, guest, {clientId,confirmIdentity,sameEncounter}, db) {
  const link = await tutoringOfficeLink(room, office.generation, db);
  if (!link) return false;
  if(!link.learning_session_id&&!link.appointment_id){
    const context=await officeTutoringContext(room,office,db);
    if(!confirmIdentity||!context.participants.some(s=>s.id===Number(clientId))||(guest.tutoring_client_id&&Number(guest.tutoring_client_id)!==Number(clientId)))throw fail(409,'Confirm the student for this binder before admission.');
    await requireSameTutoringSession(room,office,guest,sameEncounter,db);
    await db.execute('UPDATE private_virtual_office_visits SET tutoring_client_id=? WHERE id=?',[clientId,guest.id]);
    return true;
  }
  const visit = await tutoringVisit(room, link.learning_session_id?{learningSessionId:link.learning_session_id}:{tutoringAppointmentId:link.appointment_id}, db);
  if(link.appointment_id)await tutoringVisit(room,{tutoringAppointmentId:link.appointment_id},db);
  if (!confirmIdentity || !visit.participants.some(c => c.id === Number(clientId))) throw fail(409, 'Confirm the scheduled student’s identity before admitting them.');
  if (guest.tutoring_client_id && Number(guest.tutoring_client_id) !== Number(clientId)) throw fail(409, 'A returning visit must keep its originally confirmed student.');
  assertTutoringArrivalTime(visit);
  await requireSameTutoringSession(room,office,guest,sameEncounter,db);
  const [[others]] = await db.execute(`SELECT COUNT(*) total FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND admitted_at IS NOT NULL AND id<>? AND (tutoring_client_id IS NULL OR tutoring_client_id<>?)`, [room.id,office.generation,guest.id,clientId]);
  if (Number(others.total) && !sameEncounter) throw fail(409, 'Confirm that this student belongs to the same group tutoring visit.');
  await db.execute('UPDATE private_virtual_office_visits SET tutoring_client_id=? WHERE id=?', [clientId,guest.id]);
  if (link.learning_session_id) await db.execute("UPDATE learning_class_sessions SET status='live',actual_started_at=COALESCE(actual_started_at,UTC_TIMESTAMP()),started_by_user_id=COALESCE(started_by_user_id,?) WHERE id=? AND status='scheduled'", [room.userId,link.learning_session_id]);
  return true;
}

export async function tutoringOfficeDestination(session, actorId, db=pool) {
  if (!session?.provider_user_id || !virtual(session.delivery_context) || terminal.has(session.status) || (session.session_subtype!=='tutoring'&&session.mode!=='individual')) return null;
  const [[klass]] = await db.execute('SELECT organization_id FROM learning_program_classes WHERE id=?', [session.learning_class_id]);
  if (!klass) return null;
  const {officeForHost}=await import('./privateVirtualOffice.service.js');
  const {room}=await officeForHost(session.provider_user_id,klass.organization_id);
  return Number(actorId) === Number(session.provider_user_id)
    ? `/my-virtual-office?agencyId=${Number(klass.organization_id)}&learningSessionId=${Number(session.id)}`
    : `/join/my-room/${encodeURIComponent(room.slug)}`;
}

export function assertTutoringArrivalTime(visit,now=Date.now()){
 const start=parseUtcDate(visit.starts_at),end=parseUtcDate(visit.ends_at);
 if(!start||!end||+end<=+start)throw fail(409,'This appointment needs a valid scheduled time.');
 if(now<+start-30*60000)throw fail(409,'The student can enter 30 minutes before their scheduled appointment.');
 if(now>+end+30*60000)throw fail(409,'This appointment has passed. Update the schedule before admitting the student.');
}
export async function finishTutoringOffice(room,generation){
 const link=await tutoringOfficeLink(room,generation);
 if(!link?.learning_session_id)return;
 const [[attended]]=await pool.execute('SELECT id FROM private_virtual_office_visits WHERE room_id=? AND generation=? AND tutoring_client_id IS NOT NULL AND admitted_at IS NOT NULL LIMIT 1',[room.id,generation]);
 if(!attended)return; // Preparing an office alone is not a completed session.
 const {completeLearningSession}=await import('../controllers/learningClassSessions.controller.js');
 await completeLearningSession(Number(link.learning_session_id),room.userId);
 if(link.appointment_id)await pool.execute("UPDATE appointments SET status='completed',updated_by_user_id=? WHERE id=? AND agency_id=? AND provider_user_id=? AND business_type IN ('learning','tutoring') AND status IN ('scheduled','confirmed','client_confirmed','in_progress')",[room.userId,link.appointment_id,room.agencyId,room.userId]);
}
