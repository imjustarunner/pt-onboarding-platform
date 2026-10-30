import pool from '../config/database.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';

// Appointment students belong to a session, not to the provider's reusable class.
export async function listLearningSessionStudents(session, { db = pool, listClassMembers = LearningProgramClass.listClientMembers } = {}) {
  const sessionId = Number(session?.id), classId = Number(session?.learning_class_id), agencyId = Number(session?.organization_id);
  if (![sessionId, classId, agencyId].every(value => Number.isSafeInteger(value) && value > 0)) return [];
  const [[scope]] = await db.execute(`SELECT c.class_code,
      EXISTS(SELECT 1 FROM tutoring_appointment_sessions link WHERE link.session_id=s.id) AS has_appointment,
      EXISTS(SELECT 1 FROM tutoring_session_clients roster WHERE roster.session_id=s.id) AS has_session_roster
    FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id
    WHERE s.id=? AND c.id=? AND c.organization_id=?`, [sessionId, classId, agencyId]);
  if (!scope) return [];
  const isSessionRoster = Number(scope.has_appointment) === 1 || Number(scope.has_session_roster) === 1 || String(scope.class_code || '').startsWith('private_tutoring_');
  if (!isSessionRoster) return (await listClassMembers(classId) || []).filter(row => String(row.membership_status || '').toLowerCase() !== 'removed');
  const [students] = await db.execute(`SELECT DISTINCT c.id AS client_id,c.full_name AS client_name,c.initials AS client_initials,'active' AS membership_status
    FROM tutoring_session_clients roster JOIN clients c ON c.id=roster.client_id
    WHERE roster.session_id=? AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments assignment
      WHERE assignment.client_id=c.id AND assignment.agency_id=? AND assignment.is_active=1))
    ORDER BY c.full_name,c.initials,c.id`, [sessionId, agencyId, agencyId]);
  return students || [];
}
