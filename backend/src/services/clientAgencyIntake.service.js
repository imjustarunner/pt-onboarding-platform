/**
 * Agency new-client intake Action modal persistence.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import { isPaperPacketClient } from '../utils/paperPacketClient.js';
import {
  continuingClientDisclosureAutoOk,
  isReturningSchoolClient
} from '../utils/fallReadiness.js';
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

export function inferAgencyIntakePacketType(client) {
  return isPaperPacketClient(client) ? 'paper' : 'digital';
}

function packetTypeLabel(packetType) {
  return packetType === 'paper' ? 'Paper enrollment packet' : 'Digital enrollment packet';
}

async function resolveProviderSummary(clientId, clientRow = null) {
  const cid = Number(clientId || 0);
  if (!cid) return { hasProvider: false, providerLabel: null, providerUserIds: [] };

  const hasProvider = await clientHasProvider(cid, clientRow);
  if (!hasProvider) {
    return { hasProvider: false, providerLabel: null, providerUserIds: [] };
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id,
            COALESCE(
              NULLIF(TRIM(u.preferred_name), ''),
              NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
              u.email
            ) AS label
     FROM client_provider_assignments cpa
     JOIN users u ON u.id = cpa.provider_user_id
     WHERE cpa.client_id = ?
       AND cpa.is_active = TRUE
     ORDER BY u.id ASC`,
    [cid]
  );
  const labels = (rows || []).map((r) => String(r.label || '').trim()).filter(Boolean);
  if (labels.length) {
    return {
      hasProvider: true,
      providerLabel: labels.join(', '),
      providerUserIds: (rows || []).map((r) => Number(r.id)).filter(Boolean)
    };
  }

  const legacyId = Number(clientRow?.provider_id || 0);
  if (legacyId) {
    const [legacy] = await pool.execute(
      `SELECT COALESCE(
         NULLIF(TRIM(preferred_name), ''),
         NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''),
         email
       ) AS label
       FROM users WHERE id = ? LIMIT 1`,
      [legacyId]
    );
    return {
      hasProvider: true,
      providerLabel: String(legacy?.[0]?.label || `Provider #${legacyId}`).trim(),
      providerUserIds: [legacyId]
    };
  }

  return { hasProvider: true, providerLabel: 'Assigned', providerUserIds: [] };
}

/**
 * Derive read-only intake progress from stored answers + live client facts.
 */
export function computeAgencyIntakeState({
  client,
  intake = {},
  hasProvider = false,
  providerLabel = null,
  clientStatusKey = null
} = {}) {
  const packetType = inferAgencyIntakePacketType(client);
  const isPaper = packetType === 'paper';
  const statusKey = String(clientStatusKey || '').toLowerCase();
  const waitlisted = statusKey === 'waitlist' || intake.waitlisted === true;

  let paperComplete = intake.paperComplete;
  if (!isPaper) {
    paperComplete = true;
  } else if (paperComplete == null && statusKey === 'pending_corrections') {
    paperComplete = false;
  }

  const packetComplete = isPaper ? paperComplete === true : true;
  const insuranceReviewed = intake.insuranceReviewed === true;
  const ehrTransferred = intake.ehrTransferred === true;

    const gates = [
    {
      key: 'packet',
      label: isPaper ? 'Paper packet complete' : 'Digital enrollment packet received',
      done: packetComplete === true,
      automatic: !isPaper,
      skipped: false
    },
    {
      key: 'insurance',
      label: 'Insurance / eligibility reviewed',
      done: insuranceReviewed,
      automatic: false,
      skipped: false
    },
    {
      key: 'ehr',
      label: 'EHR transfer complete',
      done: ehrTransferred,
      automatic: false,
      skipped: false
    },
    {
      key: 'provider',
      label: 'Provider assigned',
      done: !!hasProvider,
      automatic: true,
      skipped: waitlisted
    }
  ];

  const agencyIntakeComplete = !waitlisted
    && packetComplete === true
    && insuranceReviewed
    && ehrTransferred
    && hasProvider;

  const clearToSchedule = agencyIntakeComplete;
  const pendingLabels = gates.filter((g) => !g.done && !g.skipped).map((g) => g.label);

  return {
    packetType,
    packetTypeLabel: packetTypeLabel(packetType),
    isPaper,
    paperComplete,
    packetComplete,
    insuranceReviewed,
    ehrTransferred,
    hasProvider: !!hasProvider,
    providerLabel: providerLabel || null,
    waitlisted,
    pendingCorrections: isPaper && paperComplete === false,
    agencyIntakeComplete,
    clearToSchedule,
    gates,
    pendingLabels
  };
}

export async function getAgencyIntake(clientId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.source, c.status, c.document_status, c.agency_intake_json,
            c.insurance_type_id, c.staff_onboarding_completed_at, c.provider_id, c.client_status_id,
            cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [clientId]
  );
  const client = rows?.[0];
  if (!client) return null;

  const intake = parseJson(client.agency_intake_json);
  const provider = await resolveProviderSummary(client.id, client);
  const derived = computeAgencyIntakeState({
    client,
    intake,
    hasProvider: provider.hasProvider,
    providerLabel: provider.providerLabel,
    clientStatusKey: client.client_status_key
  });

  return {
    clientId: client.id,
    agencyId: client.agency_id,
    source: client.source,
    intake: {
      ...intake,
      packetType: derived.packetType,
      paperComplete: derived.paperComplete,
      agencyIntakeComplete: derived.agencyIntakeComplete
    },
    derived,
    insuranceTypeId: client.insurance_type_id,
    staffOnboardingCompletedAt: client.staff_onboarding_completed_at,
    providerId: client.provider_id,
    clientStatusKey: client.client_status_key || null
  };
}

/**
 * Save agency intake step answers and advance Status.
 *
 * Manual fields only:
 * - insuranceReviewed, ehrTransferred
 * - waitlisted + waitlistReason
 * - paperComplete + missingItems (paper packets only)
 *
 * Packet type and agency intake complete are derived automatically.
 */
export async function saveAgencyIntake({ clientId, payload = {}, actorUserId = null }) {
  const [rows] = await pool.execute(
    `SELECT c.*, cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [clientId]
  );
  const client = rows?.[0];
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });

  const prev = parseJson(client.agency_intake_json);
  const packetType = inferAgencyIntakePacketType(client);
  const isPaper = packetType === 'paper';

  const next = {
    ...prev,
    packetType,
    insuranceReviewed: payload.insuranceReviewed ?? prev.insuranceReviewed ?? false,
    ehrTransferred: payload.ehrTransferred ?? prev.ehrTransferred ?? false,
    inProcess: true,
    pendingCorrections: false,
    updatedAt: new Date().toISOString(),
    updatedByUserId: actorUserId || null
  };

  if (isPaper) {
    if (payload.paperComplete !== undefined && payload.paperComplete !== null) {
      next.paperComplete = payload.paperComplete === true;
    } else if (prev.paperComplete !== undefined) {
      next.paperComplete = prev.paperComplete;
    } else {
      next.paperComplete = null;
    }
    next.missingItems = Array.isArray(payload.missingItems)
      ? payload.missingItems.map((s) => String(s).trim()).filter(Boolean)
      : (prev.missingItems || []);
    if (next.paperComplete === false) {
      next.pendingCorrections = true;
    }
  } else {
    next.paperComplete = true;
    next.pendingCorrections = false;
    next.missingItems = [];
  }

  if (payload.waitlistReason !== undefined) {
    next.waitlistReason = String(payload.waitlistReason || '').trim();
  }

  const waitlisted = payload.waitlisted === true;
  const provider = await resolveProviderSummary(client.id, client);
  let derived = computeAgencyIntakeState({
    client,
    intake: next,
    hasProvider: provider.hasProvider,
    providerLabel: provider.providerLabel,
    clientStatusKey: waitlisted ? 'waitlist' : client.client_status_key
  });
  next.agencyIntakeComplete = derived.agencyIntakeComplete;

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
    if (next.waitlistReason && actorUserId) {
      await ClientNotes.upsertSharedSingletonByClientAndCategory({
        clientId,
        category: 'waitlist',
        message: next.waitlistReason,
        actorUserId
      }).catch((err) => {
        console.error('[saveAgencyIntake] waitlist note upsert failed', err?.message || err);
      });
    }
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

  derived = computeAgencyIntakeState({
    client,
    intake: next,
    hasProvider: provider.hasProvider,
    providerLabel: provider.providerLabel,
    clientStatusKey: client.client_status_key
  });

  if (derived.clearToSchedule) {
    next.agencyIntakeComplete = true;
    await Client.update(clientId, { agency_intake_json: JSON.stringify(next) }, actorUserId);
    if (!client.staff_onboarding_completed_at) {
      await Client.update(clientId, { staff_onboarding_completed_at: new Date() }, actorUserId);
    }
    await markClientReadyToSchedule({
      clientId,
      actorUserId,
      note: 'Agency intake complete — Ready to Schedule'
    });
    // Insurance is reviewed during agency intake — don't re-prompt the separate clearance modal.
    if (next.insuranceReviewed) {
      const disclosureCanAutoOk = continuingClientDisclosureAutoOk(client)
        || !(client.disclosure_required === 1 || client.disclosure_required === true)
        || (provider.hasProvider && !isReturningSchoolClient(client));
      if (disclosureCanAutoOk) {
        const { saveAgencyClearance } = await import('./clientYearDisposition.service.js');
        await saveAgencyClearance({
          clientId,
          agencyId: client.agency_id,
          clearance: { insuranceOk: true, disclosureOk: true },
          actorUserId
        }).catch((err) => {
          console.error('[saveAgencyIntake] agency clearance sync failed', err?.message || err);
        });
      }
    }
  } else {
    await setClientLifecycleStatus({
      clientId,
      statusKey: LIFECYCLE_STATUS_KEYS.IN_PROCESS,
      actorUserId,
      note: derived.pendingLabels.length
        ? `Agency intake in process — waiting on: ${derived.pendingLabels.join(', ')}`
        : 'Agency intake in process'
    });
  }

  return getAgencyIntake(clientId);
}
