// Called inside the office transaction, after the provider/agency/roster checks.
// The appointment row serializes the bridge with other entry points.
import { selectedLearningServiceCode, learningServiceMetadata } from './learningServiceCompensation.js';

export async function ensureTutoringAppointmentWorkspace(room, visit, db, { allowEnded = false } = {}) {
  if (!visit.tutoringAppointmentId) return visit;
  const id = visit.tutoringAppointmentId;
  const serviceCode = selectedLearningServiceCode(visit.learning_service_code);
  const deliveryContext = String(visit.modality || '').toUpperCase() === 'IN_PERSON' ? 'in_person' : 'virtual';
  await db.execute('SELECT id FROM appointments WHERE id=? FOR UPDATE', [id]);
  const [[existing]] = await db.execute('SELECT session_id FROM tutoring_appointment_sessions WHERE appointment_id=?', [id]);

  // Reuse an explicitly linked public booking, never infer a link from time alone.
  const [[request]] = existing ? [[null]] : await db.execute(`SELECT s.id FROM public_appointment_requests r
    JOIN learning_class_sessions s ON s.id=r.linked_session_id
    JOIN learning_program_classes c ON c.id=s.learning_class_id
    JOIN appointments a ON a.office_event_id=r.linked_office_event_id AND a.id=?
    WHERE r.agency_id=? AND c.organization_id=? AND s.provider_user_id=?
      AND (s.session_subtype='tutoring' OR s.mode='individual') LIMIT 1`, [id, room.agencyId, room.agencyId, room.userId]);
  let sessionId = existing?.session_id || request?.id;
  if (!sessionId) {
    const code = `private_tutoring_${room.userId}`;
    const [[klass]] = await db.execute('SELECT id FROM learning_program_classes WHERE organization_id=? AND class_code=? AND is_active=1 LIMIT 1', [room.agencyId, code]);
    let classId = klass?.id;
    if (!classId) {
      const [created] = await db.execute(`INSERT INTO learning_program_classes
        (organization_id,class_name,class_code,delivery_mode,status,is_active,created_by_user_id)
        VALUES (?,'Private tutoring',?,'individual','active',1,?)`, [room.agencyId, code, room.userId]);
      classId = created.insertId;
    }
    const [created] = await db.execute(`INSERT INTO learning_class_sessions
      (learning_class_id,title,mode,session_subtype,delivery_context,starts_at,ends_at,provider_user_id,created_by_user_id,metadata_json)
      VALUES (?,?,?,'tutoring',?,?,?,?,?,?)`, [classId, visit.title || 'Tutoring appointment', visit.participants.length===1?'individual':'group', deliveryContext, visit.starts_at, visit.ends_at, room.userId, room.userId, JSON.stringify({ learningServiceCode: serviceCode })]);
    sessionId = created.insertId;
    for (const student of visit.participants) {
      await db.execute('INSERT INTO tutoring_session_clients(session_id,client_id) VALUES (?,?)', [sessionId, student.id]);
    }
  }
  const [students] = await db.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=? ORDER BY client_id', [sessionId]);
  const actual = students.map(s => Number(s.client_id)).sort((a,b)=>a-b);
  const expected = visit.participants.map(s => s.id).sort((a,b)=>a-b);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Object.assign(new Error('The learning visit has a different student roster. Review the appointment before opening it.'), { status: 409 });
  const [[session]] = await db.execute('SELECT s.status,s.provider_user_id,c.organization_id,s.metadata_json,s.delivery_context FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id WHERE s.id=?', [sessionId]);
  if(!session || Number(session.provider_user_id)!==Number(room.userId) || Number(session.organization_id)!==Number(room.agencyId) || !['scheduled','live',...(allowEnded?['ended']:[])].includes(session.status)) throw Object.assign(new Error('This learning visit is no longer available in this office.'), {status:409});
  const metadata = learningServiceMetadata(session);
  const existingContext = ['online','telehealth','video'].includes(String(session.delivery_context).toLowerCase()) ? 'virtual' : session.delivery_context;
  if (existingContext && existingContext !== deliveryContext) throw Object.assign(new Error('The appointment delivery format differs from its learning visit. Review the session before opening it.'), { status: 409 });
  if (metadata.learningServiceCode && selectedLearningServiceCode(metadata.learningServiceCode) !== serviceCode) throw Object.assign(new Error('The appointment service differs from its learning visit. Review the service before opening it.'), { status: 409 });
  if (!metadata.learningServiceCode && ['live','ended'].includes(session.status) && serviceCode !== 'TUTORING') throw Object.assign(new Error('A started tutoring visit cannot be relabeled Homework Help. Review the original service first.'), { status: 409 });
  if (session.status === 'ended') return { ...visit, learningSessionId: Number(sessionId) };
  const [presenters] = await db.execute("SELECT user_id FROM learning_class_session_participants WHERE session_id=? AND role='presenter'", [sessionId]);
  if (presenters.some(p => Number(p.user_id) !== Number(room.userId))) throw Object.assign(new Error('The learning visit has a different presenter. Review the tutor assignment before opening it.'), { status: 409 });
  // The checked appointment provider is also the learning presenter and payroll owner.
  if (!presenters.length) await db.execute(`INSERT INTO learning_class_session_participants (session_id,user_id,role)
    VALUES (?,?,'presenter') ON DUPLICATE KEY UPDATE role='presenter'`, [sessionId, room.userId]);
  if (!metadata.learningServiceCode) await db.execute('UPDATE learning_class_sessions SET metadata_json=? WHERE id=?', [JSON.stringify({ ...metadata, learningServiceCode: serviceCode }), sessionId]);
  await db.execute("UPDATE learning_class_sessions SET starts_at=?,ends_at=? WHERE id=? AND status='scheduled'",[visit.starts_at,visit.ends_at,sessionId]);
  if(!existing)await db.execute('INSERT INTO tutoring_appointment_sessions(appointment_id,session_id) VALUES (?,?)', [id, sessionId]);
  return { ...visit, learningSessionId: Number(sessionId) };
}
