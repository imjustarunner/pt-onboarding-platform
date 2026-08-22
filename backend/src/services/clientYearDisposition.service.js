/**
 * Spring / fall year dispositions for continuing school clients.
 */
import pool from '../config/database.js';
import {
  LIFECYCLE_STATUS_KEYS,
  setClientLifecycleStatus,
  reconcileSchoolClientStatus,
  clientHasWeekdayAssignment,
  clientHasProvider
} from './clientLifecycleStatus.service.js';
import { applyFallContinuationSideEffects } from './fallContinuation.service.js';
import { stampClientTerminationSchoolYear } from './clientTerminationSchoolYear.service.js';
import {
  currentSchoolYearLabelFromCalendar,
  upcomingSchoolYearLabel
} from '../utils/schoolYearCalendar.js';
import { computeCurrentSchoolYearLabel } from '../utils/schoolYear.js';
import { continuingClientDisclosureAutoOk, continuingInsuranceOverrideActive, isReturningSchoolClient, needsFallReassignmentClearance, parseJsonMaybe } from '../utils/fallReadiness.js';
import { deriveLifecycleAction } from '../utils/clientLifecycleAction.js';
import { buildClientLifecycleHistory } from '../utils/clientLifecycleHistory.js';
import { getAgencyIntake, saveAgencyIntake } from './clientAgencyIntake.service.js';
import Client from '../models/Client.model.js';

const SPRING_OUTCOMES = new Set(['returning', 'not_returning', 'unknown']);
const FALL_OUTCOMES = new Set([
  'confirmed_returning',
  'unable_to_reach',
  'recommend_termination',
  'other_transfer'
]);

export async function getDisposition({ clientId, schoolYear }) {
  const [rows] = await pool.execute(
    `SELECT * FROM client_year_dispositions
     WHERE client_id = ? AND school_year = ?
     LIMIT 1`,
    [clientId, schoolYear]
  );
  return rows?.[0] || null;
}

export async function upsertDispositionBase({ clientId, agencyId, schoolYear }) {
  await pool.execute(
    `INSERT INTO client_year_dispositions (client_id, agency_id, school_year)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    [clientId, agencyId, schoolYear]
  );
  return getDisposition({ clientId, schoolYear });
}

/**
 * Open spring update for all non-terminated school clients in an agency.
 */
export async function openSpringUpdateForAgency({ agencyId, schoolYear = null, actorUserId = null }) {
  const year = schoolYear || computeCurrentSchoolYearLabel();
  const [clients] = await pool.execute(
    `SELECT c.id, c.agency_id, cs.status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.agency_id = ?
       AND c.client_type = 'school'
       AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
       AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('terminated', 'archived', 'waitlist')`,
    [agencyId]
  );

  let opened = 0;
  for (const c of clients || []) {
    await upsertDispositionBase({ clientId: c.id, agencyId, schoolYear: year });
    const disp = await getDisposition({ clientId: c.id, schoolYear: year });
    if (disp?.spring_completed_at) continue;
    await setClientLifecycleStatus({
      clientId: c.id,
      statusKey: LIFECYCLE_STATUS_KEYS.SPRING_UPDATE_PENDING,
      actorUserId,
      note: `Spring Update opened for ${year}`
    });
    opened += 1;
  }
  return { opened, schoolYear: year, clientCount: (clients || []).length };
}

export async function saveSpringUpdate({
  clientId,
  agencyId,
  schoolYear = null,
  springOutcome,
  summerPlan = null,
  fallPlan = null,
  actorUserId = null
}) {
  const year = schoolYear || computeCurrentSchoolYearLabel();
  const outcome = String(springOutcome || '').toLowerCase();
  if (!SPRING_OUTCOMES.has(outcome)) {
    throw Object.assign(new Error('Select Returning, Not Returning, or Unknown'), { status: 400 });
  }

  await upsertDispositionBase({ clientId, agencyId, schoolYear: year });
  await pool.execute(
    `UPDATE client_year_dispositions
     SET spring_outcome = ?,
         summer_plan_json = ?,
         fall_plan_json = ?,
         spring_completed_at = CURRENT_TIMESTAMP,
         spring_completed_by_user_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND school_year = ?`,
    [
      outcome,
      summerPlan ? JSON.stringify(summerPlan) : null,
      fallPlan ? JSON.stringify(fallPlan) : null,
      actorUserId || null,
      clientId,
      year
    ]
  );

  // Carry returning/unknown into upcoming year disposition row
  if (outcome === 'returning' || outcome === 'unknown') {
    const upcoming = upcomingSchoolYearLabel();
    await upsertDispositionBase({ clientId, agencyId, schoolYear: upcoming });
    await pool.execute(
      `UPDATE client_year_dispositions
       SET spring_outcome = ?,
           summer_plan_json = ?,
           fall_plan_json = ?,
           spring_completed_at = CURRENT_TIMESTAMP,
           spring_completed_by_user_id = ?
       WHERE client_id = ? AND school_year = ?`,
      [
        outcome,
        summerPlan ? JSON.stringify(summerPlan) : null,
        fallPlan ? JSON.stringify(fallPlan) : null,
        actorUserId || null,
        clientId,
        upcoming
      ]
    );
  }

  let statusKey = LIFECYCLE_STATUS_KEYS.CONTINUATION_UNKNOWN;
  if (outcome === 'returning') statusKey = LIFECYCLE_STATUS_KEYS.RETURNING;
  if (outcome === 'not_returning') statusKey = LIFECYCLE_STATUS_KEYS.NOT_RETURNING;

  await setClientLifecycleStatus({
    clientId,
    statusKey,
    actorUserId,
    note: `Spring Update completed: ${outcome}`
  });

  return getDisposition({ clientId, schoolYear: year });
}

export async function saveFallConfirmation({
  clientId,
  agencyId,
  schoolYear = null,
  fallOutcome,
  privateComment = '',
  supportFollowUp = false,
  removeFromAssignment = false,
  contactAttempts = null,
  otherReasonKey = null,
  schoolVisibleNote = null,
  recommendTerminate = null,
  attestSawLastYear = false,
  serviceDays = null,
  actorUserId = null
}) {
  const year = schoolYear || currentSchoolYearLabelFromCalendar();
  const outcome = String(fallOutcome || '').toLowerCase();
  if (!FALL_OUTCOMES.has(outcome)) {
    throw Object.assign(new Error('Select a fall confirmation outcome'), { status: 400 });
  }
  const comment = String(privateComment || '').trim();
  if (outcome !== 'confirmed_returning' && !comment) {
    throw Object.assign(new Error('A private comment for admin/support is required'), { status: 400 });
  }

  if (attestSawLastYear) {
    const [anchorRows] = await pool.execute(
      `SELECT submission_date, created_at FROM clients WHERE id = ? LIMIT 1`,
      [clientId]
    );
    const row = anchorRows?.[0] || {};
    const anchor = row.submission_date || row.created_at || new Date();
    const anchorDate = new Date(anchor);
    const ymd = Number.isFinite(anchorDate.getTime())
      ? anchorDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    await pool.execute(
      `UPDATE clients
       SET parents_contacted_at = COALESCE(parents_contacted_at, ?),
           parents_contacted_successful = 1,
           first_service_at = COALESCE(first_service_at, ?),
           services_started_at = COALESCE(services_started_at, ?)
       WHERE id = ?`,
      [ymd, ymd, ymd, clientId]
    );
  }

  await upsertDispositionBase({ clientId, agencyId, schoolYear: year });
  await pool.execute(
    `UPDATE client_year_dispositions
     SET fall_outcome = ?,
         fall_comment = ?,
         fall_support_follow_up = ?,
         fall_remove_from_assignment = ?,
         fall_completed_at = CURRENT_TIMESTAMP,
         fall_completed_by_user_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND school_year = ?`,
    [
      outcome,
      comment || null,
      supportFollowUp ? 1 : 0,
      removeFromAssignment ? 1 : 0,
      actorUserId || null,
      clientId,
      year
    ]
  );

  const shouldTerminate =
    outcome === 'recommend_termination'
    || recommendTerminate === true
    || recommendTerminate === 'true'
    || recommendTerminate === 1;

  // Side effects for non-continue paths via fall continuation helper shape
  if (outcome !== 'confirmed_returning') {
    const planMap = {
      unable_to_reach: 'unable_to_contact_parent',
      recommend_termination: 'not_continue_school',
      other_transfer: 'other'
    };
    await applyFallContinuationSideEffects({
      clientId,
      continuation: {
        plan: planMap[outcome] || 'other',
        privateComment: comment,
        supportFollowUp: !!supportFollowUp,
        removeFromAssignment: !!removeFromAssignment || shouldTerminate,
        recommendTerminate: shouldTerminate,
        otherReasonKey: otherReasonKey || (outcome === 'other_transfer' ? 'custom' : undefined),
        contactAttempts: contactAttempts != null ? Number(contactAttempts) : undefined,
        schoolVisibleNote: schoolVisibleNote || undefined
      },
      actorUserId
    });
  }

  // Non-continue non-terminate outcomes surface as Fall Confirmation Pending for school staff.
  // Terminations are applied inside applyFallContinuationSideEffects — don't overwrite status.
  const statusMap = {
    confirmed_returning: LIFECYCLE_STATUS_KEYS.CONFIRMED_RETURNING,
    unable_to_reach: LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING,
    recommend_termination: LIFECYCLE_STATUS_KEYS.TERMINATED,
    other_transfer: LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING
  };
  if (!shouldTerminate && outcome !== 'recommend_termination') {
    await setClientLifecycleStatus({
      clientId,
      statusKey: statusMap[outcome],
      actorUserId,
      note: `Fall confirmation: ${outcome}`
    });
  }

  // If confirmed and already agency-cleared → Ready to Schedule.
  // Through 2026-08-16, continuing clients are not blocked on insurance.
  const disp = await getDisposition({ clientId, schoolYear: year });
  if (outcome === 'confirmed_returning') {
    const insuranceOverride = continuingInsuranceOverrideActive();
    if (disp?.agency_cleared_at || insuranceOverride) {
      await setClientLifecycleStatus({
        clientId,
        statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
        actorUserId,
        note: insuranceOverride && !disp?.agency_cleared_at
          ? 'Fall confirmed — insurance check waived through 8/16 — Ready to Schedule'
          : 'Fall confirmed + agency already cleared — Ready to Schedule'
      });
    }
  }

  return getDisposition({ clientId, schoolYear: year });
}

export async function saveAgencyClearance({
  clientId,
  agencyId,
  schoolYear = null,
  clearance = {},
  actorUserId = null
}) {
  const year = schoolYear || currentSchoolYearLabelFromCalendar();
  // ROI is tracked in-system and is NOT part of the Ready-to-Schedule gate.
  // Gate = assigned provider on disclosure (auto-ok when same provider / disclosure_required=0) + insurance.
  const [clientRows] = await pool.execute(
    `SELECT c.id, c.disclosure_required, c.provider_id, c.client_type, cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ? LIMIT 1`,
    [clientId]
  );
  const client = clientRows?.[0] || {};
  const continuingDisclosureOk = continuingClientDisclosureAutoOk(client);
  const sameProviderDisclosureOk = !(client.disclosure_required === 1 || client.disclosure_required === true);
  const insuranceOverride = continuingInsuranceOverrideActive() && continuingClientDisclosureAutoOk(client);
  const nextClearance = {
    disclosureOk: clearance.disclosureOk === true || continuingDisclosureOk || sameProviderDisclosureOk,
    insuranceOk: clearance.insuranceOk === true || insuranceOverride,
    roiNoted: clearance.roiNoted === true || clearance.roiUnexpired === true,
    sameProviderAutoDisclosure: sameProviderDisclosureOk,
    continuingAutoDisclosure: continuingDisclosureOk,
    insuranceOverride,
    updatedAt: new Date().toISOString()
  };
  if (!nextClearance.disclosureOk) {
    throw Object.assign(new Error('Confirm assigned provider is on disclosure (or keep the same provider from last year)'), { status: 400 });
  }
  if (!nextClearance.insuranceOk) {
    throw Object.assign(new Error('Insurance / eligibility check is required'), { status: 400 });
  }

  await upsertDispositionBase({ clientId, agencyId, schoolYear: year });
  await pool.execute(
    `UPDATE client_year_dispositions
     SET agency_cleared_at = CURRENT_TIMESTAMP,
         agency_cleared_by_user_id = ?,
         agency_clearance_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND school_year = ?`,
    [actorUserId || null, JSON.stringify(nextClearance), clientId, year]
  );

  const disp = await getDisposition({ clientId, schoolYear: year });
  if (disp?.fall_outcome === 'confirmed_returning' || !disp?.fall_outcome) {
    const [statusRows] = await pool.execute(
      `SELECT cs.status_key
       FROM clients c
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE c.id = ? LIMIT 1`,
      [clientId]
    );
    const key = String(statusRows?.[0]?.status_key || '').toLowerCase();
    if (['confirmed_returning', 'ready_to_schedule', 'scheduled', 'current', 'pending', 'onboarded', ''].includes(key)) {
      await setClientLifecycleStatus({
        clientId,
        statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
        actorUserId,
        note: 'Agency clearance (disclosure + insurance) complete — Ready to Schedule'
      });
    }
  }

  return getDisposition({ clientId, schoolYear: year });
}

/**
 * Waitlist from fall reassignment (provider pushback) — does not clear agency_cleared_at;
 * client moves to Waitlist and the fall reassignment action drops off the roster.
 */
export async function saveFallReassignmentWaitlist({
  clientId,
  schoolYear = null,
  waitlistReason = '',
  actorUserId = null
}) {
  const year = schoolYear || currentSchoolYearLabelFromCalendar();
  const reason = String(waitlistReason || '').trim();

  await setClientLifecycleStatus({
    clientId,
    statusKey: LIFECYCLE_STATUS_KEYS.WAITLIST,
    actorUserId,
    note: reason
      ? `Waitlisted from fall reassignment: ${reason.slice(0, 500)}`
      : 'Waitlisted from fall reassignment',
    extraPatch: { waitlist_started_at: new Date() }
  });

  if (reason && actorUserId) {
    const ClientNotes = (await import('../models/ClientNotes.model.js')).default;
    await ClientNotes.upsertSharedSingletonByClientAndCategory({
      clientId,
      category: 'waitlist',
      message: reason,
      actorUserId
    }).catch((err) => {
      console.error('[saveFallReassignmentWaitlist] waitlist note upsert failed', err?.message || err);
    });
  }

  return getDisposition({ clientId, schoolYear: year });
}

/**
 * Update a waitlisted client: optional assignments (saved separately), reason, clearance,
 * intake items, and optionally remove from waitlist.
 */
export async function saveWaitlistResolution({
  clientId,
  schoolYear = null,
  waitlistReason,
  removeFromWaitlist = false,
  clearAllAndMarkActive = false,
  clearance = null,
  intake = null,
  actorUserId = null
}) {
  const year = schoolYear || currentSchoolYearLabelFromCalendar();
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
  const statusKey = String(client.client_status_key || '').toLowerCase();
  if (statusKey !== 'waitlist') {
    throw Object.assign(new Error('Client is not on the waitlist'), { status: 400 });
  }

  const disp = await getDisposition({ clientId, schoolYear: year });
  const reason = waitlistReason !== undefined ? String(waitlistReason || '').trim() : null;
  const fallPending = needsFallReassignmentClearance({ client, disposition: disp });

  if (reason !== null) {
    const prev = parseJsonMaybe(client.agency_intake_json) || {};
    const next = {
      ...prev,
      waitlistReason: reason,
      waitlisted: !removeFromWaitlist,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actorUserId || null
    };
    await Client.update(clientId, { agency_intake_json: JSON.stringify(next) }, actorUserId);
    if (reason && actorUserId) {
      const ClientNotes = (await import('../models/ClientNotes.model.js')).default;
      await ClientNotes.upsertSharedSingletonByClientAndCategory({
        clientId,
        category: 'waitlist',
        message: reason,
        actorUserId
      }).catch((err) => {
        console.error('[saveWaitlistResolution] waitlist note upsert failed', err?.message || err);
      });
    }
  }

  if (!removeFromWaitlist && !clearAllAndMarkActive) {
    return {
      clientId,
      statusKey: 'waitlist',
      disposition: disp
    };
  }

  if (clearAllAndMarkActive) {
    const hasProvider = await clientHasProvider(clientId, client);
    const hasWeekday = await clientHasWeekdayAssignment(clientId);
    if (!hasProvider || !hasWeekday) {
      throw Object.assign(
        new Error('Assign a provider and weekday before using Clear all and mark active'),
        { status: 400 }
      );
    }

    const prev = parseJsonMaybe(client.agency_intake_json) || {};
    const nextIntake = {
      ...prev,
      waitlisted: false,
      waitlistReason: reason ?? prev.waitlistReason ?? '',
      insuranceReviewed: true,
      ehrTransferred: true,
      paperComplete: true,
      pendingCorrections: false,
      agencyIntakeComplete: true,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actorUserId || null
    };
    await Client.update(clientId, { agency_intake_json: JSON.stringify(nextIntake) }, actorUserId);
    if (!client.staff_onboarding_completed_at) {
      await Client.update(clientId, { staff_onboarding_completed_at: new Date() }, actorUserId);
    }

    await setClientLifecycleStatus({
      clientId,
      statusKey: LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING,
      actorUserId,
      note: 'Clear all and mark active — removed from waitlist'
    });

    await saveAgencyClearance({
      clientId,
      agencyId: client.agency_id,
      schoolYear: year,
      clearance: { disclosureOk: true, insuranceOk: true },
      actorUserId
    });

    const reconciled = await reconcileSchoolClientStatus({
      clientId,
      actorUserId,
      note: 'Clear all and mark active — post-waitlist reconcile'
    });

    return {
      clientId,
      statusKey: reconciled?.statusKey || LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
      disposition: await getDisposition({ clientId, schoolYear: year })
    };
  }

  const intakePayload = intake && typeof intake === 'object' ? intake : null;
  const hasIntakePatch = intakePayload
    && (intakePayload.insuranceReviewed !== undefined
      || intakePayload.ehrTransferred !== undefined
      || intakePayload.paperComplete !== undefined
      || intakePayload.missingItems !== undefined);

  if (hasIntakePatch) {
    await saveAgencyIntake({
      clientId,
      payload: {
        ...intakePayload,
        waitlisted: false,
        waitlistReason: reason ?? ''
      },
      actorUserId
    });
    const [reloaded] = await pool.execute(
      `SELECT cs.status_key AS client_status_key FROM clients c
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id WHERE c.id = ? LIMIT 1`,
      [clientId]
    );
    const keyAfterIntake = String(reloaded?.[0]?.client_status_key || '').toLowerCase();
    if (keyAfterIntake !== 'waitlist') {
      if (fallPending && clearance?.disclosureOk && clearance?.insuranceOk) {
        await saveAgencyClearance({
          clientId,
          agencyId: client.agency_id,
          schoolYear: year,
          clearance,
          actorUserId
        }).catch(() => {});
      }
      await reconcileSchoolClientStatus({ clientId, actorUserId, note: 'Post-waitlist reconcile' });
      return {
        clientId,
        statusKey: keyAfterIntake,
        disposition: await getDisposition({ clientId, schoolYear: year })
      };
    }
  }

  const returning = isReturningSchoolClient(client);
  const stagingKey = returning ? LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING : LIFECYCLE_STATUS_KEYS.IN_PROCESS;
  await setClientLifecycleStatus({
    clientId,
    statusKey: stagingKey,
    actorUserId,
    note: reason ? `Removed from waitlist: ${reason.slice(0, 200)}` : 'Removed from waitlist'
  });

  if (clearance?.disclosureOk && clearance?.insuranceOk) {
    await saveAgencyClearance({
      clientId,
      agencyId: client.agency_id,
      schoolYear: year,
      clearance,
      actorUserId
    });
  }

  const reconciled = await reconcileSchoolClientStatus({
    clientId,
    actorUserId,
    note: 'Post-waitlist reconcile'
  });

  return {
    clientId,
    statusKey: reconciled?.statusKey || stagingKey,
    disposition: await getDisposition({ clientId, schoolYear: year })
  };
}

/**
 * Non-blocking ROI follow-up acknowledgement. Does NOT set agency_cleared_at
 * and does NOT promote Ready to Schedule.
 */
export async function noteRoiFollowup({
  clientId,
  agencyId,
  schoolYear = null,
  actorUserId = null
}) {
  const year = schoolYear || currentSchoolYearLabelFromCalendar();
  await upsertDispositionBase({ clientId, agencyId, schoolYear: year });
  const existing = await getDisposition({ clientId, schoolYear: year });
  let prev = {};
  try {
    prev = existing?.agency_clearance_json
      ? (typeof existing.agency_clearance_json === 'string'
        ? JSON.parse(existing.agency_clearance_json)
        : existing.agency_clearance_json)
      : {};
  } catch {
    prev = {};
  }
  const nextClearance = {
    ...(prev && typeof prev === 'object' ? prev : {}),
    roiNoted: true,
    roiNotedAt: new Date().toISOString(),
    roiNotedByUserId: actorUserId || null
  };
  await pool.execute(
    `UPDATE client_year_dispositions
     SET agency_clearance_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE client_id = ? AND school_year = ?`,
    [JSON.stringify(nextClearance), clientId, year]
  );
  return getDisposition({ clientId, schoolYear: year });
}

function parseClearanceJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Mark insurance/eligibility clear for school clients who have an assigned provider
 * and currently show the agency "Insurance check" action. Does not change lifecycle status.
 */
export async function markInsuranceOkForAssignedProviders({
  actorUserId = null,
  agencyId = null,
  dryRun = false
} = {}) {
  const year = currentSchoolYearLabelFromCalendar();
  const agencyClause = Number(agencyId) > 0 ? 'AND c.agency_id = ?' : '';
  const params = Number(agencyId) > 0 ? [year, Number(agencyId)] : [year];
  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.provider_id, c.client_type, c.disclosure_required,
            cs.status_key AS client_status_key,
            cyd.agency_clearance_json, cyd.agency_cleared_at,
            c.continuation_services_json
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     LEFT JOIN client_year_dispositions cyd
       ON cyd.client_id = c.id AND cyd.school_year = ?
     WHERE (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
       AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('terminated', 'waitlist')
       AND (
         (c.provider_id IS NOT NULL AND c.provider_id > 0)
         OR EXISTS (
           SELECT 1 FROM client_provider_assignments cpa
           WHERE cpa.client_id = c.id AND cpa.is_active = TRUE
         )
       )
       ${agencyClause}`,
    params
  );

  let updated = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();
  for (const row of rows || []) {
    const client = { ...row, has_provider: true };
    const action = deriveLifecycleAction({
      client,
      viewerRole: 'admin',
      disposition: row
    });
    if (action?.label !== 'Insurance check') {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      updated += 1;
      continue;
    }
    await upsertDispositionBase({
      clientId: row.id,
      agencyId: row.agency_id,
      schoolYear: year
    });
    const existing = await getDisposition({ clientId: row.id, schoolYear: year });
    const nextClearance = {
      ...parseClearanceJson(existing?.agency_clearance_json || row.agency_clearance_json),
      insuranceOk: true,
      insuranceBulkClearedAt: nowIso,
      insuranceBulkClearedByUserId: actorUserId || null
    };
    await pool.execute(
      `UPDATE client_year_dispositions
       SET agency_clearance_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND school_year = ?`,
      [JSON.stringify(nextClearance), row.id, year]
    );
    updated += 1;
  }
  return { updated, skipped, considered: (rows || []).length, schoolYear: year };
}

/**
 * On July rollover: set confirmation_pending / continuation_unknown for carried clients.
 */
export async function applyJulyRolloverStatuses({ agencyId, actorUserId = null }) {
  const year = currentSchoolYearLabelFromCalendar();
  const [rows] = await pool.execute(
    `SELECT d.client_id, d.spring_outcome, d.fall_completed_at
     FROM client_year_dispositions d
     JOIN clients c ON c.id = d.client_id
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE d.agency_id = ?
       AND d.school_year = ?
       AND c.client_type = 'school'
       AND LOWER(COALESCE(cs.status_key, '')) NOT IN ('terminated', 'archived', 'being_seen', 'scheduled')`,
    [agencyId, year]
  );

  let updated = 0;
  for (const r of rows || []) {
    if (r.fall_completed_at) continue;
    const key =
      r.spring_outcome === 'returning'
        ? LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING
        : LIFECYCLE_STATUS_KEYS.CONTINUATION_UNKNOWN;
    await setClientLifecycleStatus({
      clientId: r.client_id,
      statusKey: key,
      actorUserId,
      note: `July rollover — ${key}`
    });
    updated += 1;
  }
  return { updated, schoolYear: year };
}

export async function listDispositionsForClient(clientId) {
  const [rows] = await pool.execute(
    `SELECT * FROM client_year_dispositions
     WHERE client_id = ?
     ORDER BY school_year ASC`,
    [clientId]
  );
  return rows || [];
}

export async function getClientLifecycleHistory({ client }) {
  const [dispositions, agencyIntake] = await Promise.all([
    listDispositionsForClient(client.id),
    getAgencyIntake(client.id).catch(() => null)
  ]);
  const currentYear = currentSchoolYearLabelFromCalendar();
  const currentDisp = (dispositions || []).find((row) => String(row.school_year) === currentYear) || null;
  const pendingActions = [];
  for (const role of ['provider', 'admin']) {
    const action = deriveLifecycleAction({
      client,
      viewerRole: role,
      disposition: currentDisp
    });
    if (!action?.actionKey) continue;
    if (pendingActions.some((p) => p.actionKey === action.actionKey && p.role === action.role)) continue;
    pendingActions.push(action);
  }
  return buildClientLifecycleHistory({
    client,
    dispositions,
    agencyIntake,
    pendingActions
  });
}
