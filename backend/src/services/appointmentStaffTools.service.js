import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import User from '../models/User.model.js';
import { canViewFullScheduleDetails, canManageOthersSchedule } from './scheduleSummaryPrivacy.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { canOpenInPersonLearning } from './learningServiceCompensation.js';

const APPOINTMENT_OPERATIONS_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'agency_admin', 'backoffice_admin', 'staff', 'support', 'scheduler', 'front_desk']);
const STAFF_ROLES = new Set([...APPOINTMENT_OPERATIONS_ROLES, 'super_admin', 'superadmin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant']);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function createAppointmentStaffTools({ db = pool, appointments = Appointment, users = User, clientAccess = resolveClientRecordAccess, encrypt = maybeEncryptNotePayload, decrypt = maybeDecryptNotePayload } = {}) {
  async function scheduleAccess(user, providerId, agencyId, write = false, appointmentOperations = false) {
    const role = String(user?.role || '').toLowerCase();
    if (!user?.id || !STAFF_ROLES.has(role)) fail(403, 'Staff schedule access is required');
    if (['super_admin', 'superadmin'].includes(role)) return;
    const agencies = await users.getAgencies(user.id);
    if (!(agencies || []).some(a => Number(a.id) === Number(agencyId))) fail(403, 'Agency access is required');
    if (Number(user.id) === Number(providerId)) return;
    // Existing appointment operations access is broader than full-calendar visibility.
    // Preserve it for bundle/timeline endpoints without exposing private alert storage.
    if (appointmentOperations && APPOINTMENT_OPERATIONS_ROLES.has(role)) return;
    if (write ? canManageOthersSchedule(role) : canViewFullScheduleDetails(role)) return;
    const actor = await users.findById(user.id);
    if (users.isSupervisor(actor) && await users.supervisorHasAccess(user.id, providerId, agencyId)) return;
    fail(403, 'Full schedule access is required for internal appointment alerts');
  }
  async function appointmentAccess(user, id, write = false, appointmentOperations = false) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) fail(400, 'A saved appointment is required');
    const appointment = await appointments.findById(Number(id));
    if (!appointment) fail(404, 'Appointment not found');
    await scheduleAccess(user, appointment.providerUserId, appointment.agencyId, write, appointmentOperations);
    return appointment;
  }
  const mapAlert = row => ({ text: row?.alert_text ? decrypt(row.alert_text) : '', revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null });
  async function get(user, id) {
    const appointment = await appointmentAccess(user, id);
    const [rows] = await db.execute('SELECT alert_text, revision, updated_at FROM appointment_staff_alerts WHERE appointment_id = ?', [appointment.id]);
    const participants = await appointments.listParticipants(appointment.id);
    const clients = [];
    for (const clientId of new Set(participants.map(p => Number(p.clientId)).filter(Boolean))) {
      const access = await clientAccess({ userId: user.id, role: user.role, clientId });
      if (access.ok) clients.push({ id: clientId, name: access.client.full_name || access.client.initials || `Client #${clientId}` });
    }
    let canEdit = true;
    try { await scheduleAccess(user, appointment.providerUserId, appointment.agencyId, true); } catch (error) { if (error.status !== 403) throw error; canEdit = false; }
    return { appointmentId: appointment.id, agencyId: appointment.agencyId, alert: mapAlert(rows[0]), canEdit, clients,
      canOpenLearningWorkspace: canOpenInPersonLearning(appointment,user.id) };
  }
  async function save(user, id, body) {
    const appointment = await appointmentAccess(user, id, true);
    if (typeof body?.text !== 'string' || body.text.length > 500) fail(400, 'Use at most 500 characters for the appointment alert');
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail(400, 'The current alert revision is required');
    const value = body.text.trim();
    const encrypted = value ? encrypt(value) : null;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // The appointment lock also serializes creation of the first alert row.
      await conn.execute('SELECT id FROM appointments WHERE id = ? FOR UPDATE', [appointment.id]);
      const [rows] = await conn.execute('SELECT revision FROM appointment_staff_alerts WHERE appointment_id = ? FOR UPDATE', [appointment.id]);
      const previous = Number(rows[0]?.revision || 0);
      if (previous !== body.revision) fail(409, 'Someone updated this alert. Reload it before saving your changes.');
      const revision = previous + 1;
      await conn.execute(`INSERT INTO appointment_staff_alerts (appointment_id, alert_text, revision, updated_by_user_id)
        VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE alert_text = VALUES(alert_text), revision = VALUES(revision), updated_by_user_id = VALUES(updated_by_user_id)`, [appointment.id, encrypted, revision, user.id]);
      await conn.execute('INSERT INTO appointment_staff_alert_events (appointment_id, revision, alert_text, actor_user_id) VALUES (?, ?, ?, ?)', [appointment.id, revision, encrypted, user.id]);
      await conn.commit();
      return { text: value, revision };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  async function list(user, { providerId, agencyId, windowStart, windowEnd }) {
    if (!Number.isSafeInteger(Number(providerId)) || Number(providerId) < 1 || !Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) fail(400, 'Provider and agency are required');
    const start = new Date(windowStart); const end = new Date(windowEnd);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end - start > 370 * 86400000) fail(400, 'A valid schedule window of at most one year is required');
    await scheduleAccess(user, Number(providerId), Number(agencyId));
    const [rows] = await db.execute(`SELECT a.id AS appointment_id, a.provider_schedule_event_id, a.office_event_id, s.alert_text, s.revision
      FROM appointments a JOIN appointment_staff_alerts s ON s.appointment_id = a.id
      WHERE a.agency_id = ? AND a.provider_user_id = ? AND a.start_at < ? AND a.end_at > ? AND s.alert_text IS NOT NULL`,
      [Number(agencyId), Number(providerId), end.toISOString().slice(0, 19).replace('T', ' '), start.toISOString().slice(0, 19).replace('T', ' ')]);
    return rows.map(row => ({ appointmentId: Number(row.appointment_id), providerScheduleEventId: Number(row.provider_schedule_event_id) || null, officeEventId: Number(row.office_event_id) || null, ...mapAlert(row) }));
  }
  return { get, save, list, authorize: (user, id) => appointmentAccess(user, id, false, true) };
}
export default createAppointmentStaffTools();
