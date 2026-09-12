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
  sourceTimezone = null,
  actorUserId = null,
  syncAppointment = true,
  sessionContext = null
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

  const savedContext = typeof event.session_context_json === 'string' ? JSON.parse(event.session_context_json) : (event.session_context_json || {});
  const resolvedAgencyId = parseIntId(agencyId) || parseIntId(sessionContext?.agencyId)
    || parseIntId(savedContext.agencyId) || parseIntId(client.agency_id);
  if (!resolvedAgencyId) {
    return { ok: false, reason: 'missing_agency', ensured: false, event };
  }

  if (Number(client.agency_id) !== resolvedAgencyId) {
    const [memberships] = await pool.execute(
      'SELECT 1 FROM client_agency_assignments WHERE client_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1',
      [resolvedClientId, resolvedAgencyId]
    );
    if (!memberships.length) throw Object.assign(new Error('Client is not assigned to the booking agency'), { status: 403 });
  }
  let bookingContext = event.session_context_json || {};
  if (typeof bookingContext === 'string') bookingContext = JSON.parse(bookingContext);
  if (sessionContext) {
    bookingContext = { ...bookingContext, ...sessionContext };
    await pool.execute('UPDATE office_events SET session_context_json = ? WHERE id = ?', [JSON.stringify(bookingContext), eid]);
  }
  const syncCanonicalAppointment = async (clinicalSessionId = null) => {
    if (!syncAppointment) return;
    const { upsertAppointmentForOfficeBook } = await import('./appointment.service.js');
    await upsertAppointmentForOfficeBook({ agencyId: resolvedAgencyId, officeEventId: eid,
      providerUserId: parseIntId(event.booked_provider_id) || parseIntId(event.assigned_provider_id),
      clientId: resolvedClientId, startAt: event.start_at, endAt: event.end_at,
      modality: event.modality, officeLocationId: event.office_location_id, roomId: event.room_id,
      tenantServiceId: parseIntId(bookingContext.tenantServiceId), packageEntitlementId: parseIntId(bookingContext.packageEntitlementId),
      serviceCode: event.service_code, clinicalSessionId, actorUserId, strict: true });
  };
  if (bookingContext.packageEntitlementId || !['clinical', 'school'].includes(String(client.client_type || '').trim().toLowerCase())) {
    const billingContextId = await lookupBillingContextIdByOfficeEvent({ officeEventId: eid });
    const updatedEvent = await OfficeEvent.setContextLinkage({
      eventId: eid,
      clientId: resolvedClientId,
      clinicalSessionId: null,
      noteContextId: null,
      billingContextId: billingContextId || parseIntId(event.billing_context_id) || null
    });
    await syncCanonicalAppointment();
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
  const office = event.office_location_id ? await OfficeLocation.findById(event.office_location_id) : null;
  try {
    session = await ClinicalSession.upsert({
      agencyId: resolvedAgencyId,
      clientId: resolvedClientId,
      officeEventId: eid,
      providerUserId: parseIntId(event.booked_provider_id) || parseIntId(event.assigned_provider_id) || null,
      sourceTimezone: normalizeTimezone(office?.timezone || sourceTimezone),
      scheduledStartAt: event.start_at || null,
      scheduledEndAt: event.end_at || null,
      metadataJson: null,
      createdByUserId: parseIntId(actorUserId)
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      throw Object.assign(new Error('Clinical database migrations are required before this booking can be linked.'), { status: 409, officeEventId: eid });
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
    let serviceLocationId = parseIntId(event.service_location_id);

    let placeOfService = null;
    let billingOfficeLocationId = officeLocationId;

    // Client chart defaults (Assignments tab) fill gaps when the booking didn't pick POS/location.
    // Prefer per-tenant membership defaults for the encounter agency, then fall back to clients.*.
    if (resolvedClientId && (!serviceLocationId || !placeOfService || !billingOfficeLocationId)) {
      try {
        if (resolvedAgencyId) {
          const [mRows] = await pool.execute(
            `SELECT default_office_location_id, default_place_of_service, default_service_location_id
             FROM client_agency_assignments
             WHERE client_id = ? AND agency_id = ? AND is_active = TRUE
             LIMIT 1`,
            [resolvedClientId, resolvedAgencyId]
          );
          const m = mRows?.[0] || null;
          if (m) {
            if (!serviceLocationId) serviceLocationId = parseIntId(m.default_service_location_id);
            if (!placeOfService) {
              placeOfService = String(m.default_place_of_service || '').trim() || null;
            }
            if (!billingOfficeLocationId) {
              billingOfficeLocationId = parseIntId(m.default_office_location_id) || null;
            }
          }
        }
      } catch {
        // Columns may not exist until migration 1324; ignore.
      }
      try {
        const [cRows] = await pool.execute(
          `SELECT default_office_location_id, default_place_of_service, default_service_location_id
           FROM clients WHERE id = ? LIMIT 1`,
          [resolvedClientId]
        );
        const c = cRows?.[0] || null;
        if (c) {
          if (!serviceLocationId) serviceLocationId = parseIntId(c.default_service_location_id);
          if (!placeOfService) {
            placeOfService = String(c.default_place_of_service || '').trim() || null;
          }
          if (!billingOfficeLocationId) {
            billingOfficeLocationId = parseIntId(c.default_office_location_id) || null;
          }
        }
      } catch {
        // Columns may not exist until migration 1309; ignore.
      }
    }

    if (serviceLocationId) {
      const loc = await AgencyServiceLocation.findById(serviceLocationId);
      if (loc && Number(loc.agency_id) === resolvedAgencyId) {
        placeOfService = placeOfService || loc.place_of_service || null;
        billingOfficeLocationId = parseIntId(loc.billing_office_location_id) || billingOfficeLocationId || officeLocationId;
      }
    }
    if (!placeOfService && officeLocationId) {
      const office = await OfficeLocation.findById(officeLocationId);
      placeOfService = office?.default_place_of_service || null;
    }
    if (!billingOfficeLocationId) billingOfficeLocationId = officeLocationId;

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
    throw Object.assign(new Error('The office is booked, but its clinical billing context could not be synchronized.'),
      { status: 409, code: 'CLINICAL_CONTEXT_SYNC_REQUIRED', officeEventId: eid, cause: e });
  }

  const updatedEvent = await OfficeEvent.setContextLinkage({
    eventId: eid,
    clientId: resolvedClientId,
    clinicalSessionId,
    noteContextId,
    billingContextId
  });

  await syncCanonicalAppointment(clinicalSessionId);

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
