import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status, code: 'NOTE_SESSION_CONTEXT_REQUIRED' });
const code = value => String(value || '').trim().toUpperCase();
function sessionDate(session) {
  const raw = session?.scheduled_start_at;
  const instant = raw instanceof Date ? raw : new Date(`${String(raw || '').replace(' ', 'T').replace(/Z$/, '')}Z`);
  return utcDateToZonedYmd(instant, session?.source_timezone || 'America/Denver');
}
function assertScope(session, input) {
  if (!session || Number(session.agency_id) !== Number(input.agencyId)
    || Number(session.client_id) !== Number(input.clientId)
    || Number(session.provider_user_id) !== Number(input.providerUserId)) {
    throw fail('The selected session does not belong to this client, provider and organization. Open the correct appointment from the schedule.', 403);
  }
  if (input.officeEventId && Number(session.office_event_id) !== Number(input.officeEventId)) {
    throw fail('The selected appointment and clinical session do not match. Reopen the appointment from the schedule.');
  }
  if (input.dateOfService && sessionDate(session) !== String(input.dateOfService).slice(0, 10)) {
    throw fail('The selected session is on a different service date. Reopen the correct appointment from the schedule.');
  }
  if (code(input.serviceCode) && code(session.service_code) && code(input.serviceCode) !== code(session.service_code)) {
    throw fail('The note service does not match the selected session. Review the appointment service before continuing.');
  }
  return session;
}

/** Resolve existing context only. This never creates a session, changes attendance or edits authored notes. */
export async function resolveClinicalDraftSessionContext(input, dependencies = {}) {
  const sessions = dependencies.sessions || ClinicalSession;
  const database = dependencies.database || clinicalPool;
  if (input.clinicalSessionId || input.officeEventId) {
    if (!input.clientId) throw fail('Select the client for this appointment before saving the draft.');
    const session = input.clinicalSessionId
      ? await sessions.findById(input.clinicalSessionId)
      : await sessions.findByOfficeEventAndClient({ officeEventId: input.officeEventId, clientId: input.clientId });
    if (!session) throw fail('The selected appointment has no clinical session available. Reopen it from the schedule before saving the note.', 404);
    return assertScope(session, input);
  }
  if (!input.clientId || !input.dateOfService || !code(input.serviceCode)) return null;
  // The broad UTC window covers every possible local service date. Compare the
  // actual source timezone below, avoiding DATE(UTC) errors at midnight/DST.
  const date = String(input.dateOfService).slice(0, 10);
  const from = new Date(`${date}T00:00:00Z`);
  const until = new Date(from);
  from.setUTCDate(from.getUTCDate() - 1);
  until.setUTCDate(until.getUTCDate() + 2);
  const mysql = value => value.toISOString().slice(0, 19).replace('T', ' ');
  const [rows] = await database.execute(`SELECT s.* FROM clinical_sessions s
    WHERE s.agency_id = ? AND s.client_id = ? AND s.provider_user_id = ?
      AND s.scheduled_start_at >= ? AND s.scheduled_start_at < ?
      AND UPPER(TRIM(s.service_code)) = ?
      AND (s.appointment_id IS NOT NULL OR s.office_event_id IS NOT NULL OR s.billing_encounter_id IS NOT NULL)
      AND s.encounter_status NOT IN ('cancelled', 'canceled', 'voided', 'no_show')
      AND NOT EXISTS (SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id = s.id AND n.provider_signed_at IS NOT NULL)
    ORDER BY s.id ASC`, [input.agencyId, input.clientId, input.providerUserId, mysql(from), mysql(until), code(input.serviceCode)]);
  const matches = (rows || []).filter(session => sessionDate(session) === date);
  if (matches.length > 1) {
    throw fail('More than one appointment matches this client, service and date. Open the specific appointment from the schedule to start its note.');
  }
  return matches.length ? assertScope(matches[0], input) : null;
}
