import pool from '../config/database.js';
import { enrollClientsInCompanyEvent } from './skillBuildersIntakeEnrollment.service.js';
import { syncClientStatusForEvent } from './eventClientStatusSync.service.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

async function loadEventForAgency(eventId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, organization_id, title, registration_eligible, starts_at, ends_at
     FROM company_events
     WHERE id = ? AND agency_id = ?
     LIMIT 1`,
    [eventId, agencyId]
  );
  return rows?.[0] || null;
}

async function clientEnrolledInEvent({ agencyId, clientId, eventId }) {
  const [cecRows] = await pool.execute(
    `SELECT *
     FROM company_event_clients
     WHERE company_event_id = ? AND agency_id = ? AND client_id = ?
       AND (is_active = TRUE OR is_active IS NULL)
     LIMIT 1`,
    [eventId, agencyId, clientId]
  );
  if (cecRows?.[0]) {
    return { kind: 'company_event', row: cecRows[0] };
  }

  const [sgRows] = await pool.execute(
    `SELECT sgc.*
     FROM skills_group_clients sgc
     INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
     WHERE sgc.client_id = ? AND sg.company_event_id = ?
     LIMIT 1`,
    [agencyId, clientId, eventId]
  );
  if (sgRows?.[0]) {
    return { kind: 'skills_group', row: sgRows[0] };
  }

  return null;
}

async function clientAlreadyOnTarget({ agencyId, clientId, eventId }) {
  return !!(await clientEnrolledInEvent({ agencyId, clientId, eventId }));
}

async function removeClientFromEvent({ agencyId, clientId, eventId, enrollment }) {
  if (enrollment.kind === 'company_event') {
    try {
      await pool.execute(
        `DELETE FROM company_event_client_group_assignments
         WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
        [eventId, agencyId, clientId]
      );
    } catch {
      // Optional staffing tables.
    }
    const [r] = await pool.execute(
      `DELETE FROM company_event_clients
       WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
      [eventId, agencyId, clientId]
    );
    return Number(r?.affectedRows || 0) > 0;
  }

  const [r] = await pool.execute(
    `DELETE sgc FROM skills_group_clients sgc
     INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id AND sg.agency_id = ?
     WHERE sgc.client_id = ? AND sg.company_event_id = ?`,
    [agencyId, clientId, eventId]
  );
  return Number(r?.affectedRows || 0) > 0;
}

async function applyPreservedCompanyEventWorkflow({
  agencyId,
  eventId,
  clientId,
  snapshot,
  actorUserId
}) {
  if (!snapshot) return;
  const sets = [];
  const params = [];
  const copyCols = [
    'assigned_provider_user_id',
    'intake_complete',
    'intake_completed_at',
    'intake_completed_by_user_id',
    'intake_outcome',
    'treatment_plan_complete',
    'treatment_plan_completed_at',
    'treatment_plan_completed_by_user_id',
    'confirmation_status',
    'confirmation_set_at',
    'confirmation_set_by_user_id',
    'confirmation_set_method',
    'notes'
  ];
  for (const col of copyCols) {
    if (Object.prototype.hasOwnProperty.call(snapshot, col)) {
      sets.push(`${col} = ?`);
      params.push(snapshot[col]);
    }
  }
  if (!sets.length) return;
  try {
    await pool.execute(
      `UPDATE company_event_clients
       SET ${sets.join(', ')}, enrolled_by_user_id = COALESCE(enrolled_by_user_id, ?)
       WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
      [...params, actorUserId, eventId, agencyId, clientId]
    );
    await syncClientStatusForEvent({
      clientId,
      agencyId,
      intakeOutcome: snapshot.intake_outcome,
      treatmentPlanComplete: snapshot.treatment_plan_complete === 1 || snapshot.treatment_plan_complete === true,
      actorUserId
    });
  } catch {
    // Workflow columns may be absent on older DBs — enrollment still succeeded.
  }
}

async function applyPreservedSkillsGroupState({ agencyId, eventId, clientId, snapshot }) {
  if (!snapshot) return;
  const [sgRows] = await pool.execute(
    `SELECT id FROM skills_groups WHERE company_event_id = ? AND agency_id = ? LIMIT 1`,
    [eventId, agencyId]
  );
  const sgId = Number(sgRows?.[0]?.id || 0);
  if (!sgId) return;
  try {
    await pool.execute(
      `UPDATE skills_group_clients
       SET active_for_providers = ?,
           ready_confirmed_by_user_id = ?,
           ready_confirmed_at = ?
       WHERE skills_group_id = ? AND client_id = ?`,
      [
        snapshot.active_for_providers === 1 || snapshot.active_for_providers === true ? 1 : 0,
        snapshot.ready_confirmed_by_user_id || null,
        snapshot.ready_confirmed_at || null,
        sgId,
        clientId
      ]
    );
  } catch {
    // Optional coordination columns.
  }
}

/**
 * List eligible target events when moving a registration within the same agency (tenant).
 */
export async function listSwitchTargetEvents({ agencyId, fromEventId }) {
  const aid = parsePositiveInt(agencyId);
  const fromId = parsePositiveInt(fromEventId);
  if (!aid || !fromId) {
    return { ok: false, error: 'agencyId and fromCompanyEventId are required', events: [] };
  }

  const fromEvent = await loadEventForAgency(fromId, aid);
  if (!fromEvent) {
    return { ok: false, error: 'Source event not found', events: [] };
  }

  const programOrgId = fromEvent.organization_id != null ? Number(fromEvent.organization_id) : null;

  const [rows] = await pool.execute(
    `SELECT ce.id,
            ce.title,
            ce.starts_at,
            ce.ends_at,
            ce.registration_eligible,
            ce.event_type,
            ce.organization_id,
            prog.name AS program_name
     FROM company_events ce
     LEFT JOIN agencies prog ON prog.id = ce.organization_id
     WHERE ce.agency_id = ?
       AND ce.id <> ?
     ORDER BY COALESCE(prog.name, ''), ce.starts_at ASC, ce.title ASC
     LIMIT 200`,
    [aid, fromId]
  );

  return {
    ok: true,
    fromEvent: {
      id: Number(fromEvent.id),
      title: String(fromEvent.title || '').trim(),
      organizationId: programOrgId
    },
    events: (rows || []).map((row) => ({
      id: Number(row.id),
      title: String(row.title || '').trim() || `Event ${row.id}`,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      registrationEligible: row.registration_eligible === 1 || row.registration_eligible === true,
      eventType: row.event_type || null,
      organizationId: row.organization_id != null ? Number(row.organization_id) : null,
      programName: String(row.program_name || '').trim() || null
    }))
  };
}

/**
 * Move a client from one company event registration to another within the same agency.
 */
export async function switchClientEventRegistration({
  agencyId,
  clientId,
  fromEventId,
  toEventId,
  actorUserId = null,
  preserveWorkflow = true
}) {
  const aid = parsePositiveInt(agencyId);
  const cid = parsePositiveInt(clientId);
  const fromId = parsePositiveInt(fromEventId);
  const toId = parsePositiveInt(toEventId);
  if (!aid || !cid || !fromId || !toId) {
    return { ok: false, error: 'agencyId, clientId, fromCompanyEventId, and toCompanyEventId are required' };
  }
  if (fromId === toId) {
    return { ok: false, error: 'Choose a different event' };
  }

  const [clientRows] = await pool.execute(
    `SELECT id, agency_id FROM clients WHERE id = ? LIMIT 1`,
    [cid]
  );
  const client = clientRows?.[0];
  if (!client || Number(client.agency_id) !== aid) {
    return { ok: false, error: 'Client not found in this agency' };
  }

  const fromEvent = await loadEventForAgency(fromId, aid);
  const toEvent = await loadEventForAgency(toId, aid);
  if (!fromEvent) return { ok: false, error: 'Source event not found' };
  if (!toEvent) return { ok: false, error: 'Target event not found' };

  const fromOrg = fromEvent.organization_id != null ? Number(fromEvent.organization_id) : null;
  const toOrg = toEvent.organization_id != null ? Number(toEvent.organization_id) : null;
  const crossProgram = !!(fromOrg && toOrg && fromOrg !== toOrg);

  const enrollment = await clientEnrolledInEvent({ agencyId: aid, clientId: cid, eventId: fromId });
  if (!enrollment) {
    return { ok: false, error: 'Client is not registered for the source event' };
  }

  if (await clientAlreadyOnTarget({ agencyId: aid, clientId: cid, eventId: toId })) {
    return { ok: false, error: 'Client is already registered for the target event' };
  }

  const snapshot = preserveWorkflow ? { ...enrollment.row } : null;
  const removed = await removeClientFromEvent({
    agencyId: aid,
    clientId: cid,
    eventId: fromId,
    enrollment
  });
  if (!removed) {
    return { ok: false, error: 'Could not remove the existing registration' };
  }

  const enroll = await enrollClientsInCompanyEvent({
    agencyId: aid,
    eventId: toId,
    clientIds: [cid],
    skipRegistrationCheck: true
  });
  const enrollResult = (enroll.results || []).find((r) => Number(r.clientId) === cid);
  if (!enroll.ok || !enrollResult?.ok) {
    // Best-effort rollback to the source enrollment.
    try {
      await enrollClientsInCompanyEvent({
        agencyId: aid,
        eventId: fromId,
        clientIds: [cid],
        skipRegistrationCheck: true
      });
      if (preserveWorkflow && enrollment.kind === 'company_event') {
        await applyPreservedCompanyEventWorkflow({
          agencyId: aid,
          eventId: fromId,
          clientId: cid,
          snapshot,
          actorUserId
        });
      }
    } catch {
      /* rollback failed — surface enroll error */
    }
    return {
      ok: false,
      error: enrollResult?.error || enroll.error || 'Could not enroll in the target event'
    };
  }

  if (preserveWorkflow) {
    if (enrollment.kind === 'company_event') {
      await applyPreservedCompanyEventWorkflow({
        agencyId: aid,
        eventId: toId,
        clientId: cid,
        snapshot,
        actorUserId
      });
    } else {
      await applyPreservedSkillsGroupState({
        agencyId: aid,
        eventId: toId,
        clientId: cid,
        snapshot
      });
    }
  }

  return {
    ok: true,
    fromCompanyEventId: fromId,
    toCompanyEventId: toId,
    clientId: cid,
    preservedWorkflow: !!preserveWorkflow,
    crossProgram
  };
}
