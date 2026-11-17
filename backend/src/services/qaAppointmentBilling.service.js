import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { isNluTutoringQaAgency } from '../utils/nluTutoringQaPolicy.js';
import { createReceivable } from './familyLedger/receivables.js';
import { transaction } from './familyLedger/policy.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { qaPaymentSimulationConfig } from './qaPaymentSimulator.service.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';
import { auditBilling } from './familyBillingPolicy.service.js';
import { billingCalendarDate } from './familyLedger/policy.js';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

async function enabled(appointment) {
  const agencyId = Number(appointment?.agencyId);
  if (![450,453,454].includes(agencyId)) return false;
  const [[agency]] = await pool.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?', [agencyId]);
  return agencyId === 450 ? isAuricwellQaAgency(agency)
    : isNluTutoringQaAgency(agency) && appointment.businessType === 'tutoring' && appointment.serviceCode === 'TUTORING';
}


export async function requireQaOutcomeElapsed(appointment, outcome) {
  if (!['completed', 'no_show'].includes(outcome) || !await enabled(appointment)) return;
  const end = new Date(utcMysqlToIso(appointment.endAt) || appointment.endAt);
  if (!Number.isFinite(+end) || end > new Date()) throw Object.assign(new Error('The session must end before recording completion or no-show.'), { status: 409 });
}

// Keep booked policy terms immutable. This pilot never changes an older signature.
export async function recordQaAttendanceTerms(appointment, policy, actorUserId) {
  if (!policy || !await enabled(appointment)) return;
  await transaction(async db => {
    await db.execute('SELECT id FROM appointments WHERE id=? AND agency_id=? FOR UPDATE', [appointment.id,appointment.agencyId]);
    const [existing] = await db.execute("SELECT id FROM appointment_communications WHERE appointment_id=? AND agency_id=? AND kind='attendance_terms' LIMIT 1", [appointment.id,appointment.agencyId]);
    if (existing.length) return;
    await db.execute(`INSERT INTO appointment_communications
      (appointment_id,agency_id,direction,channel,kind,body_preview,metadata_json,created_by_user_id)
      VALUES (?,?,'system','in_app','attendance_terms','Attendance policy retained at booking',?,?)`,
      [appointment.id, appointment.agencyId, JSON.stringify({ policy, recordedAt: new Date().toISOString(), syntheticOnly: true }), actorUserId || null]);
  });
}

export async function qaAttendancePolicy(appointment) {
  if (!await enabled(appointment)) return null;
  const [rows] = await pool.execute("SELECT metadata_json FROM appointment_communications WHERE appointment_id=? AND agency_id=? AND kind='attendance_terms' ORDER BY id LIMIT 1", [appointment.id,appointment.agencyId]);
  return rows[0] ? parse(rows[0].metadata_json)?.policy || null : null;
}

// The normal ledger supplies payer scope, auditing and source idempotency.
// Every demo balance is held for review: this path cannot collect money.
export async function syncQaAppointmentBalance(appointment, actorUserId, { repair = false } = {}) {
  if (!await enabled(appointment)) return null;
  const billing = await Appointment.getBilling(appointment.id);
  const tutoring = appointment.businessType === 'tutoring';
  if (!(tutoring ? ['self_pay','self_pay_only'].includes(billing?.settlementMode) : billing?.settlementMode === 'self_pay_only')
      || appointment.packageEntitlementId || ['package_consumed','free_rebook','waived','paid'].includes(billing?.paymentStatus)) return null;
  const outcome = String(appointment.status || '').toLowerCase();
  let amountCents;
  if (['completed', 'no_show'].includes(outcome)) {
    const end = new Date(utcMysqlToIso(appointment.endAt) || appointment.endAt);
    if (!Number.isFinite(+end) || end > new Date()) throw Object.assign(new Error('Complete the synthetic session before posting its outcome balance.'), { status: 409 });
    // A missed visit posts only its assessed outcome fee. The booked service
    // price is not a no-show charge, including while payer/policy review holds it.
    amountCents = Number(outcome === 'no_show' ? appointment.cancellationFeeCents || 0 : billing.amountCents || 0);
  } else if (['late_canceled', 'canceled_by_client', 'canceled_by_provider', 'canceled'].includes(outcome)) {
    amountCents = Number(appointment.cancellationFeeCents || 0);
  } else return null;
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error('Invalid synthetic appointment amount');
  if (!amountCents) return null;
  const participants = await Appointment.listParticipants(appointment.id);
  const clientId = participants.find(p => p.isBillingResponsible && p.clientId)?.clientId || participants.find(p => p.clientId)?.clientId;
  if (!clientId) throw new Error('Synthetic appointment needs a billing client');
  let tutoringLabel='General tutoring';
  if(tutoring && /tutoring$/i.test(String(appointment.title||'')) && String(appointment.title).length<120)tutoringLabel=String(appointment.title).replace(/TUTORING/g,'Tutoring');
  else if(tutoring){const [subjects]=await pool.execute(`SELECT DISTINCT s.subject_label FROM tutoring_appointment_sessions b JOIN learning_class_sessions l ON l.id=b.session_id JOIN student_subjects s ON s.id=l.student_subject_id WHERE b.appointment_id=? AND s.client_id=? AND s.agency_id=?`,[appointment.id,clientId,appointment.agencyId]);if(subjects.length===1&&subjects[0].subject_label)tutoringLabel=`${subjects[0].subject_label} tutoring`;else{const [services]=await pool.execute("SELECT label FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind='tutoring' AND is_active=1",[clientId,appointment.agencyId,appointment.providerUserId]);if(services.length===1){const label=String(services[0].label||'').replace(/\s*tutoring\s*/ig,'').trim();if(label)tutoringLabel=`${label} tutoring`;}}}
  const label = outcome === 'no_show' ? 'Missed appointment' : outcome === 'completed' ? (tutoring ? tutoringLabel : 'Counseling session') : 'Late cancellation';
  const simulation=tutoring&&[453,454].includes(Number(appointment.agencyId))&&(await qaPaymentSimulationConfig(appointment.agencyId)).enabled;
  const serviceDate=billingCalendarDate(appointment.sourceTimezone||'America/Denver',new Date(utcMysqlToIso(appointment.startAt)||appointment.startAt));
  const payload={appointmentId:appointment.id,outcome,syntheticOnly:true,noCollection:!simulation,simulationOnly:simulation,policy:await qaAttendancePolicy(appointment)};
  if(repair&&simulation)await transaction(async db=>{
    const [[old]]=await db.execute("SELECT * FROM family_receivables WHERE agency_id=? AND source_type='qa_appointment' AND source_key=? FOR UPDATE",[appointment.agencyId,String(appointment.id)]);
    if(!old)return;
    if(Number(old.client_id)!==Number(clientId)||Number(old.amount_cents)!==amountCents)throw Object.assign(new Error('The existing balance differs. Review an audited adjustment instead.'),{status:409});
    const [payments]=await db.execute("SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id WHERE a.receivable_id=? LIMIT 1",[old.id]);
    if(payments.length||old.disputed_at||!['review','open'].includes(old.status))throw Object.assign(new Error('This balance already has payment or review activity. Preserve it for billing review.'),{status:409});
    const {qaTutoringSimulationAllowed}=await import('./qaAppointmentSimulation.service.js');
    if(!await qaTutoringSimulationAllowed({...old,service_domain:'tutoring'},db,payload))throw Object.assign(new Error('This appointment is not eligible for simulated payment.'),{status:409});
    const [shares]=await db.execute('SELECT payer_user_id FROM family_receivable_allocations WHERE receivable_id=?',[old.id]);
    const assigned=shares.length>0&&shares.every(s=>Number(s.payer_user_id)>0);
    await db.execute('UPDATE family_receivables SET service_domain=?,service_label=?,service_date=?,status=?,hold_reason=?,source_payload=? WHERE id=?',['tutoring',label,serviceDate,assigned?'open':'review',assigned?null:'payer_assignment',encryptFamilyBilling(payload,`receivable:${appointment.agencyId}:${clientId}`),old.id]);
    await auditBilling({agencyId:appointment.agencyId,clientId,userId:actorUserId,action:'qa_tutoring_balance_reconciled',objectId:old.id},db);
  });
  return createReceivable({ agencyId: appointment.agencyId, clientId, sourceType: 'qa_appointment', sourceKey: String(appointment.id),
    serviceDomain: tutoring ? 'tutoring' : 'mental_health', serviceLabel: label, serviceDate,
    amountCents, reviewRequired: !simulation, actorUserId, payload });
}
