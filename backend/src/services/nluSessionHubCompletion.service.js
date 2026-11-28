import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import LearningClassSession from '../models/LearningClassSession.model.js';
import { nluTutoringVideoChoice } from './nluTutoringVideoChoice.service.js';
import { learningServiceMetadata } from './learningServiceCompensation.js';
import { createTutoringPayrollDraft } from './tutoringPayroll.service.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';

const fail=()=>Object.assign(new Error('The Session Hub and its selected appointment service must match.'),{status:409});
// Activity tools never select a billing code or a tutoring pay schedule.
export async function finishNluHubActivities(ctx,sessionId) {
 if(!ctx.host||!await nluTutoringVideoChoice(ctx.appointment))throw fail();
 return withClientSchedulingLock([ctx.clientId],async()=>{
  const appointment=await Appointment.findById(ctx.appointment.id);
  const session=await LearningClassSession.findById(sessionId);
  const meta=learningServiceMetadata(session);
  const [bindings]=await pool.execute(`SELECT link.appointment_id FROM tutoring_appointment_sessions link
   JOIN tutoring_session_clients student ON student.session_id=link.session_id
   JOIN learning_class_sessions s ON s.id=link.session_id JOIN learning_program_classes c ON c.id=s.learning_class_id
   WHERE link.session_id=? AND student.client_id=? AND c.organization_id=? AND s.provider_user_id=?`,[sessionId,ctx.clientId,ctx.appointment.agencyId,ctx.appointment.providerUserId]);
  const participants=appointment?(await Appointment.listParticipants(appointment.id)).filter(p=>p.clientId):[];
  if(!appointment||!session||bindings.length!==1||Number(bindings[0].appointment_id)!==Number(appointment.id)
    ||participants.length!==1||Number(participants[0].clientId)!==Number(ctx.clientId)
    ||Number(appointment.agencyId)!==Number(ctx.appointment.agencyId)||Number(appointment.providerUserId)!==Number(ctx.req.user.id)
    ||meta.sessionHubActivitiesOnly!==true||String(meta.sourceServiceCode||'')!==String(appointment.serviceCode||'')
    ||String(meta.sourceBusinessType||'')!==String(appointment.businessType||'')||!session.actual_started_at||!session.actual_ended_at
    ||!parseUtcDate(session.actual_ended_at)||!parseUtcDate(session.actual_started_at)||+parseUtcDate(session.actual_ended_at)<=+parseUtcDate(session.actual_started_at)
    ||!['scheduled','confirmed','client_confirmed','in_progress','completed'].includes(appointment.status))throw fail();
  await LearningClassSession.completeOnce(sessionId,{endedAt:session.actual_ended_at,endedByUserId:ctx.req.user.id});
  const {settleAppointment}=await import('./appointment.service.js');
  const result=await settleAppointment(appointment.id,{outcome:'completed',actorUserId:ctx.req.user.id});
  // Homework Help already has its own learning compensation implementation.
  // Other services keep their original documentation/claim/payroll workflow.
  const payrollDraft=appointment.serviceCode==='HOMEWORK HELP'?await createTutoringPayrollDraft(sessionId,ctx.req.user.id):null;
  return {billingSettlement:result?.settlement||null,payrollDraft};
 });
}
