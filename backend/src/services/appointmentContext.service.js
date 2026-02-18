import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';

function parseIntId(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeTimezone(value) {
  const tz = String(value || '').trim();
  return tz || 'America/New_York';
}

async function lookupBillingContextIdByOfficeEvent({ officeEventId }) {
  const eid = parseIntId(officeEventId);
  if (!eid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT id
       FROM learning_program_sessions
       WHERE office_event_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [eid]
    );
    return parseIntId(rows?.[0]?.id);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

export async function ensureAppointmentContext({
  officeEventId,
  agencyId = null,
  clientId = null,
  sourceTimezone = 'America/New_York',
  actorUserId = null
}) {
  const eid = parseIntId(officeEventId);
  if (!eid) {
    return { ok: false, reason: 'invalid_office_event_id', ensured: false };
  }
  const event = await OfficeEvent.findById(eid);
  if (!event) {
    return { ok: false, reason: 'event_not_found', ensured: false };
  }
  if (String(event.status || '').trim().toUpperCase() !== 'BOOKED') {
    return { ok: true, reason: 'not_booked', ensured: false, event };
  }

  const resolvedClientId = parseIntId(clientId) || parseIntId(event.client_id);
  if (!resolvedClientId) {
    return { ok: true, reason: 'missing_client', ensured: false, event };
  }

  const client = await Client.findById(resolvedClientId);
  if (!client) {
    return { ok: false, reason: 'client_not_found', ensured: false, event };
  }

  const resolvedAgencyId = parseIntId(agencyId) || parseIntId(client.agency_id);
  if (!resolvedAgencyId) {
    return { ok: false, reason: 'missing_agency', ensured: false, event };
  }

  if (String(client.client_type || '').trim().toLowerCase() !== 'clinical') {
    const billingContextId = await lookupBillingContextIdByOfficeEvent({ officeEventId: eid });
    const updatedEvent = await OfficeEvent.setContextLinkage({
      eventId: eid,
      clientId: resolvedClientId,
      clinicalSessionId: null,
      noteContextId: null,
      billingContextId: billingContextId || parseIntId(event.billing_context_id) || null
    });
    return {
      ok: true,
      reason: 'non_clinical_client',
      ensured: false,
      event: updatedEvent,
      context: {
        clinicalSessionId: null,
        noteContextId: null,
        billingContextId: billingContextId || null
      }
    };
  }

  let session = null;
  try {
    session = await ClinicalSession.upsert({
      agencyId: resolvedAgencyId,
      clientId: resolvedClientId,
      officeEventId: eid,
      providerUserId: parseIntId(event.booked_provider_id) || parseIntId(event.assigned_provider_id) || null,
      sourceTimezone: normalizeTimezone(sourceTimezone),
      scheduledStartAt: event.start_at || null,
      scheduledEndAt: event.end_at || null,
      metadataJson: null,
      createdByUserId: parseIntId(actorUserId)
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return { ok: true, reason: 'clinical_schema_missing', ensured: false, event };
    }
    throw e;
  }

  const clinicalSessionId = parseIntId(session?.id);
  const noteContextId = clinicalSessionId;
  const billingContextId =
    (await lookupBillingContextIdByOfficeEvent({ officeEventId: eid })) ||
    parseIntId(event.billing_context_id) ||
    clinicalSessionId;

  const updatedEvent = await OfficeEvent.setContextLinkage({
    eventId: eid,
    clientId: resolvedClientId,
    clinicalSessionId,
    noteContextId,
    billingContextId
  });

  return {
    ok: true,
    ensured: true,
    reason: 'ensured',
    event: updatedEvent,
    context: {
      clinicalSessionId,
      noteContextId,
      billingContextId
    }
  };
}

