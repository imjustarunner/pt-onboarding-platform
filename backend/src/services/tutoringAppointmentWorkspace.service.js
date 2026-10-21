// Called inside the office transaction, after the provider/agency/roster checks.
// The appointment row serializes the bridge with other entry points.
export async function ensureTutoringAppointmentWorkspace(room, visit, db) {
  if (!visit.tutoringAppointmentId) return visit;
  const id = visit.tutoringAppointmentId;
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
      (learning_class_id,title,mode,session_subtype,delivery_context,starts_at,ends_at,provider_user_id,created_by_user_id)
      VALUES (?,?,?,'tutoring','virtual',?,?,?,?)`, [classId, visit.title || 'Tutoring appointment', visit.participants.length===1?'individual':'group', visit.starts_at, visit.ends_at, room.userId, room.userId]);
    sessionId = created.insertId;
    for (const student of visit.participants) {
      await db.execute('INSERT INTO tutoring_session_clients(session_id,client_id) VALUES (?,?)', [sessionId, student.id]);
    }
  }
  const [students] = await db.execute('SELECT client_id FROM tutoring_session_clients WHERE session_id=? ORDER BY client_id', [sessionId]);
  const actual = students.map(s => Number(s.client_id)).sort((a,b)=>a-b);
  const expected = visit.participants.map(s => s.id).sort((a,b)=>a-b);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Object.assign(new Error('The learning visit has a different student roster. Review the appointment before opening it.'), { status: 409 });
  const [[session]] = await db.execute('SELECT s.status,s.provider_user_id,c.organization_id FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id WHERE s.id=?', [sessionId]);
  if(!session || Number(session.provider_user_id)!==Number(room.userId) || Number(session.organization_id)!==Number(room.agencyId) || !['scheduled','live'].includes(session.status)) throw Object.assign(new Error('This learning visit is no longer available in this office.'), {status:409});
  await db.execute("UPDATE learning_class_sessions SET starts_at=?,ends_at=? WHERE id=? AND status='scheduled'",[visit.starts_at,visit.ends_at,sessionId]);
  if(!existing)await db.execute('INSERT INTO tutoring_appointment_sessions(appointment_id,session_id) VALUES (?,?)', [id, sessionId]);
  return { ...visit, learningSessionId: Number(sessionId) };
}
