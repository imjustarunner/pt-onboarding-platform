import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';
import Appointment from '../models/Appointment.model.js';
import ClinicalRecordRef from '../models/ClinicalRecordRef.model.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { attachAppointmentChangeNotes } from './appointmentChangeNote.service.js';

const parse = (v) => typeof v === 'string' ? JSON.parse(v) : v;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
export async function assertWaiverReviewAccess(user, agencyId) {
  if (!(await hasSchedulingBillingAccess(user, agencyId))) fail('Billing access is required to review fee and package waivers', 403);
}
export async function queueAppointmentWaiver({ appointmentId, agencyId, facts, actorUserId }, db = pool) {
  if (facts.waiver?.action !== 'recommend') return;
  await db.execute(
    `INSERT INTO appointment_change_waivers (appointment_id, agency_id, requested_by_user_id, request_reason, request_comment)
     VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE appointment_id = VALUES(appointment_id)`,
    [appointmentId, agencyId, actorUserId, String(facts.waiver.reason || '').slice(0, 1000), facts.waiver.comment || null]);
}
export async function getAppointmentWaiver(appointmentId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM appointment_change_waivers WHERE appointment_id = ?', [appointmentId]);
  return rows[0] ? { ...rows[0], adjustment: parse(rows[0].adjustment_json), adjustment_json: undefined } : null;
}
export async function listAppointmentWaivers({ agencyId, user, offset = 0 }) {
  await assertWaiverReviewAccess(user, agencyId);
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const [rows] = await pool.execute(
    `SELECT w.*, a.title, a.start_at, a.source_timezone,
       CONCAT_WS(' ', c.first_name, c.last_name) AS client_name,
       CONCAT_WS(' ', u.first_name, u.last_name) AS requested_by_name
     FROM appointment_change_waivers w JOIN appointments a ON a.id = w.appointment_id
     JOIN appointment_change_workflows f ON f.appointment_id = w.appointment_id
     LEFT JOIN clients c ON c.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(f.preview_json, '$.appointment.clientId')) AS UNSIGNED)
     LEFT JOIN users u ON u.id = w.requested_by_user_id
     WHERE w.agency_id = ? AND f.status = 'completed' AND w.status IN ('pending', 'documenting')
     ORDER BY w.created_at, w.appointment_id LIMIT 51 OFFSET ${start}`, [agencyId]);
  return { reviews: rows.slice(0, 50).map((r) => ({ ...r, adjustment: parse(r.adjustment_json), adjustment_json: undefined })), hasMore: rows.length > 50 };
}

async function restorePractitionerCredit(conn, appointment, preview, actorUserId) {
  const entitlementId = preview.packageBalance?.entitlementId;
  const [entitlements] = await conn.execute(
    `SELECT * FROM practitioner_client_package_entitlements WHERE id = ? AND agency_id = ? AND client_id = ? FOR UPDATE`,
    [entitlementId, appointment.agencyId, preview.appointment.clientId]);
  if (!entitlements[0]) fail('The original package entitlement could not be found');
  const [ledger] = await conn.execute(
    `SELECT * FROM practitioner_session_credit_ledger WHERE entitlement_id = ? AND agency_id = ?
     AND provider_schedule_event_id = ? ORDER BY id`, [entitlementId, appointment.agencyId, appointment.providerScheduleEventId]);
  const original = ledger.find((r) => ['FREE_REBOOK', 'MISSED_FORFEIT', 'MISSED_FEE'].includes(r.reason_code));
  if (!original) fail('The original missed-session ledger entry could not be found');
  const restored = ledger.find((r) => r.reason_code === 'MISSED_WAIVER_RESTORE');
  const kind = original.reason_code === 'FREE_REBOOK' ? 'free_miss' : original.reason_code === 'MISSED_FORFEIT' ? 'paid' : 'fee';
  if (!restored) {
    if (kind === 'free_miss') await conn.execute('UPDATE practitioner_client_package_entitlements SET free_rebooks_remaining = free_rebooks_remaining + 1 WHERE id = ?', [entitlementId]);
    if (kind === 'paid') await conn.execute("UPDATE practitioner_client_package_entitlements SET sessions_remaining = sessions_remaining + 1, status = CASE WHEN status = 'EXHAUSTED' THEN 'ACTIVE' ELSE status END WHERE id = ?", [entitlementId]);
    await conn.execute(
      `INSERT INTO practitioner_session_credit_ledger (agency_id, client_id, package_id, packet_id, entitlement_id,
       provider_schedule_event_id, direction, quantity, reason_code, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'CREDIT', ?, 'MISSED_WAIVER_RESTORE', ?, ?)`,
      [appointment.agencyId, original.client_id, original.package_id, original.packet_id, entitlementId,
        appointment.providerScheduleEventId, kind === 'paid' ? 1 : 0, JSON.stringify({ originalLedgerId: original.id, creditBucket: kind }), actorUserId]);
  }
  return { creditBucket: kind };
}

export async function decideAppointmentWaiver({ appointmentId, user, decision, reason }) {
  if (!['approved', 'denied'].includes(decision)) fail('Choose approve or deny', 400);
  if (String(reason || '').trim().length > 1000) fail('Keep the decision reason within 1000 characters', 400);
  if (!String(reason || '').trim()) fail('A decision reason is required', 400);
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) fail('Appointment not found', 404);
  await assertWaiverReviewAccess(user, appointment.agencyId);
  const conn = await pool.getConnection();
  let locked = false, inTransaction = false;
  try {
    const [locks] = await conn.execute('SELECT GET_LOCK(?, 10) AS acquired', [`appointment_change:${appointmentId}`]);
    locked = Number(locks[0]?.acquired) === 1;
    if (!locked) fail('This appointment is being updated. Try again.');
    await conn.beginTransaction(); inTransaction = true;
    const [workflows] = await conn.execute("SELECT * FROM appointment_change_workflows WHERE appointment_id = ? AND status = 'completed'", [appointmentId]);
    const [requests] = await conn.execute('SELECT * FROM appointment_change_waivers WHERE appointment_id = ? FOR UPDATE', [appointmentId]);
    let review = requests[0];
    if (!workflows[0] || !review) fail('A signed appointment change with a waiver request is required');
    if (review.decision && review.decision !== decision) fail('This waiver already has a different decision');
    if (review.status === 'pending') {
      const preview = parse(workflows[0].preview_json);
      let adjustment = null;
      if (decision === 'approved') {
        if (appointment.packageEntitlementId && preview.consequence?.model === 'package') {
          const restored = await BookingPackage.applyAppointmentUsage({ entitlementId: appointment.packageEntitlementId,
            agencyId: appointment.agencyId, appointmentId, mode: 'restore_missed', actorUserId: user.id, connection: conn });
          adjustment = { creditBucket: restored.appliedUsage?.creditBucket || 'paid', packageEntitlementId: restored.id };
        } else if (preview.packageBalance?.source === 'practitioner_package') {
          adjustment = await restorePractitionerCredit(conn, appointment, preview, user.id);
        }
        if (preview.consequence?.model === 'fee') {
          const [billingRows] = await conn.execute('SELECT * FROM appointment_billing WHERE appointment_id = ? FOR UPDATE', [appointmentId]);
          const billing = billingRows[0];
          if (billing && !['fee_pending', 'waived'].includes(billing.payment_status)) {
            fail('This fee has entered payment or invoicing. Resolve its refund or credit in billing before approving the waiver.');
          }
          if (!billing) fail('The original missed-appointment fee could not be found');
          adjustment = { ...adjustment, waivedFeeCents: Number(billing.amount_cents || 0) };
          await conn.execute("UPDATE appointment_billing SET amount_cents = 0, payment_status = 'waived' WHERE appointment_id = ?", [appointmentId]);
        }
        await conn.execute('UPDATE appointments SET cancellation_fee_cents = 0 WHERE id = ?', [appointmentId]);
      }
      const decidedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const effect = decision === 'denied' ? 'The original consequence remains in place.'
        : adjustment?.creditBucket === 'free_miss' ? 'The free-miss allowance was restored.'
          : adjustment?.creditBucket === 'bonus' ? 'One bonus session credit was restored.'
            : adjustment?.creditBucket === 'paid' ? 'One paid session credit was restored.' : 'The missed-appointment fee was waived.';
      const addendum = `Waiver ${decision}. Reason: ${String(reason).trim()}. ${effect} The original signed appointment-change note is preserved. No service was rendered and no insurance claim is created.`;
      await conn.execute(
        `UPDATE appointment_change_waivers SET status = 'documenting', decision = ?, decision_reason = ?,
         decided_by_user_id = ?, decided_at = ?, adjustment_json = ?, addendum = ? WHERE appointment_id = ?`,
        [decision, String(reason).trim().slice(0, 1000), user.id, decidedAt, JSON.stringify(adjustment), addendum, appointmentId]);
      review = { ...review, status: 'documenting', decision, decision_reason: reason, decided_by_user_id: user.id, decided_at: decidedAt, addendum };
    }
    await conn.commit(); inTransaction = false;
    if (review.status === 'documenting') {
      const notes = await attachAppointmentChangeNotes({ appointment, narrative: review.addendum, kind: 'waiver',
        eventType: parse(workflows[0].facts_json).eventType, actorUserId: review.decided_by_user_id, signedAt: review.decided_at });
      if (appointment.officeEventId) for (const note of notes) await ClinicalRecordRef.upsert({ agencyId: appointment.agencyId,
        clientId: note.clientId, officeEventId: appointment.officeEventId, clinicalSessionId: note.clinicalSessionId, recordType: 'note', clinicalRecordId: note.id });
      await conn.execute('UPDATE appointment_change_waivers SET status = ? WHERE appointment_id = ?', [review.decision, appointmentId]);
    }
    return getAppointmentWaiver(appointmentId, conn);
  } catch (error) {
    if (inTransaction) await conn.rollback();
    throw error;
  } finally {
    try { if (locked) await conn.execute('SELECT RELEASE_LOCK(?)', [`appointment_change:${appointmentId}`]); }
    finally { conn.release(); }
  }
}
