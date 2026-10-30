import pool from '../config/database.js';
import staffTools from './appointmentStaffTools.service.js';
import { canOpenInPersonLearning, selectedLearningServiceCode } from './learningServiceCompensation.js';
import { ensureTutoringAppointmentWorkspace } from './tutoringAppointmentWorkspace.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

const fail = (status,message) => Object.assign(new Error(message),{status});
export function createInPersonLearningWorkspace({ db = pool, authorize = staffTools.authorize, bridge = ensureTutoringAppointmentWorkspace } = {}) {
  return async function open(user, appointmentId) {
    const appointment = await authorize(user, appointmentId);
    if (!canOpenInPersonLearning(appointment,user.id)) throw fail(403,'Only the assigned tutor may open an available in-person learning appointment.');
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[visit]] = await conn.execute(`SELECT a.*,a.start_at AS starts_at,a.end_at AS ends_at,
        COALESCE(NULLIF(a.service_code,''),service.service_code) AS learning_service_code
        FROM appointments a LEFT JOIN tenant_services service ON service.id=a.tenant_service_id AND service.agency_id=a.agency_id
        WHERE a.id=? AND a.agency_id=? AND a.provider_user_id=? FOR UPDATE`,[appointment.id,appointment.agencyId,user.id]);
      if (!visit || !canOpenInPersonLearning(visit,user.id)) throw fail(409,'The appointment changed. Reload it before opening the learning session.');
      const start=parseUtcDate(visit.starts_at),end=parseUtcDate(visit.ends_at);
      if (!start || !end || +end<=+start) throw fail(409,'Set the appointment time before opening the learning session.');
      visit.learning_service_code = selectedLearningServiceCode(visit.learning_service_code);
      const [participants] = await conn.execute(`SELECT DISTINCT c.id FROM appointment_participants p JOIN clients c ON c.id=p.client_id
        WHERE p.appointment_id=? AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`,[appointment.id,appointment.agencyId,appointment.agencyId]);
      if (!participants.length || (visit.learning_service_code==='HOMEWORK HELP' && participants.length!==1)) throw fail(409,'Confirm the student roster before opening this learning session. Homework Help requires one student.');
      if (visit.status==='completed') {
        const [[existing]]=await conn.execute('SELECT session_id FROM tutoring_appointment_sessions WHERE appointment_id=?',[appointment.id]);
        if (!existing) throw fail(409,'This completed appointment has no linked learning session. Review its records rather than creating new service time.');
      }
      const linked=await bridge({agencyId:appointment.agencyId,userId:user.id},{...visit,tutoringAppointmentId:appointment.id,participants:participants.map(p=>({id:Number(p.id)}))},conn,{allowEnded:true});
      await conn.commit();
      return {sessionId:linked.learningSessionId,destination:`/in-person-tutoring-session/${linked.learningSessionId}`};
    } catch(error) { await conn.rollback();throw error; } finally { conn.release(); }
  };
}
export default createInPersonLearningWorkspace();
