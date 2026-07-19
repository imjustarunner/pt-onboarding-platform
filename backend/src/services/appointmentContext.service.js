import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import {
  resolveWithOverflowChain,
  ruleFromMedicalServiceCodeRow
} from './serviceCodeUnits.service.js';

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

  // Apply service code / location / units onto the encounter when medical codes exist.
  try {
    const serviceCode = String(event.service_code || '').trim().toUpperCase() || null;
    const startMs = event.start_at ? new Date(event.start_at).getTime() : 0;
    const endMs = event.end_at ? new Date(event.end_at).getTime() : 0;
    const durationMinutes =
      startMs && endMs && endMs > startMs ? Math.round((endMs - startMs) / 60000) : null;
    const officeLocationId = parseIntId(event.office_location_id);
    const serviceLocationId = parseIntId(event.service_location_id);

    let placeOfService = null;
    let billingOfficeLocationId = officeLocationId;
    if (serviceLocationId) {
      const loc = await AgencyServiceLocation.findById(serviceLocationId);
      if (loc && Number(loc.agency_id) === resolvedAgencyId) {
        placeOfService = loc.place_of_service || null;
        billingOfficeLocationId = parseIntId(loc.billing_office_location_id) || officeLocationId;
      }
    }
    if (!placeOfService && officeLocationId) {
      const office = await OfficeLocation.findById(officeLocationId);
      placeOfService = office?.default_place_of_service || null;
    }

    let effectiveCode = serviceCode;
    let billedUnits = null;
    let claimBlocked = null;
    if (serviceCode && durationMinutes) {
      const row = await AgencyMedicalServiceCode.findByAgencyAndCode(resolvedAgencyId, serviceCode);
      if (row) {
        const primary = ruleFromMedicalServiceCodeRow(row);
        const all = await AgencyMedicalServiceCode.listByAgency(resolvedAgencyId);
        const byCode = new Map(all.map((c) => [String(c.service_code).toUpperCase(), c]));
        const resolution = resolveWithOverflowChain(durationMinutes, primary, (code) => {
          const hit = byCode.get(String(code).toUpperCase());
          return hit ? ruleFromMedicalServiceCodeRow(hit) : null;
        });
        effectiveCode = resolution.effectiveServiceCode || serviceCode;
        billedUnits = resolution.claimable ? resolution.units : null;
        claimBlocked = resolution.claimable ? null : resolution.reason;
        placeOfService = placeOfService || primary.defaultPlaceOfService || null;
      }
    }

    if (clinicalSessionId) {
      await clinicalPool.execute(
        `UPDATE clinical_sessions SET
           service_code = COALESCE(?, service_code),
           effective_service_code = COALESCE(?, effective_service_code),
           service_location_id = COALESCE(?, service_location_id),
           billing_office_location_id = COALESCE(?, billing_office_location_id),
           place_of_service = COALESCE(?, place_of_service),
           duration_minutes = COALESCE(?, duration_minutes),
           billed_units = COALESCE(?, billed_units),
           claim_blocked_reason = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          serviceCode,
          effectiveCode,
          serviceLocationId,
          billingOfficeLocationId,
          placeOfService,
          durationMinutes,
          billedUnits,
          claimBlocked,
          clinicalSessionId
        ]
      );
    }
  } catch (e) {
    // Best-effort: older schemas / missing medical tables should not block booking
    if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[appointmentContext] encounter billing apply failed:', e?.message);
    }
  }

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

