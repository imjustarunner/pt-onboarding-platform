import PhoneNumber from '../models/PhoneNumber.model.js';
import { resolveAppointmentServiceSetting } from './appointmentServiceSetting.service.js';
import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Appointment from '../models/Appointment.model.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const context = (agencyId, appointmentId) => `guardian-appointment:${agencyId}:${appointmentId}`;
export function validateGuardianAppointmentRequest(input) {
  if (!['cancel', 'reschedule'].includes(input.type)) throw fail('Choose cancellation or rescheduling.');
  const reason = String(input.reason || '').trim();
  if (!reason || reason.length > 2000) throw fail('Please give a reason, up to 2,000 characters.');
  return { type: input.type, reason };
}
async function authorizedClient(userId, clientId) {
  const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId: userId, requiredClinicalScope: 'session_frequency' });
  const client = clients.find(c => Number(c.client_id) === Number(clientId) && !ClientGuardian.isNoView(c.permissions_json));
  if (!client) throw fail('Appointment access is not authorized for this child. Contact the care team.', 403);
  return client;
}
export async function appointmentRequests(appointmentId, db = pool) {
  const [rows] = await db.execute(`SELECT r.*,CONCAT_WS(' ',u.first_name,u.last_name) AS requestedBy,CONCAT_WS(' ',d.first_name,d.last_name) AS decidedBy FROM guardian_appointment_requests r JOIN users u ON u.id=r.requested_by_user_id LEFT JOIN users d ON d.id=r.decided_by_user_id WHERE r.appointment_id=? ORDER BY r.id DESC`, [appointmentId]);
  return rows.map(row => ({ id: row.id, clientId: row.client_id, type: row.request_type, status: row.status, requestedBy: row.requestedBy, decidedBy: row.decidedBy, createdAt: row.created_at, decidedAt: row.decided_at,
    reason: decryptFamilyBilling(row.reason_encrypted, context(row.agency_id, appointmentId))?.reason || '',
    decisionReason: row.decision_reason_encrypted ? decryptFamilyBilling(row.decision_reason_encrypted, context(row.agency_id, appointmentId))?.reason || '' : '' }));
}
export async function listGuardianAppointments({ userId, clientId }) {
  const client = await authorizedClient(userId, clientId);
  const [rows] = await pool.execute(`SELECT DISTINCT a.agency_id AS agencyId,a.service_location_id AS serviceLocationId,a.office_event_id AS officeEventId,a.clinical_session_id AS clinicalSessionId,a.id,a.start_at AS startAt,a.end_at AS endAt,a.status,a.modality,a.source_timezone AS timeZone,a.cancellation_reason AS cancellationReason,CONCAT_WS(' ',p.first_name,p.last_name) AS providerName,CONCAT_WS(' ',u.first_name,u.last_name) AS canceledBy FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=? LEFT JOIN users p ON p.id=a.provider_user_id LEFT JOIN users u ON u.id=a.canceled_by_user_id WHERE a.agency_id=? AND a.status<>'draft' AND a.start_at>=DATE_SUB(NOW(),INTERVAL 1 YEAR) ORDER BY a.start_at DESC LIMIT 200`, [clientId, client.agency_id]);
  for (const row of rows) {
    row.requests = (await appointmentRequests(row.id)).filter(r => Number(r.clientId) === Number(clientId));
    row.serviceSetting = await resolveAppointmentServiceSetting(row);
  }
  return rows;
}
export async function requestGuardianAppointmentChange({ userId, clientId, appointmentId, ...input }) {
  const request = validateGuardianAppointmentRequest(input);
  const client = await authorizedClient(userId, clientId);
  const encrypted = encryptFamilyBilling({ reason: request.reason }, context(client.agency_id, appointmentId));
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[appointment]] = await db.execute('SELECT id,status,start_at,provider_user_id FROM appointments WHERE id=? AND agency_id=? FOR UPDATE', [appointmentId, client.agency_id]);
    const [[participant]] = await db.execute('SELECT id FROM appointment_participants WHERE appointment_id=? AND client_id=?', [appointmentId, clientId]);
    if (!appointment || !participant) throw fail('Appointment not found.', 404);
    if (!appointment.provider_user_id) throw fail('The care team must assign a provider before a change can be requested.', 409);
    if (!['scheduled', 'confirmed', 'client_confirmed'].includes(appointment.status)) throw fail('This appointment can no longer receive a change request.', 409);
    const [[pending]] = await db.execute("SELECT id FROM guardian_appointment_requests WHERE appointment_id=? AND client_id=? AND status='pending'", [appointmentId, clientId]);
    if (pending) throw fail('A change request is already waiting for the provider’s approval.', 409);
    await db.execute('INSERT INTO guardian_appointment_requests (agency_id,appointment_id,client_id,requested_by_user_id,request_type,reason_encrypted) VALUES (?,?,?,?,?,?)', [client.agency_id, appointmentId, clientId, userId, request.type, encrypted]);
    await db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source) VALUES ('public_appointment_request_received','info','Guardian appointment change needs approval',?, ?,?,'appointment',?,?,'guardian_portal')`, [
      'A guardian requested an appointment change. Open the appointment to review the shared request and reason.', appointment.provider_user_id, client.agency_id, appointmentId, userId
    ]);
    // Keep the reserved appointment and its reminders until the provider decides.
    await db.commit();
    return { pending: true };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
export async function requireAppointmentRequestProvider(appointmentId, userId, { onlyPending = false } = {}) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw fail('Appointment not found.', 404);
  if (onlyPending) {
    const [[pending]] = await pool.execute("SELECT id FROM guardian_appointment_requests WHERE appointment_id=? AND status='pending' LIMIT 1", [appointmentId]);
    if (!pending) return appointment;
  }
  if (Number(appointment.providerUserId) !== Number(userId)) throw fail('The assigned provider must approve or decline this guardian’s request.', 403);
  return appointment;
}
export async function declineGuardianAppointmentRequest({ appointmentId, requestId, userId, reason }) {
  const appointment = await requireAppointmentRequestProvider(appointmentId, userId);
  const clean = validateGuardianAppointmentRequest({ type: 'cancel', reason }).reason;
  const [result] = await pool.execute("UPDATE guardian_appointment_requests SET status='declined',decided_by_user_id=?,decided_at=NOW(),decision_reason_encrypted=? WHERE id=? AND appointment_id=? AND status='pending'", [userId, encryptFamilyBilling({ reason: clean }, context(appointment.agencyId, appointmentId)), requestId, appointmentId]);
  if (!result.affectedRows) throw fail('This request has already been decided.', 409);
  return { declined: true };
}
export async function recordGuardianAppointmentApproval(appointmentId, userId) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment || Number(appointment.providerUserId) !== Number(userId)) return;
  if (!['canceled_by_provider','canceled_by_client','canceled_by_guardian','late_canceled','rescheduled'].includes(appointment.status)) return;
  await pool.execute("UPDATE guardian_appointment_requests SET status='approved',decided_by_user_id=?,decided_at=NOW() WHERE appointment_id=? AND status='pending'", [userId, appointmentId]);
}

export async function guardianReminderPreferences({ userId, clientId, input = null }) {
  const client = await authorizedClient(userId, clientId);
  const { getClientPreferences, putClientPreferences } = await import('./sessionNotification.service.js');
  if (!input) {
    const preferences = await getClientPreferences(client.agency_id, clientId, userId);
    if (preferences.isDefault) {
      const { latestIntakeCommunicationChoices, INTAKE_COMMUNICATION_VERSION } = await import('./intakeCommunicationChoices.service.js');
      const cp = await latestIntakeCommunicationChoices(clientId, client.agency_id);
      const guardians = await ClientGuardian.listForClient(clientId);
      const ownPhone = guardians.find(g => Number(g.guardian_user_id) === Number(userId))?.phone;
      const ownsChoice = Number(cp?.guardianUserId) === Number(userId) || (ownPhone && cp?.recipientPhone
        && PhoneNumber.normalizePhone(ownPhone) === PhoneNumber.normalizePhone(cp.recipientPhone));
      if (cp?.version === INTAKE_COMMUNICATION_VERSION && ownsChoice) {
        preferences.channels.email = cp.emailPreference !== 'no';
        preferences.channels.sms = cp.smsPreference === 'scheduling_only';
      }
    }
    return preferences;
  }
  // An account holder changes only their own reminder preferences. No campaign
  // enrollment, phone reassignment, or another guardian's preferences is implied.
  const clean = {
    channels: { in_app: true, email: input.channels?.email !== false, sms: input.channels?.sms === true, phone: false },
    optionalRemindersEnabled: input.optionalRemindersEnabled !== false,
    confirmationRequestsEnabled: input.confirmationRequestsEnabled !== false,
    providerPushedUpdatesEnabled: input.providerPushedUpdatesEnabled !== false,
    schedulingChangesEnabled: input.schedulingChangesEnabled !== false
  };
  return putClientPreferences(client.agency_id, clientId, clean, userId);
}
