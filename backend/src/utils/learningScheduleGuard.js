import {appointmentScheduleChanged} from './appointmentOutcomeGuard.js';
import {isLearningAppointment} from './appointmentPresentation.js';
export async function hasLearningAttendanceEvidence(db,appointmentId){
 const [[row]]=await db.execute(`SELECT EXISTS(SELECT 1 FROM tutoring_appointment_sessions b JOIN learning_class_sessions s ON s.id=b.session_id WHERE b.appointment_id=? AND (s.actual_started_at IS NOT NULL OR s.actual_ended_at IS NOT NULL)) AS attendance_started, EXISTS(SELECT 1 FROM tutoring_note_publications p WHERE p.appointment_id=?) AS note_signed`,[appointmentId,appointmentId]);
 return !!(Number(row?.attendance_started)||Number(row?.note_signed));
}
export async function assertLearningScheduleEditable(db,appointment,patch){
 if(!isLearningAppointment(appointment))return;
 if(!appointmentScheduleChanged(appointment,patch))return;
 if(await hasLearningAttendanceEvidence(db,appointment.id))throw Object.assign(new Error('This session has recorded attendance or a signed summary. Its schedule is read-only. Open its Session Hub to review the record, or book a new appointment.'),{status:409,code:'ATTENDED_SESSION_LOCKED'});
}
