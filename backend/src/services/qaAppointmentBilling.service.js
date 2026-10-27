import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { createReceivable } from './familyLedger/receivables.js';
import { transaction } from './familyLedger/policy.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

async function enabled(appointment) {
  if (Number(appointment?.agencyId) !== 450) return false;
  const [[agency]] = await pool.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450');
  return isAuricwellQaAgency(agency);
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
    await db.execute('SELECT id FROM appointments WHERE id=? AND agency_id=450 FOR UPDATE', [appointment.id]);
    const [existing] = await db.execute("SELECT id FROM appointment_communications WHERE appointment_id=? AND agency_id=450 AND kind='attendance_terms' LIMIT 1", [appointment.id]);
    if (existing.length) return;
    await db.execute(`INSERT INTO appointment_communications
      (appointment_id,agency_id,direction,channel,kind,body_preview,metadata_json,created_by_user_id)
      VALUES (?,450,'system','in_app','attendance_terms','Attendance policy retained at booking',?,?)`,
      [appointment.id, JSON.stringify({ policy, recordedAt: new Date().toISOString(), syntheticOnly: true }), actorUserId || null]);
  });
}

export async function qaAttendancePolicy(appointment) {
  if (!await enabled(appointment)) return null;
  const [rows] = await pool.execute("SELECT metadata_json FROM appointment_communications WHERE appointment_id=? AND agency_id=450 AND kind='attendance_terms' ORDER BY id LIMIT 1", [appointment.id]);
  return rows[0] ? parse(rows[0].metadata_json)?.policy || null : null;
}

// The normal ledger supplies payer scope, auditing and source idempotency.
// Every demo balance is held for review: this path cannot collect money.
export async function syncQaAppointmentBalance(appointment, actorUserId) {
  if (!await enabled(appointment)) return null;
  const billing = await Appointment.getBilling(appointment.id);
  if (billing?.settlementMode !== 'self_pay_only' || appointment.packageEntitlementId) return null;
  const outcome = String(appointment.status || '').toLowerCase();
  let amountCents;
  if (['completed', 'no_show'].includes(outcome)) {
    const end = new Date(utcMysqlToIso(appointment.endAt) || appointment.endAt);
    if (!Number.isFinite(+end) || end > new Date()) throw Object.assign(new Error('Complete the synthetic session before posting its outcome balance.'), { status: 409 });
    amountCents = Number(billing.amountCents || 0);
  } else if (['late_canceled', 'canceled_by_client', 'canceled_by_provider', 'canceled'].includes(outcome)) {
    amountCents = Number(appointment.cancellationFeeCents || 0);
  } else return null;
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error('Invalid synthetic appointment amount');
  if (!amountCents) return null;
  const participants = await Appointment.listParticipants(appointment.id);
  const clientId = participants.find(p => p.isBillingResponsible && p.clientId)?.clientId || participants.find(p => p.clientId)?.clientId;
  if (!clientId) throw new Error('Synthetic appointment needs a billing client');
  const label = outcome === 'no_show' ? 'Missed appointment' : outcome === 'completed' ? 'Counseling session' : 'Late cancellation';
  return createReceivable({ agencyId: 450, clientId, sourceType: 'qa_appointment', sourceKey: String(appointment.id),
    serviceDomain: 'mental_health', serviceLabel: label, serviceDate: String(utcMysqlToIso(appointment.startAt) || appointment.startAt).slice(0, 10),
    amountCents, reviewRequired: true, actorUserId,
    payload: { appointmentId: appointment.id, outcome, syntheticOnly: true, noCollection: true, policy: await qaAttendancePolicy(appointment) } });
}
