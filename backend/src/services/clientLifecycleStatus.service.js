/**
 * Shared client Status engine for school clients.
 * Status tells what is currently true; Actions are role-specific elsewhere.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { isPaperPacketClient } from '../utils/paperPacketClient.js';
import { computeCurrentSchoolYearLabel } from '../utils/schoolYear.js';
import { deriveLifecycleAction } from '../utils/clientLifecycleAction.js';
import { isReturningSchoolClient, needsFallReassignmentClearance, servicesConfirmedThisSchoolYear } from '../utils/fallReadiness.js';

export { deriveLifecycleAction };

export const LIFECYCLE_STATUS_KEYS = {
  RECEIVED: 'received',
  PENDING_CORRECTIONS: 'pending_corrections',
  IN_PROCESS: 'in_process',
  WAITLIST: 'waitlist',
  READY_TO_SCHEDULE: 'ready_to_schedule',
  NEEDS_DAY_ASSIGNMENT: 'needs_day_assignment',
  SCHEDULED: 'scheduled',
  BEING_SEEN: 'being_seen',
  TERMINATED: 'terminated',
  SPRING_UPDATE_PENDING: 'spring_update_pending',
  RETURNING: 'returning',
  NOT_RETURNING: 'not_returning',
  CONTINUATION_UNKNOWN: 'continuation_unknown',
  CONFIRMATION_PENDING: 'confirmation_pending',
  CONFIRMED_RETURNING: 'confirmed_returning',
  UNABLE_TO_REACH: 'unable_to_reach',
  RECOMMEND_TERMINATION: 'recommend_termination',
  OTHER_TRANSFER: 'other_transfer',
  // Legacy aliases still used in older paths
  PACKET: 'packet',
  PENDING: 'pending',
  ONBOARDED: 'onboarded',
  CURRENT: 'current'
};

const TERMINAL = new Set(['terminated', 'archived']);

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clientHasWeekdayAssignment(clientId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM client_provider_assignments
     WHERE client_id = ?
       AND is_active = TRUE
       AND service_day IS NOT NULL
       AND TRIM(service_day) <> ''
       AND LOWER(TRIM(service_day)) <> 'unknown'
       AND service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')`,
    [clientId]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

export async function clientHasProvider(clientId, clientRow = null) {
  if (clientRow?.provider_id) return true;
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM client_provider_assignments
     WHERE client_id = ? AND is_active = TRUE`,
    [clientId]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

/**
 * Set catalog status by key. Idempotent. Returns { changed, statusKey, statusId }.
 */
export async function setClientLifecycleStatus({
  clientId,
  statusKey,
  actorUserId = null,
  note = null,
  extraPatch = {}
}) {
  const cid = Number(clientId || 0);
  const key = String(statusKey || '').toLowerCase();
  if (!cid || !key) return { changed: false };

  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.organization_id, c.client_status_id, c.initials,
            c.identifier_code, c.full_name, c.agency_intake_json, c.waitlist_started_at,
            cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [cid]
  );
  const client = rows?.[0];
  if (!client) return { changed: false };

  const currentKey = String(client.client_status_key || '').toLowerCase();
  if (TERMINAL.has(currentKey) && key !== 'terminated') {
    return { changed: false, statusKey: currentKey, skipped: 'terminal' };
  }

  const statusId = await getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: key });
  if (!statusId) {
    console.warn('[clientLifecycleStatus] missing status key', { agencyId: client.agency_id, key });
    return { changed: false, statusKey: key, skipped: 'missing_catalog' };
  }

  if (Number(statusId) === Number(client.client_status_id || 0)) {
    if (Object.keys(extraPatch || {}).length) {
      await Client.update(cid, extraPatch, actorUserId);
    }
    return { changed: false, statusKey: key, statusId };
  }

  const patch = { client_status_id: statusId, ...extraPatch };
  // Workflow enum sync for common states
  if (['being_seen', 'scheduled', 'ready_to_schedule', 'needs_day_assignment', 'current'].includes(key)) {
    patch.status = 'ACTIVE';
  } else if (key === 'waitlist') {
    patch.status = 'ON_HOLD';
    if (!extraPatch.waitlist_started_at) {
      // leave existing waitlist_started_at; controller may set it
    }
  } else if (['received', 'packet', 'pending_corrections', 'in_process'].includes(key)) {
    patch.status = 'PACKET';
  } else if (key === 'terminated') {
    // terminate path sets its own fields
  }

  await Client.update(cid, patch, actorUserId);
  await ClientStatusHistory.create({
    client_id: cid,
    changed_by_user_id: actorUserId,
    field_changed: 'client_status_id',
    from_value: client.client_status_id ? String(client.client_status_id) : null,
    to_value: String(statusId),
    note: note || `Lifecycle status → ${key}`
  }).catch(() => {});

  if (key === LIFECYCLE_STATUS_KEYS.WAITLIST && currentKey !== 'waitlist') {
    try {
      const { refundSlotsForClientEnteringWaitlist } = await import('./providerSlots.service.js');
      await refundSlotsForClientEnteringWaitlist(cid, { organizationId: client.organization_id || null });
    } catch (err) {
      console.error('[clientLifecycleStatus] waitlist slot refund failed', err?.message || err);
    }
  } else if (currentKey === 'waitlist' && key !== 'waitlist') {
    try {
      const { takeSlotsForClientLeavingWaitlist } = await import('./providerSlots.service.js');
      await takeSlotsForClientLeavingWaitlist(cid, {
        organizationId: client.organization_id || null,
        allowNegative: true
      });
    } catch (err) {
      console.error('[clientLifecycleStatus] waitlist slot take failed', err?.message || err);
    }
  }

  if (key === LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE || key === LIFECYCLE_STATUS_KEYS.WAITLIST) {
    try {
      const {
        enqueueReadyToScheduleDigest,
        DIGEST_CATEGORY_READY,
        DIGEST_CATEGORY_WAITLIST
      } = await import('./schoolReadyScheduleDigest.service.js');
      const isWaitlist = key === LIFECYCLE_STATUS_KEYS.WAITLIST;
      let waitlistReason = null;
      if (isWaitlist) {
        const noteText = String(note || '').trim();
        if (/^waitlisted:\s*/i.test(noteText)) {
          waitlistReason = noteText.replace(/^waitlisted:\s*/i, '').slice(0, 500);
        } else if (noteText) {
          waitlistReason = noteText.slice(0, 500);
        }
        try {
          const intake = client.agency_intake_json
            ? (typeof client.agency_intake_json === 'string'
              ? JSON.parse(client.agency_intake_json)
              : client.agency_intake_json)
            : null;
          if (!waitlistReason && intake?.waitlistReason) {
            waitlistReason = String(intake.waitlistReason).slice(0, 500);
          }
        } catch {
          // ignore parse errors
        }
      }
      await enqueueReadyToScheduleDigest({
        agencyId: client.agency_id,
        schoolOrganizationId: client.organization_id,
        clientId: cid,
        clientInitials: client.initials || null,
        clientLabel: client.initials || client.full_name || client.identifier_code || null,
        category: isWaitlist ? DIGEST_CATEGORY_WAITLIST : DIGEST_CATEGORY_READY,
        waitlistReason,
        clearedFromWaitlist: !isWaitlist && currentKey === 'waitlist',
        statusChangedAt: isWaitlist
          ? (client.waitlist_started_at || new Date())
          : new Date()
      });
    } catch (err) {
      console.error('[clientLifecycleStatus] school status digest enqueue failed', err?.message || err);
    }
  }

  // Keep provider Tasks Hub items in sync with Clients Action / Next Step
  try {
    const { syncClientProviderLifecycleTasks } = await import('./clientOnboardingTask.service.js');
    await syncClientProviderLifecycleTasks({ clientId: cid, actorUserId });
  } catch (err) {
    console.error('[clientLifecycleStatus] provider lifecycle task sync failed', err?.message || err);
  }

  return { changed: true, statusKey: key, statusId };
}

/**
 * Recompute and apply school-client Status from facts.
 * Prefer calling specific transition helpers; this is the catch-all reconciler.
 */
export async function reconcileSchoolClientStatus({ clientId, actorUserId = null, note = null }) {
  const cid = Number(clientId || 0);
  if (!cid) return null;

  const [rows] = await pool.execute(
    `SELECT c.*, cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [cid]
  );
  const client = rows?.[0];
  if (!client || String(client.client_type || '').toLowerCase() !== 'school') {
    return null;
  }

  const currentKey = String(client.client_status_key || '').toLowerCase();
  if (TERMINAL.has(currentKey) || currentKey === 'terminated') {
    return { statusKey: 'terminated', changed: false };
  }
  if (currentKey === 'waitlist') {
    return { statusKey: 'waitlist', changed: false };
  }

  const agencyIntake = parseJson(client.agency_intake_json) || {};
  const hasWeekday = await clientHasWeekdayAssignment(cid);
  const hasProvider = await clientHasProvider(cid, client);
  const returning = isReturningSchoolClient(client);
  const servicesStarted = servicesConfirmedThisSchoolYear(client);

  // Being Seen wins when this-year services are confirmed and still scheduled.
  // Returners require the provider "Mark Being Seen" action (services_started_at this year), not last year's first_service_at.
  if (servicesStarted && hasWeekday) {
    return setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.BEING_SEEN,
      actorUserId,
      note: note || 'Reconcile: services started + scheduled'
    });
  }

  // Provider + weekday bypasses fall/agency blocks → Ready to Schedule.
  // Keep Scheduled if already there; Being Seen is handled above.
  if (hasWeekday) {
    const schoolYear = computeCurrentSchoolYearLabel();
    const [fallDispRows] = await pool.execute(
      `SELECT fall_outcome, fall_completed_at, fall_remove_from_assignment, agency_cleared_at, agency_clearance_json
       FROM client_year_dispositions
       WHERE client_id = ? AND school_year = ?
       LIMIT 1`,
      [cid, schoolYear]
    );
    if (needsFallReassignmentClearance({ client, disposition: fallDispRows?.[0] || null })) {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING,
        actorUserId,
        note: note || 'Fall pushback — agency reassignment clearance pending'
      });
    }
    if (currentKey === 'scheduled') {
      return { statusKey: 'scheduled', changed: false };
    }
    if (currentKey === 'being_seen' && returning && !servicesStarted) {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.SCHEDULED,
        actorUserId,
        note: note || 'Reconcile: last-year Being Seen without this-year confirmation → Scheduled'
      });
    }
    return setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
      actorUserId,
      note: note || 'Reconcile: provider + weekday → ready to schedule'
    });
  }

  // Year disposition (continuing clients)
  const schoolYear = computeCurrentSchoolYearLabel();
  const [dispRows] = await pool.execute(
    `SELECT * FROM client_year_dispositions
     WHERE client_id = ? AND school_year = ?
     LIMIT 1`,
    [cid, schoolYear]
  );
  const disp = dispRows?.[0] || null;

  if (disp) {
    if (disp.fall_outcome === 'recommend_termination') {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.RECOMMEND_TERMINATION,
        actorUserId,
        note: note || 'Reconcile: fall recommend termination'
      });
    }
    if (disp.fall_outcome === 'unable_to_reach') {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.UNABLE_TO_REACH,
        actorUserId,
        note: note || 'Reconcile: fall unable to reach'
      });
    }
    if (disp.fall_outcome === 'other_transfer') {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.OTHER_TRANSFER,
        actorUserId,
        note: note || 'Reconcile: fall other/transfer'
      });
    }
    if (disp.fall_outcome === 'confirmed_returning' && disp.agency_cleared_at && hasProvider) {
      if (hasWeekday) {
        return setClientLifecycleStatus({
          clientId: cid,
          statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
          actorUserId,
          note: note || 'Reconcile: fall confirmed + agency cleared'
        });
      }
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.NEEDS_DAY_ASSIGNMENT,
        actorUserId,
        note: note || 'Reconcile: provider assigned, day needed'
      });
    }
    if (disp.fall_outcome === 'confirmed_returning') {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.CONFIRMED_RETURNING,
        actorUserId,
        note: note || 'Reconcile: fall confirmed returning'
      });
    }
    if (!disp.fall_completed_at && disp.spring_outcome === 'returning') {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING,
        actorUserId,
        note: note || 'Reconcile: fall confirmation pending'
      });
    }
    if (!disp.fall_completed_at && (disp.spring_outcome === 'unknown' || !disp.spring_outcome)) {
      if (!disp.spring_completed_at) {
        return setClientLifecycleStatus({
          clientId: cid,
          statusKey: LIFECYCLE_STATUS_KEYS.SPRING_UPDATE_PENDING,
          actorUserId,
          note: note || 'Reconcile: spring update pending'
        });
      }
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.CONTINUATION_UNKNOWN,
        actorUserId,
        note: note || 'Reconcile: continuation unknown'
      });
    }
    if (disp.spring_outcome === 'returning' && disp.spring_completed_at && !disp.fall_completed_at) {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.RETURNING,
        actorUserId,
        note: note || 'Reconcile: spring returning'
      });
    }
    if (disp.spring_outcome === 'not_returning') {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.NOT_RETURNING,
        actorUserId,
        note: note || 'Reconcile: spring not returning'
      });
    }
  }

  // New-client path
  if (agencyIntake.pendingCorrections === true) {
    return setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.PENDING_CORRECTIONS,
      actorUserId,
      note: note || 'Reconcile: pending corrections'
    });
  }

  if (hasProvider && agencyIntake.agencyIntakeComplete === true) {
    if (hasWeekday) {
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
        actorUserId,
        note: note || 'Reconcile: agency intake complete + provider assigned'
      });
    }
    return setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.NEEDS_DAY_ASSIGNMENT,
      actorUserId,
      note: note || 'Reconcile: provider assigned, day needed'
    });
  }

  // Staff onboarded (legacy) or agency in process
  if (client.staff_onboarding_completed_at || agencyIntake.inProcess === true || hasProvider) {
    if (hasProvider && (agencyIntake.agencyIntakeComplete === true || client.staff_onboarding_completed_at)) {
      if (hasWeekday) {
        return setClientLifecycleStatus({
          clientId: cid,
          statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
          actorUserId,
          note: note || 'Reconcile: ready to schedule'
        });
      }
      return setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.NEEDS_DAY_ASSIGNMENT,
        actorUserId,
        note: note || 'Reconcile: provider assigned, day needed'
      });
    }
    return setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.IN_PROCESS,
      actorUserId,
      note: note || 'Reconcile: in process'
    });
  }

  // Fresh packet
  if (
    ['packet', 'received', 'pending', ''].includes(currentKey)
    || isPaperPacketClient(client)
    || String(client.source || '').toUpperCase().includes('INTAKE')
  ) {
    return setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.RECEIVED,
      actorUserId,
      note: note || 'Reconcile: received'
    });
  }

  return { statusKey: currentKey, changed: false };
}

/** Soft Schedule / weekday assign → Scheduled (not Being Seen). */
export async function markClientScheduledFromPlacement({ clientId, actorUserId = null }) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.client_type, c.services_started_at, c.first_service_at,
            c.staff_onboarding_completed_at, c.school_year, c.created_at, c.submission_date,
            cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [clientId]
  );
  const client = rows?.[0];
  if (!client) return null;
  const key = String(client.client_status_key || '').toLowerCase();
  if (TERMINAL.has(key) || key === 'waitlist' || key === 'terminated') return { statusKey: key, changed: false };

  const startedThisYear = servicesConfirmedThisSchoolYear(client);
  if (startedThisYear) {
    return setClientLifecycleStatus({
      clientId,
      statusKey: LIFECYCLE_STATUS_KEYS.BEING_SEEN,
      actorUserId,
      note: 'Services already confirmed — Being Seen on schedule placement'
    });
  }

  const eligible = new Set([
    'ready_to_schedule',
    'confirmed_returning',
    'pending',
    'onboarded',
    'packet',
    'received',
    'in_process',
    'needs_day_assignment',
    'confirmation_pending',
    'returning',
    'continuation_unknown',
    'scheduled',
    'being_seen',
    'current',
    ''
  ]);
  if (!eligible.has(key)) return { statusKey: key, changed: false };

  return setClientLifecycleStatus({
    clientId,
    statusKey: LIFECYCLE_STATUS_KEYS.SCHEDULED,
    actorUserId,
    note: 'Auto-set to Scheduled — Soft Schedule / weekday placement'
  });
}

/** Remove last weekday → Needs Day Assignment (prior to Ready to Schedule). */
export async function demoteClientWhenUnscheduled({ clientId, actorUserId = null }) {
  const hasWeekday = await clientHasWeekdayAssignment(clientId);
  if (hasWeekday) return null;

  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.client_type, c.services_started_at, c.first_service_at,
            cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [clientId]
  );
  const client = rows?.[0];
  if (!client) return null;
  const key = String(client.client_status_key || '').toLowerCase();
  if (!['scheduled', 'being_seen', 'current', 'ready_to_schedule', 'needs_day_assignment'].includes(key)) {
    return null;
  }

  return setClientLifecycleStatus({
    clientId,
    statusKey: LIFECYCLE_STATUS_KEYS.NEEDS_DAY_ASSIGNMENT,
    actorUserId,
    note: 'Needs day assignment — provider remains assigned, no weekday remaining'
  });
}

/** Provider confirms first service → Being Seen. */
export async function markClientBeingSeen({ clientId, actorUserId = null, serviceDate = null }) {
  const patch = {};
  if (serviceDate) {
    patch.services_started_at = String(serviceDate).slice(0, 10);
  } else {
    patch.services_started_at = new Date().toISOString().slice(0, 10);
  }
  if (actorUserId) patch.services_started_by_user_id = actorUserId;
  // Keep first_service_at in sync for legacy consumers
  if (!serviceDate) {
    patch.first_service_at = patch.services_started_at;
  } else {
    patch.first_service_at = String(serviceDate).slice(0, 10);
  }

  return setClientLifecycleStatus({
    clientId,
    statusKey: LIFECYCLE_STATUS_KEYS.BEING_SEEN,
    actorUserId,
    note: 'Provider confirmed services started — Being Seen',
    extraPatch: patch
  });
}

/** Agency intake complete + provider assigned → Ready to Schedule. */
export async function markClientReadyToSchedule({ clientId, actorUserId = null, note = null }) {
  return setClientLifecycleStatus({
    clientId,
    statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
    actorUserId,
    note: note || 'Agency intake complete — Ready to Schedule'
  });
}

export default {
  LIFECYCLE_STATUS_KEYS,
  setClientLifecycleStatus,
  reconcileSchoolClientStatus,
  markClientScheduledFromPlacement,
  demoteClientWhenUnscheduled,
  markClientBeingSeen,
  markClientReadyToSchedule,
  deriveLifecycleAction,
  clientHasWeekdayAssignment,
  clientHasProvider
};
