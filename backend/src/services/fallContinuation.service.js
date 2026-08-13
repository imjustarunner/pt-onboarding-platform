/**
 * Side effects after Continuation of Services / Fall Update is saved for returning clients.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import { stampClientTerminationSchoolYear } from './clientTerminationSchoolYear.service.js';
import ClientNotes from '../models/ClientNotes.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import {
  continuationIsTerminatedPlan,
  parseJsonMaybe
} from '../utils/fallReadiness.js';

async function createFallSupportTicket({
  client,
  actorUserId,
  continuation,
  schoolOrganizationId
}) {
  const orgId = Number(schoolOrganizationId || client.organization_id || 0);
  const agencyId = Number(client.agency_id || 0);
  if (!orgId || !actorUserId) {
    console.warn('[fallContinuation] support ticket skipped — missing org or actor', { orgId, actorUserId, clientId: client?.id });
    return null;
  }

  const subject = `Fall update follow-up — ${client.initials || client.identifier_code || `Client ${client.id}`}`;
  const lines = [
    'Fall Update — support follow-up requested by provider.',
    '',
    `Client ID: ${client.id}`,
    `Initials: ${client.initials || '—'}`,
    `Identifier: ${client.identifier_code || '—'}`,
    `Full name: ${client.full_name || '—'}`,
    `School organization ID: ${orgId}`,
    `Agency ID: ${agencyId}`,
    `Provider user ID: ${actorUserId}`,
    `Client status: ${client.client_status_key || client.status || '—'}`,
    `Assigned day (legacy): ${client.service_day || '—'}`,
    `ROI expires: ${client.roi_expires_at ? String(client.roi_expires_at).slice(0, 10) : '—'}`,
    `Parents contacted: ${client.parents_contacted_at ? String(client.parents_contacted_at).slice(0, 10) : '—'} (successful=${client.parents_contacted_successful})`,
    `Intake at: ${client.intake_at ? String(client.intake_at).slice(0, 10) : '—'}`,
    `First service at: ${client.first_service_at ? String(client.first_service_at).slice(0, 10) : '—'}`,
    `Submission date: ${client.submission_date ? String(client.submission_date).slice(0, 10) : '—'}`,
    `Staff onboarding completed: ${client.staff_onboarding_completed_at || '—'}`,
    '',
    'Fall Update answers:',
    `Plan: ${continuation.plan}`,
    `Private comment: ${continuation.privateComment || '—'}`,
    `Support follow-up: ${continuation.supportFollowUp ? 'yes' : 'no'}`,
    `Remove from assignment: ${continuation.removeFromAssignment ? 'yes' : 'no'}`,
    `Recommend / initiate terminate: ${continuation.recommendTerminate ? 'yes' : 'no'}`,
    `Service days: ${Array.isArray(continuation.serviceDays) ? continuation.serviceDays.join(', ') : '—'}`,
    `Completed at: ${continuation.completedAt || '—'}`
  ];
  const question = lines.join('\n');

  try {
    const [result] = await pool.execute(
      `INSERT INTO support_tickets
         (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority, topic)
       VALUES (?, ?, ?, ?, ?, ?, 'open', 'medium', 'fall_readiness')`,
      [orgId, client.id, actorUserId, agencyId || null, subject, question]
    );
    const ticketId = result?.insertId;
    if (ticketId) {
      try {
        await pool.execute(
          `INSERT INTO support_ticket_messages
             (ticket_id, author_user_id, body, is_internal)
           VALUES (?, ?, ?, 0)`,
          [ticketId, actorUserId, question]
        );
      } catch {
        // message table shape may vary
      }
    }
    return ticketId || null;
  } catch (e) {
    console.error('[fallContinuation] support ticket create failed', e?.message || e);
    return null;
  }
}

async function removeProviderAssignment({ clientId, providerUserId, schoolOrganizationId, clearAll = false }) {
  const cid = Number(clientId || 0);
  const pid = Number(providerUserId || 0);
  const orgId = Number(schoolOrganizationId || 0);
  if (!cid) return;
  try {
    if (clearAll) {
      await pool.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ? AND is_active = TRUE`,
        [cid]
      );
      await pool.execute(
        `UPDATE clients SET provider_id = NULL, service_day = NULL WHERE id = ?`,
        [cid]
      );
      return;
    }
    if (!pid) return;
    if (orgId) {
      await pool.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ?
           AND provider_user_id = ?
           AND organization_id = ?
           AND is_active = TRUE`,
        [cid, pid, orgId]
      );
    } else {
      await pool.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ?
           AND provider_user_id = ?
           AND is_active = TRUE`,
        [cid, pid]
      );
    }
    await pool.execute(
      `UPDATE clients
       SET provider_id = CASE WHEN provider_id = ? THEN NULL ELSE provider_id END,
           service_day = CASE WHEN provider_id = ? OR provider_id IS NULL THEN NULL ELSE service_day END
       WHERE id = ?`,
      [pid, pid, cid]
    );
  } catch (e) {
    console.error('[fallContinuation] remove assignment failed', e?.message || e);
  }
}

/**
 * Apply continuation side effects after checklist JSON is saved.
 */
export async function applyFallContinuationSideEffects({
  clientId,
  continuation,
  actorUserId = null,
  schoolOrganizationId = null
}) {
  const cid = Number(clientId || 0);
  if (!cid || !continuation || typeof continuation !== 'object') return { ok: false };

  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) return { ok: false };

  const plan = String(continuation.plan || '');
  const results = {
    ok: true,
    noteId: null,
    ticketId: null,
    terminated: false,
    removedAssignment: false,
    promoted: false
  };

  // Persist structured fall fields for school-safe hover + Action derivation
  // (even when called from fall-confirmation Action without the checklist save path).
  try {
    await pool.execute(
      `UPDATE clients
       SET continuation_services_json = ?,
           checklist_updated_at = CURRENT_TIMESTAMP,
           checklist_updated_by_user_id = COALESCE(?, checklist_updated_by_user_id)
       WHERE id = ?`,
      [JSON.stringify(continuation), actorUserId || null, cid]
    );
  } catch (e) {
    console.warn('[fallContinuation] persist continuation json failed', e?.message || e);
  }

  if (plan !== 'continue_school' && continuation.privateComment && actorUserId) {
    try {
      const note = await ClientNotes.create(
        {
          client_id: cid,
          author_id: actorUserId,
          category: 'administrative',
          urgency: 'medium',
          is_internal_only: true,
          message: `[Fall update — ${plan}] ${continuation.privateComment}`
        },
        { hasAgencyAccess: true, canViewInternalNotes: true }
      );
      results.noteId = note?.id || null;
    } catch (e) {
      console.error('[fallContinuation] private note failed', e?.message || e);
    }
  }

  const shouldTerminate = continuationIsTerminatedPlan(continuation);

  if (continuation.removeFromAssignment && actorUserId) {
    await removeProviderAssignment({
      clientId: cid,
      providerUserId: actorUserId,
      schoolOrganizationId: schoolOrganizationId || client.organization_id,
      clearAll: shouldTerminate
    });
    results.removedAssignment = true;
  }

  if (shouldTerminate) {
    const reason =
      String(continuation.privateComment || '').trim()
      || (plan === 'not_continue_school'
        ? 'Not continuing for in-school services this fall'
        : 'Fall update — termination recommended');
    try {
      const terminatedId = await getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: 'terminated' });
      const schoolNote = String(continuation.schoolVisibleNote || '').trim();
      const updates = {
        termination_reason: (schoolNote || reason).slice(0, 1000),
        terminated_at: new Date(),
        terminated_by_user_id: actorUserId || null,
        roi_expires_at: null,
        provider_id: null,
        service_day: null
      };
      if (terminatedId) updates.client_status_id = terminatedId;
      await Client.update(cid, updates, actorUserId);
      await stampClientTerminationSchoolYear({
        clientId: cid,
        agencyId: client.agency_id,
        actorUserId
      }).catch(() => {});
      await ClientStatusHistory.create({
        client_id: cid,
        changed_by_user_id: actorUserId,
        field_changed: 'client_status_id',
        from_value: client.client_status_id ? String(client.client_status_id) : null,
        to_value: terminatedId ? String(terminatedId) : 'terminated',
        note: `Fall update: ${plan}`
      }).catch(() => {});
      await removeProviderAssignment({
        clientId: cid,
        providerUserId: actorUserId,
        schoolOrganizationId: schoolOrganizationId || client.organization_id,
        clearAll: true
      });
      results.terminated = true;
      results.removedAssignment = true;
    } catch (e) {
      console.error('[fallContinuation] terminate failed', e?.message || e);
    }
  } else if (!shouldTerminate && (continuation.removeFromAssignment || plan === 'other' || plan === 'unable_to_contact_parent')) {
    // Non-terminate fall outcomes stay Fall Confirmation Pending for school visibility / reassignment
    try {
      const { setClientLifecycleStatus, LIFECYCLE_STATUS_KEYS } = await import('./clientLifecycleStatus.service.js');
      await setClientLifecycleStatus({
        clientId: cid,
        statusKey: LIFECYCLE_STATUS_KEYS.CONFIRMATION_PENDING,
        actorUserId,
        note: `Fall update: ${plan || 'pending'} — Confirmation Pending`
      });
      // Use school-visible termination note as termination_reason only when terminating (above).
    } catch (e) {
      console.warn('[fallContinuation] demote after fall outcome failed', e?.message || e);
    }
  }

  // Support tickets ONLY when the provider explicitly requested follow-up.
  if (continuation.supportFollowUp) {
    results.ticketId = await createFallSupportTicket({
      client: { ...client, client_status_key: client.client_status_key },
      actorUserId,
      continuation,
      schoolOrganizationId: schoolOrganizationId || client.organization_id
    });
  }

  if (plan === 'continue_school' && !results.terminated) {
    try {
      const { setClientLifecycleStatus, LIFECYCLE_STATUS_KEYS, clientHasWeekdayAssignment } =
        await import('./clientLifecycleStatus.service.js');
      const hasWeekday = await clientHasWeekdayAssignment(cid);
      // Confirmed returning; Ready to Schedule only after agency clearance (dual-gate).
      // If already on Soft Schedule, keep Scheduled once agency-cleared elsewhere.
      const targetKey = hasWeekday
        ? LIFECYCLE_STATUS_KEYS.SCHEDULED
        : LIFECYCLE_STATUS_KEYS.CONFIRMED_RETURNING;
      const lifecycle = await setClientLifecycleStatus({
        clientId: cid,
        statusKey: targetKey,
        actorUserId,
        note: hasWeekday
          ? 'Fall update: Continuing Services — Scheduled (agency clearance may still be pending)'
          : 'Fall update: Continuing Services — Confirmed Returning (await agency clearance for Ready to Schedule)'
      });
      results.promoted = !!lifecycle?.changed;
      results.statusKey = lifecycle?.statusKey || targetKey;
    } catch (e) {
      console.error('[fallContinuation] promote confirmed_returning failed', e?.message || e);
    }
  }

  return results;
}

export function readContinuationFromClient(client) {
  return parseJsonMaybe(client?.continuation_services_json);
}
