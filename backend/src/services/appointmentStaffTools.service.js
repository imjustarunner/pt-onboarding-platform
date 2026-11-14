import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import User from '../models/User.model.js';
import { canViewFullScheduleDetails, canManageOthersSchedule } from './scheduleSummaryPrivacy.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { listClientDiagnosisAlerts } from './clinicalDiagnosisPolicy.service.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { canOpenLearningWorkspace } from './learningServiceCompensation.js';
import {resolveAppointmentServiceSetting} from './appointmentServiceSetting.service.js';

const APPOINTMENT_OPERATIONS_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'agency_admin', 'backoffice_admin', 'staff', 'support', 'scheduler', 'front_desk']);
const STAFF_ROLES = new Set([...APPOINTMENT_OPERATIONS_ROLES, 'super_admin', 'superadmin', 'admin', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant', 'billing']);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function createAppointmentStaffTools({ db = pool, appointments = Appointment, users = User, clientAccess = resolveClientRecordAccess, encrypt = maybeEncryptNotePayload, decrypt = maybeDecryptNotePayload, billingAccess = hasSchedulingBillingAccess, diagnosisAlerts = listClientDiagnosisAlerts } = {}) {
  async function scheduleAccess(user, providerId, agencyId, write = false, appointmentOperations = false) {
    const role = String(user?.role || '').toLowerCase();
    if (!user?.id || !STAFF_ROLES.has(role)) fail(403, 'Staff schedule access is required');
    if (['super_admin', 'superadmin'].includes(role)) return;
    if (await billingAccess(user, agencyId)) return;
    const agencies = await users.getAgencies(user.id);
    if (!(agencies || []).some(a => Number(a.id) === Number(agencyId))) fail(403, 'Agency access is required');
    if (Number(user.id) === Number(providerId) || ['admin','agency_admin','backoffice_admin'].includes(role)) return;
    // Existing appointment operations access is broader than full-calendar visibility.
    // Preserve it for bundle/timeline endpoints without exposing private alert storage.
    if (appointmentOperations && APPOINTMENT_OPERATIONS_ROLES.has(role)) return;
    if (write ? canManageOthersSchedule(role) : canViewFullScheduleDetails(role)) return;
    const actor = await users.findById(user.id);
    if (users.isSupervisor(actor) && await users.supervisorHasAccess(user.id, providerId, agencyId)) return;
    fail(403, 'Full schedule access is required for schedule clips');
  }
  async function appointmentAccess(user, id, write = false, appointmentOperations = false) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) fail(400, 'A saved appointment is required');
    const appointment = await appointments.findById(Number(id));
    if (!appointment) fail(404, 'Appointment not found');
    await scheduleAccess(user, appointment.providerUserId, appointment.agencyId, write, appointmentOperations);
    return appointment;
  }
  const showsOnSchedule = row => row?.show_on_schedule == null || row.show_on_schedule === '' || Number(row.show_on_schedule) === 1;
  const mapAlert = row => ({ text: row?.alert_text ? decrypt(row.alert_text) : '', revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null, showOnSchedule: row ? showsOnSchedule(row) : false });
  async function get(user, id) {
    const appointment = await appointmentAccess(user, id);
    const [rows] = await db.execute('SELECT alert_text, revision, updated_at, show_on_schedule FROM appointment_staff_alerts WHERE appointment_id = ?', [appointment.id]);
    const participants = await appointments.listParticipants(appointment.id);
    const clients = [];
    const diagnosticAlerts = [];
    for (const clientId of new Set(participants.map(p => Number(p.clientId)).filter(Boolean))) {
      const access = await clientAccess({ userId: user.id, role: user.role, clientId });
      if (access.ok) { clients.push({ id: clientId, name: access.client.full_name || access.client.initials || `Client #${clientId}` }); if(!['learning','tutoring'].includes(appointment.businessType))diagnosticAlerts.push(...(await diagnosisAlerts({agencyId:appointment.agencyId,clientId})).map(alert=>({...alert,clientId}))); }
    }
    let canEdit = true;
    try { await scheduleAccess(user, appointment.providerUserId, appointment.agencyId, true); } catch (error) { if (error.status !== 403) throw error; canEdit = false; }
    return { appointmentId: appointment.id, agencyId: appointment.agencyId, alert: mapAlert(rows[0]), canEdit, clients, diagnosisAlerts:diagnosticAlerts,
      businessType: appointment.businessType,
      serviceSetting:['learning','tutoring'].includes(appointment.businessType)?await resolveAppointmentServiceSetting(appointment):null,
      canOpenLearningWorkspace: canOpenLearningWorkspace(appointment,user.id) };
  }
  async function save(user, id, body) {
    const appointment = await appointmentAccess(user, id, true);
    if (typeof body?.text !== 'string' || body.text.length > 500) fail(400, 'Use at most 500 characters for the schedule clip');
    const showOnSchedule = body.showOnSchedule === true ? 1 : 0;
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
      await conn.execute(`INSERT INTO appointment_staff_alerts (appointment_id, alert_text, revision, updated_by_user_id, show_on_schedule)
        VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE alert_text = VALUES(alert_text), revision = VALUES(revision), updated_by_user_id = VALUES(updated_by_user_id), show_on_schedule = VALUES(show_on_schedule)`, [appointment.id, encrypted, revision, user.id, showOnSchedule]);
      await conn.execute('INSERT INTO appointment_staff_alert_events (appointment_id, revision, alert_text, actor_user_id) VALUES (?, ?, ?, ?)', [appointment.id, revision, encrypted, user.id]);
      await conn.commit();
      return { text: value, revision, showOnSchedule: showOnSchedule === 1 };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  async function list(user, { providerId, agencyId, windowStart, windowEnd }) {
    if (!Number.isSafeInteger(Number(providerId)) || Number(providerId) < 1 || !Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) fail(400, 'Provider and agency are required');
    const start = new Date(windowStart); const end = new Date(windowEnd);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end - start > 370 * 86400000) fail(400, 'A valid schedule window of at most one year is required');
    await scheduleAccess(user, Number(providerId), Number(agencyId));
    const [rows] = await db.execute(`SELECT a.id AS appointment_id, a.provider_schedule_event_id, a.office_event_id, s.alert_text, s.revision, s.show_on_schedule, p.client_id
      FROM appointments a LEFT JOIN appointment_staff_alerts s ON s.appointment_id = a.id
      LEFT JOIN appointment_participants p ON p.appointment_id=a.id
      WHERE a.agency_id = ? AND a.provider_user_id = ? AND a.start_at < ? AND a.end_at > ?`,
      [Number(agencyId), Number(providerId), end.toISOString().slice(0, 19).replace('T', ' '), start.toISOString().slice(0, 19).replace('T', ' ')]);
    const grouped=new Map(),diagnosisCache=new Map();
    for(const row of rows){
      const id=Number(row.appointment_id),clientId=Number(row.client_id);
      if(!grouped.has(id))grouped.set(id,{appointmentId:id,providerScheduleEventId:Number(row.provider_schedule_event_id)||null,officeEventId:Number(row.office_event_id)||null,...mapAlert(row),diagnosisAlerts:[]});
      if(clientId && !diagnosisCache.has(clientId)){
        const access=await clientAccess({userId:user.id,role:user.role,clientId});
        diagnosisCache.set(clientId,access.ok ? await diagnosisAlerts({agencyId:Number(agencyId),clientId}) : []);
      }
      const entry=grouped.get(id);
      for(const alert of diagnosisCache.get(clientId)||[])if(!entry.diagnosisAlerts.some(item=>item.clientId===clientId&&item.code===alert.code&&item.diagnosisId===alert.diagnosisId))entry.diagnosisAlerts.push({...alert,clientId});
    }
    return [...grouped.values()].map(entry => {
      const clipText = entry.text;
      const showClip = entry.showOnSchedule && !!clipText;
      const text = [showClip ? clipText : '', ...entry.diagnosisAlerts.map(alert => alert.message)].filter(Boolean).join('\n');
      return { ...entry, text, clipText, showOnSchedule: showClip };
    }).filter(entry => entry.text);
  }
  return { get, save, list, authorize: (user, id) => appointmentAccess(user, id, false, true) };
}
export default createAppointmentStaffTools();
