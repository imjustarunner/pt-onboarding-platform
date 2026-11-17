import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { learningServiceMetadata } from './learningServiceCompensation.js';
import { requireQaOutcomeElapsed } from './qaAppointmentBilling.service.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';

const fail = message => Object.assign(new Error(message), {status:409});
// Only an explicit bridge with the same organization, provider and student may
// connect learning completion to a booked price/package. Never match by date.
export async function linkedTutoringBilling(session, db = pool) {
  const agencyId=Number(session?.organization_id||session?.agency_id||0),providerId=Number(session?.provider_user_id||0);
  if (!agencyId || !providerId || !Number(session?.id) || session.mode==='group'
      || String(learningServiceMetadata(session).learningServiceCode||'TUTORING').toUpperCase()!=='TUTORING') return null;
  const [links]=await db.execute('SELECT appointment_id FROM tutoring_appointment_sessions WHERE session_id=?',[Number(session.id)]);
  if (!links.length) return null;
  if (links.length!==1) throw fail('This learning visit has multiple appointment links. Ask Support to review billing.');
  const [rows]=await db.execute(`SELECT a.id,(SELECT client_id FROM tutoring_session_clients WHERE session_id=s.id LIMIT 1) AS client_id FROM tutoring_appointment_sessions link
    JOIN appointments a ON a.id=link.appointment_id
    JOIN learning_class_sessions s ON s.id=link.session_id
    JOIN learning_program_classes program ON program.id=s.learning_class_id
    WHERE link.session_id=? AND a.agency_id=? AND program.organization_id=a.agency_id
      AND a.provider_user_id=? AND s.provider_user_id=a.provider_user_id
      AND a.business_type='tutoring' AND a.service_code='TUTORING'
      AND (SELECT COUNT(*) FROM tutoring_session_clients r WHERE r.session_id=s.id)=1
      AND (SELECT COUNT(*) FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id IS NOT NULL)=1
      AND EXISTS(SELECT 1 FROM tutoring_session_clients r JOIN appointment_participants p
        ON p.appointment_id=a.id AND p.client_id=r.client_id WHERE r.session_id=s.id)`,[Number(session.id),agencyId,providerId]);
  if (rows.length!==1) throw fail('The appointment and learning visit have different organizations, providers or students. Ask Support to review billing.');
  const appointment=await Appointment.findById(rows[0].id);
  if (!appointment || Number(appointment.agencyId)!==agencyId || Number(appointment.providerUserId)!==providerId)
    throw fail('The linked appointment changed. Refresh before completing this learning visit.');
  return {appointment,clientId:Number(rows[0].client_id),billing:await Appointment.getBilling(appointment.id),noAutomaticPayment:[453,454].includes(agencyId)};
}

export async function requireLinkedTutoringCompletion(binding,session) {
  if (!binding) return;
  if (!session.actual_started_at) throw fail(session.status==='ended'
    ? 'This ended visit has no recorded start. Ask the office to review attendance and billing; the existing records were kept.'
    : 'Start this tutoring session before completing it. No new charge or package credit has been posted.');
  await requireQaOutcomeElapsed(binding.appointment,'completed');
}

export async function settleLinkedTutoringCompletion(binding,actorUserId) {
  if (!binding) return {};
  try {
    return await withClientSchedulingLock([binding.clientId],async()=>{
      const current=await Appointment.findById(binding.appointment.id);
      const clients=current?(await Appointment.listParticipants(current.id)).filter(p=>p.clientId).map(p=>Number(p.clientId)):[];
      if (!current || Number(current.agencyId)!==Number(binding.appointment.agencyId)
          || Number(current.providerUserId)!==Number(binding.appointment.providerUserId)
          || current.businessType!=='tutoring' || current.serviceCode!=='TUTORING'
          || clients.length!==1 || clients[0]!==binding.clientId
          || !['scheduled','confirmed','client_confirmed','in_progress','completed'].includes(current.status))
        return {billingWarning:'This appointment was canceled or changed. Billing needs office review; no completion charge was posted.'};
      const {settleAppointment}=await import('./appointment.service.js');
      const result=await settleAppointment(binding.appointment.id,{outcome:'completed',actorUserId});
      return {billingSettlement:result?.settlement||null};
    });
  } catch(error) {
    return {billingWarning:`Session ended; billing needs office review: ${error.message}`};
  }
}
