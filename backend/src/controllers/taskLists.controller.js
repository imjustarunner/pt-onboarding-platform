/**
 * Shared task lists - agency-scoped, explicit membership.
 * Users must be members to see/edit lists.
 */
import pool from '../config/database.js';
import TaskList from '../models/TaskList.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import User from '../models/User.model.js';

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
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

export const listTaskLists = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const lists = await TaskList.listByUserMembership(userId, { agencyId });
    const withCounts = await Promise.all(
      lists.map(async (l) => {
        const [rows] = await pool.execute(
          'SELECT COUNT(*) as c FROM tasks WHERE task_list_id = ? AND status NOT IN (?, ?)',
          [l.id, 'completed', 'overridden']
        ).catch(() => [[{ c: 0 }]]);
        return { ...l, task_count: rows[0]?.c ?? 0 };
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
    const aid = parseInt(agencyId, 10);
    if (!aid) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const nameStr = String(name || '').trim();
    if (!nameStr) return res.status(400).json({ error: { message: 'name is required' } });

    const inAgency = await ensureUserInAgency(userId, aid);
    if (!inAgency) return res.status(403).json({ error: { message: 'You must be in this agency to create a list' } });

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
    const inAgency = await ensureUserInAgency(uid, list.agency_id);
    if (!inAgency) return res.status(400).json({ error: { message: 'User must be in this agency' } });

    const member = await TaskListMember.add(listId, uid, role || 'viewer');
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
};

export const listAgencyUsers = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.last_name, u.first_name`,
      [list.agency_id]
    );
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

export const listTasks = async (req, res, next) => {
  try {
    const listId = req.taskListId;
    const [rows] = await pool.execute(
      `SELECT t.* FROM tasks t WHERE t.task_list_id = ? AND t.status NOT IN ('completed', 'overridden')
       ORDER BY 
         CASE COALESCE(t.urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         (t.due_date IS NULL), t.due_date ASC,
         t.created_at DESC`,
      [listId]
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
      typical_time
    } = req.body || {};

    const titleStr = String(title || '').trim();
    if (!titleStr) return res.status(400).json({ error: { message: 'title is required' } });

    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });

    const assigneeId = assigned_to_user_id ? parseInt(assigned_to_user_id, 10) : null;
    if (assigneeId) {
      const member = await TaskListMember.findByListAndUser(listId, assigneeId);
      if (!member) return res.status(400).json({ error: { message: 'Assignee must be a list member' } });
    }

    const task = await Task.create({
      taskType: 'custom',
      title: titleStr,
      description: description ? String(description).trim() || null : null,
      assignedToUserId: assigneeId || userId,
      assignedByUserId: userId,
      dueDate: due_date || null,
      referenceId: null,
      taskListId: listId,
      urgency: urgency || 'medium',
      isRecurring: !!is_recurring,
      recurringRule: recurring_rule || null,
      typicalDayOfWeek: typical_day_of_week ?? null,
      typicalTime: typical_time || null
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: userId,
      targetUserId: assigneeId || userId,
      metadata: { source: 'task_list', taskListId: listId }
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};
