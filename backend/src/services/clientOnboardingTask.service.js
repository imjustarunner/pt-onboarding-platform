/**
 * Provider client lifecycle tasks (new client / fall / assign day / being seen).
 * Created when the provider has an actionable lifecycle step; completed when it clears.
 */
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import pool from '../config/database.js';
import { deriveLifecycleAction } from '../utils/clientLifecycleAction.js';

const LIFECYCLE_SOURCES = new Set(['client_assignment', 'client_lifecycle']);

/** Provider actions that become Tasks Hub items. Quiet fall "Update" is skipped. */
const TASKABLE_ACTION_KEYS = new Set([
  'provider_intake',
  'fall_confirmation',
  'assign_day',
  'confirm_services_started',
  'spring_update'
]);

const ACTION_TITLE_PREFIX = {
  provider_intake: 'New client on your caseload',
  fall_confirmation: 'Fall confirmation – Action Needed',
  assign_day: 'Assign day – Action Needed',
  confirm_services_started: 'Mark Being Seen',
  spring_update: 'Spring Update – Action Needed'
};

const DEFAULT_SUBTASKS = {
  provider_intake: [
    { id: '1', title: 'Contact guardian/parent (record contact date + success)', is_completed: false },
    { id: '2', title: 'Set first intake completed date', is_completed: false },
    { id: '3', title: 'Set first service / success date (marks Being Seen when done)', is_completed: false }
  ],
  fall_confirmation: [
    { id: '1', title: 'Confirm returning / not returning for this school year', is_completed: false },
    { id: '2', title: 'Set assigned day(s) if returning', is_completed: false }
  ],
  assign_day: [
    { id: '1', title: 'Assign a weekday on Soft Schedule', is_completed: false }
  ],
  confirm_services_started: [
    { id: '1', title: 'Confirm services started this school year', is_completed: false }
  ],
  spring_update: [
    { id: '1', title: 'Complete spring update for this client', is_completed: false }
  ]
};

/**
 * Prefer a human label (initials / name) over numeric codes or bare IDs.
 * identifier_code is used only when it is not purely numeric.
 */
export function resolveClientDisplayLabel(client, clientId = null) {
  const id = Number(clientId || client?.id || 0) || null;
  const initials = String(client?.initials || '').trim();
  if (initials) return initials;

  const fullName = String(client?.full_name || '').trim();
  if (fullName) return fullName;

  const firstLast = [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim();
  if (firstLast) return firstLast;

  const code = String(client?.identifier_code || '').trim();
  if (code && !/^\d+$/.test(code)) return code;

  if (id) return `Client #${id}`;
  return 'Client';
}

async function loadClientForLifecycleTask(clientId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.organization_id, c.client_type, c.initials, c.identifier_code,
            c.full_name, c.first_name, c.last_name, c.provider_id, c.service_day,
            c.services_started_at, c.first_service_at, c.school_year, c.created_at, c.submission_date,
            c.agency_intake_json, c.agency_clearance_json, c.continuation_services_json,
            c.disclosure_required, cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [clientId]
  );
  return rows?.[0] || null;
}

async function loadActiveProviderIds(clientId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT provider_user_id
     FROM client_provider_assignments
     WHERE client_id = ? AND is_active = TRUE AND provider_user_id IS NOT NULL`,
    [clientId]
  );
  const ids = (rows || [])
    .map((r) => Number(r.provider_user_id))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(ids)];
}

async function findOpenLifecycleTasks(providerUserId, clientId) {
  const [rows] = await pool.execute(
    `SELECT id, title, metadata, status
     FROM tasks
     WHERE task_type = 'custom'
       AND assigned_to_user_id = ?
       AND status NOT IN ('completed', 'overridden')
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.clientId')) = ?
     ORDER BY id ASC`,
    [providerUserId, String(clientId)]
  );
  return (rows || []).filter((row) => {
    let meta = row.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = null; }
    }
    const source = String(meta?.source || '');
    return LIFECYCLE_SOURCES.has(source) || meta?.actionKey || meta?.clientId != null;
  }).map((row) => {
    let meta = row.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    return { ...row, metadata: meta && typeof meta === 'object' ? meta : {} };
  });
}

function buildTitle(actionKey, clientLabel) {
  const prefix = ACTION_TITLE_PREFIX[actionKey] || 'Client action needed';
  return `${prefix}: ${clientLabel}`;
}

function buildDescription(actionKey, serviceDay) {
  if (actionKey === 'provider_intake') {
    return serviceDay
      ? `Scheduled for ${serviceDay}. Complete new-client steps from this task (same as Clients).`
      : 'Complete new-client steps from this task (same as Clients). Available once the client is Ready to Schedule.';
  }
  if (actionKey === 'fall_confirmation') {
    return 'Complete fall confirmation from this task (same as Clients).';
  }
  if (actionKey === 'assign_day') {
    return 'Assign a weekday from this task (same as Clients).';
  }
  if (actionKey === 'confirm_services_started') {
    return 'Confirm services started this school year from this task.';
  }
  if (actionKey === 'spring_update') {
    return 'Complete the spring update from this task.';
  }
  return 'Complete this client action from Tasks (same flow as Clients).';
}

async function upsertLifecycleTask({
  providerUserId,
  clientId,
  clientLabel,
  actionKey,
  actionLabel,
  serviceDay,
  assignedByUserId
}) {
  const open = await findOpenLifecycleTasks(providerUserId, clientId);
  const title = buildTitle(actionKey, clientLabel);
  const description = buildDescription(actionKey, serviceDay);
  const baseMeta = {
    clientId: Number(clientId),
    source: 'client_lifecycle',
    actionKey,
    actionLabel: actionLabel || ACTION_TITLE_PREFIX[actionKey] || 'Action Needed',
    serviceDay: serviceDay || null,
    subtasks: (DEFAULT_SUBTASKS[actionKey] || []).map((s) => ({ ...s }))
  };

  if (open.length) {
    const primary = open[0];
    const mergedMeta = {
      ...primary.metadata,
      ...baseMeta,
      // Keep existing subtask completion state when actionKey unchanged
      subtasks: String(primary.metadata?.actionKey || '') === actionKey
        && Array.isArray(primary.metadata?.subtasks)
        && primary.metadata.subtasks.length
        ? primary.metadata.subtasks
        : baseMeta.subtasks
    };
    await Task.updateCustomTask(primary.id, {
      title,
      description,
      urgency: 'high',
      metadata: mergedMeta
    });
    // Complete duplicate open lifecycle tasks for the same client
    for (const dup of open.slice(1)) {
      try {
        await Task.markComplete(dup.id, assignedByUserId || providerUserId);
      } catch {
        // best-effort
      }
    }
    return Task.findById(primary.id);
  }

  const task = await Task.create({
    taskType: 'custom',
    title,
    description,
    assignedToUserId: providerUserId,
    assignedByUserId: assignedByUserId || providerUserId,
    dueDate: null,
    referenceId: null,
    metadata: baseMeta,
    urgency: 'high'
  });

  await TaskAuditLog.logAction({
    taskId: task.id,
    actionType: 'assigned',
    actorUserId: assignedByUserId || providerUserId,
    targetUserId: providerUserId,
    metadata: { source: 'client_lifecycle', clientId, actionKey }
  }).catch(() => {});

  return task;
}

async function completeOpenLifecycleTasks(providerUserId, clientId, actorUserId) {
  const open = await findOpenLifecycleTasks(providerUserId, clientId);
  for (const task of open) {
    try {
      await Task.markComplete(task.id, actorUserId || providerUserId);
    } catch {
      // best-effort
    }
  }
}

/**
 * Sync Tasks Hub items for every active provider on this client based on
 * deriveLifecycleAction (provider role). Creates/updates when actionable;
 * completes when the action clears.
 */
export async function syncClientProviderLifecycleTasks({
  clientId,
  actorUserId = null,
  providerUserIds = null
}) {
  const cid = Number(clientId || 0);
  if (!cid) return { synced: 0 };

  const client = await loadClientForLifecycleTask(cid);
  if (!client) return { synced: 0 };

  let disposition = null;
  try {
    const { getDisposition } = await import('./clientYearDisposition.service.js');
    const { currentSchoolYearLabelFromCalendar } = await import('../utils/schoolYearCalendar.js');
    disposition = await getDisposition({
      clientId: cid,
      schoolYear: currentSchoolYearLabelFromCalendar()
    });
  } catch {
    disposition = null;
  }

  const providers = Array.isArray(providerUserIds) && providerUserIds.length
    ? providerUserIds.map(Number).filter((n) => n > 0)
    : await loadActiveProviderIds(cid);

  // Include legacy single provider_id if assignments are empty
  if (!providers.length && Number(client.provider_id) > 0) {
    providers.push(Number(client.provider_id));
  }

  const label = resolveClientDisplayLabel(client, cid);
  let synced = 0;

  let hasWeekdayAny = false;
  try {
    const { clientHasWeekdayAssignment } = await import('./clientLifecycleStatus.service.js');
    hasWeekdayAny = !!(await clientHasWeekdayAssignment(cid));
  } catch {
    hasWeekdayAny = !!(client.service_day && /Monday|Tuesday|Wednesday|Thursday|Friday/i.test(String(client.service_day)));
  }

  for (const providerUserId of providers) {
    const shaped = {
      ...client,
      provider_id: providerUserId,
      has_provider: true,
      provider_ids: String(providerUserId),
      has_weekday: hasWeekdayAny,
      fall_completed_at: disposition?.fall_completed_at ?? null,
      fall_outcome: disposition?.fall_outcome ?? null
    };

    // Prefer assignment-specific weekday if present
    try {
      const [dayRows] = await pool.execute(
        `SELECT service_day FROM client_provider_assignments
         WHERE client_id = ? AND provider_user_id = ? AND is_active = TRUE
         LIMIT 1`,
        [cid, providerUserId]
      );
      const day = String(dayRows?.[0]?.service_day || '').trim();
      if (day) {
        shaped.service_day = day;
        shaped.has_weekday = /Monday|Tuesday|Wednesday|Thursday|Friday/i.test(day);
      }
    } catch {
      // ignore
    }

    const action = deriveLifecycleAction({
      client: shaped,
      viewerRole: 'provider',
      disposition
    });

    const actionable = action
      && !action.quiet
      && TASKABLE_ACTION_KEYS.has(String(action.actionKey || ''));

    if (actionable) {
      await upsertLifecycleTask({
        providerUserId,
        clientId: cid,
        clientLabel: label,
        actionKey: action.actionKey,
        actionLabel: action.label,
        serviceDay: shaped.service_day || null,
        assignedByUserId: actorUserId
      });
      synced += 1;
    } else {
      await completeOpenLifecycleTasks(providerUserId, cid, actorUserId);
    }
  }

  return { synced, clientLabel: label };
}

/**
 * Create/sync provider lifecycle task(s) for a client.
 * Open tasks are created only when deriveLifecycleAction says the provider has work
 * (e.g. Ready to Schedule → New Client, or Fall confirmation).
 * `clientLabel` is ignored for display — label is always resolved from the client row
 * so titles stay consistent (initials/name, not bare numeric codes).
 */
export async function createClientOnboardingTaskForProvider({
  providerUserId,
  clientId,
  clientLabel: _clientLabel,
  serviceDay: _serviceDay,
  assignedByUserId
}) {
  if (!providerUserId || !clientId) return null;

  try {
    await syncClientProviderLifecycleTasks({
      clientId,
      actorUserId: assignedByUserId || providerUserId,
      providerUserIds: [providerUserId]
    });
    const open = await findOpenLifecycleTasks(providerUserId, clientId);
    return open.length ? Task.findById(open[0].id) : null;
  } catch (err) {
    console.error('createClientOnboardingTaskForProvider:', err);
    return null;
  }
}

/**
 * Sync lifecycle tasks for a provider: clients already on open tasks + active assignments.
 * Used when opening Tasks Hub so titles/action keys stay accurate.
 */
export async function syncProviderClientLifecycleTasksForUser(providerUserId, { actorUserId = null } = {}) {
  const uid = Number(providerUserId || 0);
  if (!uid) return { clientIds: 0, synced: 0 };

  const clientIds = new Set();

  try {
    const [taskRows] = await pool.execute(
      `SELECT DISTINCT CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.clientId')) AS UNSIGNED) AS client_id
       FROM tasks
       WHERE assigned_to_user_id = ?
         AND status NOT IN ('completed', 'overridden')
         AND JSON_EXTRACT(metadata, '$.clientId') IS NOT NULL
       LIMIT 200`,
      [uid]
    );
    for (const r of taskRows || []) {
      const id = Number(r.client_id);
      if (id > 0) clientIds.add(id);
    }
  } catch {
    // ignore
  }

  try {
    const [assignRows] = await pool.execute(
      `SELECT DISTINCT cpa.client_id
       FROM client_provider_assignments cpa
       INNER JOIN clients c ON c.id = cpa.client_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
         AND LOWER(COALESCE(cs.status_key, '')) IN (
           'ready_to_schedule', 'scheduled', 'confirmation_pending', 'continuation_unknown',
           'unable_to_reach', 'other_transfer', 'returning', 'confirmed_returning',
           'needs_day_assignment', 'spring_update_pending', 'onboarded', 'current', 'pending'
         )
       LIMIT 300`,
      [uid]
    );
    for (const r of assignRows || []) {
      const id = Number(r.client_id);
      if (id > 0) clientIds.add(id);
    }
  } catch {
    // ignore
  }

  let synced = 0;
  for (const clientId of clientIds) {
    try {
      const result = await syncClientProviderLifecycleTasks({
        clientId,
        actorUserId: actorUserId || uid,
        providerUserIds: [uid]
      });
      synced += Number(result?.synced || 0);
    } catch (err) {
      console.warn('[syncProviderClientLifecycleTasksForUser]', clientId, err?.message || err);
    }
  }

  return { clientIds: clientIds.size, synced };
}
