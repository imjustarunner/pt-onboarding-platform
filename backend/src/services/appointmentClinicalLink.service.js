import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Appointment from '../models/Appointment.model.js';
import Client from '../models/Client.model.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import { ensureAppointmentContext } from './appointmentContext.service.js';

export async function assertAppointmentClients(agencyId, participants) {
  const clients = [];
  for (const participant of participants || []) {
    const clientId = Number(participant.clientId || participant.client_id || 0);
    if (!clientId) continue;
    const client = await Client.findById(clientId);
    if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
    clients.push(client);
    if (Number(client.agency_id) !== Number(agencyId)) {
      const [memberships] = await pool.execute(
        `SELECT 1 FROM client_agency_assignments WHERE client_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
        [clientId, agencyId]
      );
      if (!memberships.length) throw Object.assign(new Error('Client is not assigned to this agency'), { status: 403 });
    }
  }
  return clients;
}

/** One clinical session per appointment/client, including group participants. */
export async function ensureAppointmentClinicalLink(appointmentId, actorUserId = null) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) throw Object.assign(new Error('Appointment not found'), { status: 404 });
  const participants = await Appointment.listParticipants(appointmentId);
  await assertAppointmentClients(appointment.agencyId, participants);
  if ((appointment.packageEntitlementId && !['mental_health', 'healthcare'].includes(appointment.businessType)) || ['tutoring', 'learning', 'coaching', 'consulting', 'mentorship', 'skills_development'].includes(appointment.businessType)) return [];
  const billing = await Appointment.getBilling(appointmentId);
  const claimBlocked = appointment.packageEntitlementId ? 'SELF_PAY_ONLY: Prepaid package appointment; insurance claims are disabled'
    : billing?.settlementMode === 'self_pay_only' ? 'SELF_PAY_ONLY: Insurance claims are disabled for this appointment' : null;
  const sessions = [];
  for (const participant of participants) {
    if (!participant.clientId || !['client', 'student'].includes(participant.role)) continue;
    const client = await Client.findById(participant.clientId);
    if (!['clinical', 'school'].includes(String(client?.client_type).toLowerCase())) continue;
    if (appointment.officeEventId) {
      const result = await ensureAppointmentContext({ officeEventId: appointment.officeEventId, agencyId: appointment.agencyId,
        clientId: participant.clientId, actorUserId, syncAppointment: false });
      if (!result.ensured) throw Object.assign(new Error(`Clinical session linkage failed: ${result.reason}`), { status: 409 });
      sessions.push(await ClinicalSession.findById(result.context.clinicalSessionId));
    } else {
      let serviceLocation = null;
      const locationId = appointment.serviceLocationId || client.default_service_location_id;
      if (locationId) {
        serviceLocation = await AgencyServiceLocation.findById(locationId);
        if (!serviceLocation || Number(serviceLocation.agency_id) !== Number(appointment.agencyId)) {
          throw Object.assign(new Error('Service location does not belong to this agency'), { status: 403 });
        }
      }
      const isTelehealth = String(appointment.modality || '').toUpperCase() === 'TELEHEALTH';
      await clinicalPool.execute(
        `INSERT INTO clinical_sessions
         (agency_id, client_id, appointment_id, provider_user_id, rendering_provider_user_id, source_timezone,
          scheduled_start_at, scheduled_end_at, service_code, duration_minutes, is_telehealth, metadata_json, created_by_user_id, service_location_id, billing_office_location_id, place_of_service, claim_blocked_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TIMESTAMPDIFF(MINUTE, ?, ?), ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id),
           scheduled_start_at = VALUES(scheduled_start_at), scheduled_end_at = VALUES(scheduled_end_at),
           provider_user_id = VALUES(provider_user_id), rendering_provider_user_id = VALUES(rendering_provider_user_id),
           service_code = VALUES(service_code), duration_minutes = VALUES(duration_minutes), is_telehealth = VALUES(is_telehealth),
           source_timezone = VALUES(source_timezone), service_location_id = VALUES(service_location_id),
           billing_office_location_id = VALUES(billing_office_location_id), place_of_service = VALUES(place_of_service)`,
        [appointment.agencyId, participant.clientId, appointment.id, appointment.providerUserId, appointment.providerUserId, appointment.sourceTimezone || 'America/Denver',
          appointment.startAt, appointment.endAt, appointment.serviceCode, appointment.startAt, appointment.endAt,
          isTelehealth ? 1 : 0, JSON.stringify({ source: 'appointment', appointmentId: appointment.id }), actorUserId,
          serviceLocation?.id || null, serviceLocation?.billing_office_location_id || appointment.officeLocationId || client.default_office_location_id || null,
          serviceLocation?.place_of_service || client.default_place_of_service || null, claimBlocked]
      );
      const [rows] = await clinicalPool.execute(
        `SELECT * FROM clinical_sessions WHERE appointment_id = ? AND client_id = ? AND agency_id = ?`,
        [appointment.id, participant.clientId, appointment.agencyId]
      );
      sessions.push(rows[0]);
    }
  }
  if (claimBlocked) {
    for (const session of sessions) await clinicalPool.execute('UPDATE clinical_sessions SET claim_blocked_reason = ? WHERE id = ? AND agency_id = ?', [claimBlocked, session.id, appointment.agencyId]);
  }
  if (sessions[0]?.id && Number(appointment.clinicalSessionId) !== Number(sessions[0].id)) {
    await Appointment.update(appointmentId, { clinicalSessionId: sessions[0].id });
  }
  return sessions;
}
