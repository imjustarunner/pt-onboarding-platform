/**
 * Side effects after Continuation of Services is saved for fall returning clients.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { notifyClientBecameCurrent } from './clientNotifications.service.js';
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
  if (!orgId || !actorUserId) return null;

  const subject = `Fall readiness follow-up — ${client.initials || client.identifier_code || `Client ${client.id}`}`;
  const lines = [
    'Fall Continuation of Services — support follow-up requested by provider.',
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
    'Continuation answers:',
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

async function removeProviderAssignment({ clientId, providerUserId, schoolOrganizationId }) {
  const cid = Number(clientId || 0);
  const pid = Number(providerUserId || 0);
  const orgId = Number(schoolOrganizationId || 0);
  if (!cid || !pid) return;
  try {
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
    // Clear legacy single-provider link if it matches
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

  if (plan !== 'continue_school' && continuation.privateComment && actorUserId) {
    try {
      const note = await ClientNotes.create(
        {
          client_id: cid,
          author_id: actorUserId,
          category: 'administrative',
          urgency: 'medium',
          is_internal_only: true,
          message: `[Fall continuation — ${plan}] ${continuation.privateComment}`
        },
        { hasAgencyAccess: true, canViewInternalNotes: true }
      );
      results.noteId = note?.id || null;
    } catch (e) {
      console.error('[fallContinuation] private note failed', e?.message || e);
    }
  }

  if (continuation.removeFromAssignment && actorUserId) {
    await removeProviderAssignment({
      clientId: cid,
      providerUserId: actorUserId,
      schoolOrganizationId: schoolOrganizationId || client.organization_id
    });
    results.removedAssignment = true;
  }

  const shouldTerminate = continuationIsTerminatedPlan(continuation);
  if (shouldTerminate) {
    const reason =
      String(continuation.privateComment || '').trim()
      || (plan === 'not_continue_school'
        ? 'Not continuing for in-school services this fall'
        : 'Fall readiness — termination recommended');
    try {
      const terminatedId = await getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: 'terminated' });
      const updates = {
        termination_reason: reason.slice(0, 1000),
        terminated_at: new Date(),
        terminated_by_user_id: actorUserId || null,
        roi_expires_at: null
      };
      if (terminatedId) updates.client_status_id = terminatedId;
      await Client.update(cid, updates, actorUserId);
      await ClientStatusHistory.create({
        client_id: cid,
        changed_by_user_id: actorUserId,
        field_changed: 'client_status_id',
        from_value: client.client_status_id ? String(client.client_status_id) : null,
        to_value: terminatedId ? String(terminatedId) : 'terminated',
        note: `Fall continuation: ${plan}`
      }).catch(() => {});
      // Deactivate all provider assignments for this client at this school
      try {
        await pool.execute(
          `UPDATE client_provider_assignments
           SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE client_id = ? AND is_active = TRUE`,
          [cid]
        );
      } catch {
        // ignore
      }
      results.terminated = true;
    } catch (e) {
      console.error('[fallContinuation] terminate failed', e?.message || e);
    }
  }

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
      const currentId = await getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: 'current' });
      if (currentId && Number(currentId) !== Number(client.client_status_id || 0)) {
        await Client.update(cid, { client_status_id: currentId }, actorUserId);
        await ClientStatusHistory.create({
          client_id: cid,
          changed_by_user_id: actorUserId,
          field_changed: 'client_status_id',
          from_value: client.client_status_id ? String(client.client_status_id) : null,
          to_value: String(currentId),
          note: 'Fall continuation: Continuing Services — marked current'
        }).catch(() => {});
        results.promoted = true;
        notifyClientBecameCurrent({
          agencyId: client.agency_id,
          schoolOrganizationId: client.organization_id,
          clientId: client.id,
          providerUserId: actorUserId || client.provider_id,
          clientNameOrIdentifier: client.identifier_code || client.full_name || client.initials,
          serviceDay: Array.isArray(continuation.serviceDays) ? continuation.serviceDays.join(', ') : client.service_day,
          intakeAt: client.intake_at ? String(client.intake_at).slice(0, 10) : null,
          firstServiceAt: client.first_service_at ? String(client.first_service_at).slice(0, 10) : null,
          parentsContactedAt: client.parents_contacted_at ? String(client.parents_contacted_at).slice(0, 10) : null,
          parentsContactedSuccessful: client.parents_contacted_successful === 1 || client.parents_contacted_successful === true,
          actorUserId
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[fallContinuation] promote current failed', e?.message || e);
    }
  }

  return results;
}

export function readContinuationFromClient(client) {
  return parseJsonMaybe(client?.continuation_services_json);
}
