/**
 * Agency new-client intake Action modal persistence.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import {
  LIFECYCLE_STATUS_KEYS,
  setClientLifecycleStatus,
  markClientReadyToSchedule,
  clientHasProvider
} from './clientLifecycleStatus.service.js';

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export async function getAgencyIntake(clientId) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, source, agency_intake_json, insurance_type_id,
            staff_onboarding_completed_at, provider_id, client_status_id
     FROM clients WHERE id = ? LIMIT 1`,
    [clientId]
  );
  const client = rows?.[0];
  if (!client) return null;
  return {
    clientId: client.id,
    agencyId: client.agency_id,
    source: client.source,
    intake: parseJson(client.agency_intake_json),
    insuranceTypeId: client.insurance_type_id,
    staffOnboardingCompletedAt: client.staff_onboarding_completed_at,
    providerId: client.provider_id
  };
}

/**
 * Save agency intake step answers and advance Status.
 *
 * Body fields:
 * - packetType: 'digital' | 'paper'
 * - paperComplete: boolean (paper only)
 * - missingItems: string[]
 * - insuranceReviewed: boolean
 * - waitlisted: boolean + waitlistReason
 * - ehrTransferred: boolean
 * - providerAssigned: implied by assignments
 * - agencyIntakeComplete: boolean
 */
export async function saveAgencyIntake({ clientId, payload = {}, actorUserId = null }) {
  const [rows] = await pool.execute(
    `SELECT * FROM clients WHERE id = ? LIMIT 1`,
    [clientId]
  );
  const client = rows?.[0];
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });

  const prev = parseJson(client.agency_intake_json);
  const next = {
    ...prev,
    packetType: payload.packetType || prev.packetType || null,
    paperComplete: payload.paperComplete ?? prev.paperComplete ?? null,
    missingItems: Array.isArray(payload.missingItems)
      ? payload.missingItems.map((s) => String(s).trim()).filter(Boolean)
      : (prev.missingItems || []),
    insuranceReviewed: payload.insuranceReviewed ?? prev.insuranceReviewed ?? false,
    ehrTransferred: payload.ehrTransferred ?? prev.ehrTransferred ?? false,
    inProcess: true,
    pendingCorrections: false,
    agencyIntakeComplete: payload.agencyIntakeComplete ?? prev.agencyIntakeComplete ?? false,
    updatedAt: new Date().toISOString(),
    updatedByUserId: actorUserId || null
  };

  if (next.packetType === 'paper' && next.paperComplete === false) {
    next.pendingCorrections = true;
    next.agencyIntakeComplete = false;
  }
  if (next.packetType === 'digital') {
    next.paperComplete = true;
    next.pendingCorrections = false;
  }

  const waitlisted = payload.waitlisted === true;
  const patch = { agency_intake_json: JSON.stringify(next) };
  if (payload.insuranceTypeId != null) {
    patch.insurance_type_id = Number(payload.insuranceTypeId) || null;
  }

  await Client.update(clientId, patch, actorUserId);

  if (waitlisted) {
    await setClientLifecycleStatus({
      clientId,
      statusKey: LIFECYCLE_STATUS_KEYS.WAITLIST,
      actorUserId,
      note: payload.waitlistReason
        ? `Waitlisted: ${String(payload.waitlistReason).slice(0, 500)}`
        : 'Waitlisted from agency intake',
      extraPatch: { waitlist_started_at: new Date() }
    });
    return getAgencyIntake(clientId);
  }

  if (next.pendingCorrections) {
    await setClientLifecycleStatus({
      clientId,
      statusKey: LIFECYCLE_STATUS_KEYS.PENDING_CORRECTIONS,
      actorUserId,
      note: 'Agency intake: pending corrections'
    });
    return getAgencyIntake(clientId);
  }

  const hasProvider = await clientHasProvider(clientId, client);
  const ready =
    next.agencyIntakeComplete === true
    && hasProvider
    && (next.packetType === 'digital' || next.paperComplete === true)
    && next.insuranceReviewed === true
    && next.ehrTransferred === true;

  if (ready) {
    next.agencyIntakeComplete = true;
    await Client.update(clientId, { agency_intake_json: JSON.stringify(next) }, actorUserId);
    // Mark staff onboarding complete for legacy checklist consumers
    if (!client.staff_onboarding_completed_at) {
      await Client.update(clientId, { staff_onboarding_completed_at: new Date() }, actorUserId);
    }
    await markClientReadyToSchedule({
      clientId,
      actorUserId,
      note: 'Agency intake complete — Ready to Schedule'
    });
  } else {
    await setClientLifecycleStatus({
      clientId,
      statusKey: LIFECYCLE_STATUS_KEYS.IN_PROCESS,
      actorUserId,
      note: 'Agency intake in process'
    });
  }

  return getAgencyIntake(clientId);
}
