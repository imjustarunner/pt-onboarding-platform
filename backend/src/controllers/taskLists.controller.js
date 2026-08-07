/**
 * Shared task lists - agency-scoped, explicit membership.
 * Users must be members to see/edit lists.
 */
import pool from '../config/database.js';
import TaskProject from '../models/TaskProject.model.js';
import {
  resolveTaskListAndProject,
  sendListProjectError
} from '../services/taskListProjectLink.service.js';
import TaskList from '../models/TaskList.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import User from '../models/User.model.js';
import { notifyTaskAddedToList } from '../services/taskNotifications.service.js';

async function requireMembership(req, res, next) {
  const listId = parseInt(req.params.id || req.params.listId, 10);
  const userId = req.user?.id;
  if (!userId || !listId) {
    return res.status(400).json({ error: { message: 'Invalid request' } });
  }
  const membership = await TaskListMember.findByListAndUser(listId, userId);
  if (!membership) {
    return res.status(403).json({ error: { message: 'You are not a member of this list' } });
  }
  req.taskListMembership = membership;
  req.taskListId = listId;
  next();
}

async function requireEditor(req, res, next) {
  if (!TaskListMember.canEdit(req.taskListMembership?.role)) {
    return res.status(403).json({ error: { message: 'You need editor or admin role to perform this action' } });
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!TaskListMember.canAdmin(req.taskListMembership?.role)) {
    return res.status(403).json({ error: { message: 'You need admin role to perform this action' } });
  }
  next();
}

async function ensureUserInAgency(userId, agencyId) {
  if (!agencyId) return true; // person-scoped list — no agency requirement
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

/**
 * Returns true if actor can add targetUserId to a list.
 * Rules (person-to-person model):
 *  - Actor is superadmin → can share with anyone
 *  - Otherwise → both must share at least one common agency
 */
async function canShareWith(actorUserId, actorRole, targetUserId) {
  const role = String(actorRole || '').toLowerCase();
  if (['super_admin', 'superadmin', 'support'].includes(role)) return true;
  if (Number(actorUserId) === Number(targetUserId)) return true;
  const [actorAgencies, targetAgencies] = await Promise.all([
    User.getAgencies(actorUserId),
    User.getAgencies(targetUserId)
  ]);
  const actorIds = new Set((actorAgencies || []).map((a) => Number(a.id)));
  return (targetAgencies || []).some((a) => actorIds.has(Number(a.id)));
}

/** Other collaborators (excludes the viewing user). */
function buildSharedWithLabel(members, viewerUserId) {
  const others = (members || []).filter((m) => Number(m.user_id) !== Number(viewerUserId));
  if (!others.length) return 'Only you';
  const names = others.map((m) =>
    `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Member'
  );
  return names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '');
}

/** Manager/superadmin: all shared lists for a tenant (membership not required). */
export const listTeamTaskLists = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const role = String(req.user?.role || '').toLowerCase();
    const canViewAll =
      ['admin', 'super_admin', 'support', 'supervisor'].includes(role)
      || !!req.user?.capabilities?.canManageHiring;
    if (!canViewAll) return res.status(403).json({ error: { message: 'Forbidden' } });

    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT tl.*,
        (SELECT COUNT(*) FROM tasks t
          WHERE t.task_list_id = tl.id AND t.status NOT IN ('completed','overridden')
            AND (COALESCE(t.is_private, 0) = 0 OR t.assigned_to_user_id = ? OR t.assigned_by_user_id = ?)) AS task_count,
        (SELECT COUNT(*) FROM task_list_members tlm WHERE tlm.task_list_id = tl.id) AS member_count
       FROM task_lists tl
       WHERE tl.agency_id = ?
       ORDER BY tl.name ASC`,
      [userId, userId, agencyId]
    );
    const withMembers = await Promise.all(
      (rows || []).map(async (l) => {
        const members = await TaskListMember.listByTaskList(l.id).catch(() => []);
        const memberNames = members.map((m) =>
          `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Member'
        );
        return {
          ...l,
          task_count: Number(l.task_count || 0),
          member_count: Number(l.member_count || 0),
          members,
          member_names: memberNames,
          shared_with_label: buildSharedWithLabel(members, userId),
          team_browse: true
        };
      })
    );
    res.json(withMembers);
  } catch (err) {
    next(err);
  }
};

export const listTaskLists = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    // Default: all memberships for this user (across agencies). Pass agencyId only when explicitly scoping.
    const agencyId =
      req.query.agencyId != null && String(req.query.agencyId).trim() !== ''
        ? parseInt(req.query.agencyId, 10)
        : null;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const lists = await TaskList.listByUserMembership(userId, {
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null
    });
    const withCounts = await Promise.all(
      lists.map(async (l) => {
        const [[countRow], [activityRow], members] = await Promise.all([
          pool.execute(
            'SELECT COUNT(*) as c FROM tasks WHERE task_list_id = ? AND status NOT IN (?, ?)',
            [l.id, 'completed', 'overridden']
          ).catch(() => [[{ c: 0 }]]),
          pool.execute(
            `SELECT MAX(COALESCE(t.completed_at, t.updated_at)) as last_activity
             FROM tasks t WHERE t.task_list_id = ?`,
            [l.id]
          ).catch(() => [[{ last_activity: null }]]),
          TaskListMember.listByTaskList(l.id).catch(() => [])
        ]);
        const lastActivity = activityRow[0]?.last_activity;
        const memberNames = (members || []).map((m) =>
          `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Member'
        );
        const linkedProject = await TaskProject.findLinkedProjectForList(l.id).catch(() => null);
        return {
          ...l,
          task_count: countRow?.c ?? 0,
          last_activity_at: lastActivity && lastActivity !== '0' ? lastActivity : null,
          members: members || [],
          member_names: memberNames,
          shared_with_label: buildSharedWithLabel(members, userId),
          linked_project_id: linkedProject?.project_id ?? null,
          linked_project_name: linkedProject?.name ?? null
        };
      })
    );
    res.json(withCounts);
  } catch (err) {
    next(err);
  }
};

export const createTaskList = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { agencyId, name } = req.body || {};
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const nameStr = String(name || '').trim();
    if (!nameStr) return res.status(400).json({ error: { message: 'name is required' } });

    // agencyId is now optional — lists can be person-scoped (no tenant required)
    const aid = agencyId ? parseInt(agencyId, 10) || null : null;
    if (aid) {
      const inAgency = await ensureUserInAgency(userId, aid);
      if (!inAgency) return res.status(403).json({ error: { message: 'You must be in this agency to create a list there' } });
    }

    const list = await TaskList.create({ agencyId: aid, name: nameStr, createdByUserId: userId });
    res.status(201).json(list);
  } catch (err) {
    next(err);
  }
};

export const getTaskList = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });
    const members = await TaskListMember.listByTaskList(listId);
    list.members = members;
    res.json(list);
  } catch (err) {
    next(err);
  }
};

export const updateTaskList = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const { name } = req.body || {};
    const list = await TaskList.update(listId, { name });
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });
    res.json(list);
  } catch (err) {
    next(err);
  }
};

export const deleteTaskList = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const ok = await TaskList.delete(listId);
    if (!ok) return res.status(404).json({ error: { message: 'List not found' } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const addMember = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const { userId: targetUserId, role } = req.body || {};
    const uid = parseInt(targetUserId, 10);
    if (!uid) return res.status(400).json({ error: { message: 'userId is required' } });
    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });

    if (list.agency_id) {
      // Legacy tenant-scoped list: target must be in that agency
      const inAgency = await ensureUserInAgency(uid, list.agency_id);
      if (!inAgency) return res.status(400).json({ error: { message: 'User must be in the list\'s agency' } });
    } else {
      // Person-scoped list: actor and target must share at least one common agency (or actor is superadmin)
      const ok = await canShareWith(req.user.id, req.user.role, uid);
      if (!ok) return res.status(403).json({ error: { message: 'You can only share lists with people in your organization' } });
    }

    const member = await TaskListMember.add(listId, uid, role || 'viewer');
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
};

export const listAgencyUsers = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const actorId = req.user?.id;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });

    let rows;
    if (list.agency_id) {
      // Tenant-scoped list: return users in that agency
      [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND (u.role IS NULL OR u.role != 'school_staff')
         AND (u.status IS NULL OR UPPER(u.status) != 'PROSPECTIVE')
         ORDER BY u.last_name, u.first_name`,
        [list.agency_id]
      );
    } else if (['super_admin', 'superadmin', 'support'].includes(actorRole)) {
      // Superadmin on a person-scoped list: return users in any of the actor's agencies
      [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND (u.role IS NULL OR u.role != 'school_staff')
         AND (u.status IS NULL OR UPPER(u.status) != 'PROSPECTIVE')
         ORDER BY u.last_name, u.first_name`
      );
    } else {
      // Person-scoped list: return users who share any agency with the actor
      [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id IN (
           SELECT agency_id FROM user_agencies WHERE user_id = ?
         )
         AND u.id != ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND (u.role IS NULL OR u.role != 'school_staff')
         AND (u.status IS NULL OR UPPER(u.status) != 'PROSPECTIVE')
         ORDER BY u.last_name, u.first_name`,
        [actorId, actorId]
      );
    }
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const targetUserId = parseInt(req.params.userId, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'userId is required' } });
    const ok = await TaskListMember.remove(listId, targetUserId);
    if (!ok) return res.status(404).json({ error: { message: 'Member not found' } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/** Manager browse of a list's tasks without membership. */
export const listTeamListTasks = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toLowerCase();
    const canViewAll =
      ['admin', 'super_admin', 'support', 'supervisor'].includes(role)
      || !!req.user?.capabilities?.canManageHiring;
    if (!canViewAll) return res.status(403).json({ error: { message: 'Forbidden' } });
    const listId = parseInt(req.params.id, 10);
    req.taskListId = listId;
    return listTasks(req, res, next);
  } catch (err) {
    next(err);
  }
};

export const listTasks = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const statusFilter = req.query.status; // 'open' (default) | 'completed' | 'all'
    const includeCompleted = statusFilter === 'completed' || statusFilter === 'all';
    const completedOnly = statusFilter === 'completed';

    const userId = req.user?.id;
    let whereClause = `t.task_list_id = ?
      AND (COALESCE(t.is_private, 0) = 0 OR t.assigned_to_user_id = ? OR t.assigned_by_user_id = ?)`;
    const params = [listId, userId, userId];
    if (completedOnly) {
      whereClause += " AND t.status IN ('completed', 'overridden')";
    } else if (!includeCompleted) {
      whereClause += " AND t.status NOT IN ('completed', 'overridden')";
    }

    const orderBy = completedOnly
      ? 't.completed_at DESC, t.updated_at DESC'
      : `CASE COALESCE(t.urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         (t.due_date IS NULL), t.due_date ASC,
         t.created_at DESC`;

    const [rows] = await pool.execute(
      `SELECT t.*,
        assignee.first_name AS assignee_first_name,
        assignee.last_name AS assignee_last_name,
        assignee.profile_photo_path AS assignee_profile_photo_path
       FROM tasks t
       LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
       WHERE ${whereClause}
       ORDER BY ${orderBy}`,
      params
    );
    const tasks = (rows || []).map((r) => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? (() => { try { return JSON.parse(r.metadata); } catch { return null; } })() : r.metadata
    }));
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

export const createTaskInList = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const listId = req.taskListId;
    const {
      title,
      description,
      assigned_to_user_id,
      due_date,
      urgency,
      is_recurring,
      recurring_rule,
      typical_day_of_week,
      typical_time,
      target_count
    } = req.body || {};

    const titleStr = String(title || '').trim();
    if (!titleStr) return res.status(400).json({ error: { message: 'title is required' } });

    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });

    const resolvedAssignee =
      assigned_to_user_id === undefined
        ? userId
        : (assigned_to_user_id != null && assigned_to_user_id !== '' ? parseInt(assigned_to_user_id, 10) : null);
    if (resolvedAssignee) {
      const member = await TaskListMember.findByListAndUser(listId, resolvedAssignee);
      if (!member) return res.status(400).json({ error: { message: 'Assignee must be a list member' } });
    }

    let resolvedProjectId = null;
    try {
      const linked = await resolveTaskListAndProject({
        taskListId: listId,
        projectId: req.body?.project_id ?? req.body?.projectId ?? null
      });
      resolvedProjectId = linked.projectId;
    } catch (err) {
      const sent = sendListProjectError(res, err);
      if (sent) return sent;
      throw err;
    }

    const task = await Task.create({
      taskType: 'custom',
      title: titleStr,
      description: description ? String(description).trim() || null : null,
      assignedToUserId: resolvedAssignee,
      assignedByUserId: userId,
      assignedToAgencyId: list.agency_id || null,
      dueDate: due_date || null,
      referenceId: null,
      taskListId: listId,
      urgency: urgency || 'medium',
      isRecurring: !!is_recurring,
      recurringRule: recurring_rule || null,
      typicalDayOfWeek: typical_day_of_week ?? null,
      typicalTime: typical_time || null,
      targetCount: target_count ?? null,
      projectId: resolvedProjectId
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: userId,
      targetUserId: resolvedAssignee,
      metadata: { source: 'task_list', taskListId: listId }
    });

    // Fire batched/coalesced notifications to all list members (except the creator).
    notifyTaskAddedToList({
      task,
      listId,
      listName: list.name,
      agencyId: list.agency_id,
      actorUserId: userId
    }).catch((err) => console.error('[createTaskInList] notifyTaskAddedToList error:', err));

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};
