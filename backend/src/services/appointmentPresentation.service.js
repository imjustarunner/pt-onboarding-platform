import pool from '../config/database.js';
import { appointmentAttendanceView, isLearningAppointment } from '../utils/appointmentPresentation.js';

/** Resolve the display outcome without changing the appointment or attendance ledger. */
export async function resolveAppointmentPresentation(appointment, db = pool) {
  if (!isLearningAppointment(appointment)) return {};
  const [[session]] = await db.execute(
    `SELECT s.status,s.actual_started_at,s.actual_ended_at
       FROM tutoring_appointment_sessions b
       JOIN learning_class_sessions s ON s.id=b.session_id
       JOIN learning_program_classes c ON c.id=s.learning_class_id
      WHERE b.appointment_id=? AND c.organization_id=? AND s.provider_user_id=?`,
    [appointment.id, appointment.agencyId, appointment.providerUserId]
  );
  const { status, ...presentation } = appointmentAttendanceView(appointment, { learningSession: session });
  return { ...presentation, attendanceStatus: status };
}
