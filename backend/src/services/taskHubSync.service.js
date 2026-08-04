/**
 * Projects meeting action items and org escalations into the unified tasks table
 * so they appear in the Tasks hub inbox. Source systems remain authoritative.
 */
import pool from '../config/database.js';
import Task from '../models/Task.model.js';

function meetingSourceRef(eventId, actionItemId) {
  return `${Number(eventId)}:${String(actionItemId)}`;
}

async function resolveAgencyIdForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return null;
  const [rows] = await pool.execute(
    `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY agency_id ASC LIMIT 1`,
    [uid]
  );
  return rows?.[0]?.agency_id != null ? Number(rows[0].agency_id) : null;
}

async function findBySource(sourceRefType, sourceRefId) {
  if (!sourceRefType || !sourceRefId) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM tasks WHERE source_ref_type = ? AND source_ref_id = ? LIMIT 1`,
    [String(sourceRefType), String(sourceRefId)]
  );
  return rows?.[0] || null;
}

/**
 * Upsert / complete / remove meeting_action tasks for a workspace's action items.
 */
export async function syncMeetingActionTasks({
  eventId,
  actionItems = [],
  actorUserId = null,
  agencyId = null
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { upserted: 0, completed: 0, removed: 0 };

  let TaskActionItem = null;
  try {
    TaskActionItem = (await import('../models/TaskActionItem.model.js')).default;
  } catch {
    TaskActionItem = null;
  }

  const items = (Array.isArray(actionItems) ? actionItems : [])
    .map((a, i) => ({
      id: String(a?.id || `a-${i}`),
      text: String(a?.text || '').trim(),
      done: !!a?.done,
      assigneeUserId: Number(a?.assigneeUserId || a?.assignee_user_id || 0) || null,
      notes: a?.notes != null ? String(a.notes) : null
    }))
    .filter((a) => a.text);

  const keepRefs = new Set(items.map((a) => meetingSourceRef(eid, a.id)));
  let upserted = 0;
  let completed = 0;

  for (const item of items) {
    const sourceRefId = meetingSourceRef(eid, item.id);
    const existing = await findBySource('meeting_action', sourceRefId);
    const assignee = item.assigneeUserId;
    const status = item.done ? 'completed' : 'pending';
    const resolvedAgency =
      agencyId ||
      (assignee ? await resolveAgencyIdForUser(assignee) : null) ||
      (actorUserId ? await resolveAgencyIdForUser(actorUserId) : null);

    if (!assignee && !existing) continue;

    if (existing) {
      const parts = [
        'title = ?',
        'description = ?',
        'assigned_to_user_id = ?',
        'status = ?',
        'linked_schedule_event_id = ?',
        'task_type = ?'
      ];
      const params = [
        item.text.slice(0, 255),
        `Meeting action item`,
        assignee,
        status,
        eid,
        'meeting_action'
      ];
      if (status === 'completed') {
        parts.push('completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)');
      } else {
        parts.push('completed_at = NULL');
      }
      if (resolvedAgency) {
        parts.push('assigned_to_agency_id = ?');
        params.push(resolvedAgency);
      }
      params.push(existing.id);
      await pool.execute(`UPDATE tasks SET ${parts.join(', ')} WHERE id = ?`, params);
      if (TaskActionItem) {
        try {
          await TaskActionItem.upsertFromMeeting({
            meetingEventId: eid,
            meetingActionKey: item.id,
            title: item.text.slice(0, 500),
            notes: item.notes,
            assigneeUserId: assignee,
            createdByUserId: actorUserId || assignee,
            agencyId: resolvedAgency,
            done: item.done,
            hubTaskId: existing.id
          });
        } catch (e) {
          console.warn('[taskHubSync] action item upsert failed', e?.message);
        }
      }
      if (status === 'completed') completed += 1;
      else upserted += 1;
    } else if (assignee) {
      const byUser = actorUserId || assignee;
      const createdTask = await Task.create({
        taskType: 'meeting_action',
        title: item.text.slice(0, 255),
        description: 'Meeting action item',
        assignedToUserId: assignee,
        assignedToAgencyId: resolvedAgency,
        assignedByUserId: byUser,
        metadata: { source: 'meeting_action', eventId: eid, actionItemId: item.id },
        sourceRefType: 'meeting_action',
        sourceRefId,
        linkedScheduleEventId: eid
      });
      if (TaskActionItem) {
        try {
          await TaskActionItem.upsertFromMeeting({
            meetingEventId: eid,
            meetingActionKey: item.id,
            title: item.text.slice(0, 500),
            notes: item.notes,
            assigneeUserId: assignee,
            createdByUserId: byUser,
            agencyId: resolvedAgency,
            done: item.done,
            hubTaskId: createdTask?.id || null
          });
        } catch (e) {
          console.warn('[taskHubSync] action item upsert failed', e?.message);
        }
      }
      if (status === 'completed') {
        const created = await findBySource('meeting_action', sourceRefId);
        if (created) await Task.markComplete(created.id, assignee);
        completed += 1;
      } else {
        upserted += 1;
      }
    }
  }

  // Complete orphan projections for this event that disappeared from workspace
  const [orphans] = await pool.execute(
    `SELECT id, source_ref_id FROM tasks
     WHERE task_type = 'meeting_action'
       AND linked_schedule_event_id = ?
       AND status NOT IN ('completed', 'overridden')`,
    [eid]
  );
  let removed = 0;
  for (const row of orphans || []) {
    if (keepRefs.has(String(row.source_ref_id))) continue;
    await Task.markComplete(row.id, actorUserId);
    removed += 1;
  }

  return { upserted, completed, removed };
}

/**
 * Upsert an escalation task for the current assignee.
 */
export async function syncEscalationTask({
  ticketId,
  title,
  description = null,
  assigneeUserId = null,
  agencyId = null,
  departmentName = null,
  departmentId = null,
  actorUserId = null,
  status = 'pending',
  linkedScheduleEventId = null
} = {}) {
  const tid = Number(ticketId || 0);
  if (!tid) return null;
  const sourceRefId = String(tid);
  const existing = await findBySource('escalation', sourceRefId);
  const assignee = Number(assigneeUserId || 0) || null;
  const resolvedAgency = agencyId || (assignee ? await resolveAgencyIdForUser(assignee) : null);
  const taskStatus = ['resolved', 'closed', 'completed'].includes(String(status || '').toLowerCase())
    ? 'completed'
    : 'pending';

  let deptId = departmentId != null ? Number(departmentId) : null;
  if (!deptId && departmentName && resolvedAgency) {
    const [deptRows] = await pool.execute(
      `SELECT id FROM agency_departments
       WHERE agency_id = ? AND LOWER(name) = LOWER(?) AND is_active = 1
       LIMIT 1`,
      [resolvedAgency, String(departmentName).trim()]
    );
    deptId = deptRows?.[0]?.id != null ? Number(deptRows[0].id) : null;
  }

  if (!assignee) {
    if (existing && taskStatus !== 'completed') {
      await pool.execute(
        `UPDATE tasks SET assigned_to_user_id = NULL, status = ? WHERE id = ?`,
        [taskStatus === 'completed' ? 'completed' : 'pending', existing.id]
      );
    }
    if (existing && taskStatus === 'completed') {
      await Task.markComplete(existing.id, actorUserId);
    }
    return existing;
  }

  const safeTitle = String(title || `Escalation #${tid}`).trim().slice(0, 255) || `Escalation #${tid}`;

  if (existing) {
    const parts = [
      'title = ?',
      'description = ?',
      'assigned_to_user_id = ?',
      'status = ?',
      'task_type = ?',
      'department_id = ?',
      'linked_schedule_event_id = COALESCE(?, linked_schedule_event_id)'
    ];
    const params = [
      safeTitle,
      description != null ? String(description) : existing.description,
      assignee,
      taskStatus,
      'escalation',
      deptId,
      linkedScheduleEventId != null ? Number(linkedScheduleEventId) : null
    ];
    if (resolvedAgency) {
      parts.push('assigned_to_agency_id = ?');
      params.push(resolvedAgency);
    }
    if (taskStatus === 'completed') {
      parts.push('completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)');
    } else {
      parts.push('completed_at = NULL');
    }
    params.push(existing.id);
    await pool.execute(`UPDATE tasks SET ${parts.join(', ')} WHERE id = ?`, params);
    return Task.findById(existing.id);
  }

  const created = await Task.create({
    taskType: 'escalation',
    title: safeTitle,
    description: description != null ? String(description) : 'Organization escalation',
    assignedToUserId: assignee,
    assignedToAgencyId: resolvedAgency,
    assignedByUserId: actorUserId || assignee,
    metadata: { source: 'escalation', ticketId: tid },
    sourceRefType: 'escalation',
    sourceRefId,
    linkedScheduleEventId: linkedScheduleEventId != null ? Number(linkedScheduleEventId) : null,
    departmentId: deptId
  });
  if (taskStatus === 'completed' && created?.id) {
    await Task.markComplete(created.id, assignee);
  }
  return created;
}

export default {
  syncMeetingActionTasks,
  syncEscalationTask
};
