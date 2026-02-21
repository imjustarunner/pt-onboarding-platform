/**
 * Self-service task management for Momentum List (custom tasks).
 * Users can create, update, and delete their own custom tasks without admin.
 * Supports personal tasks and shared list tasks (with editor membership).
 */
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import TaskDeletionLog from '../models/TaskDeletionLog.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import TaskList from '../models/TaskList.model.js';

function ensureCustomTaskOwnedByUser(task, userId) {
  if (!task) return false;
  if (String(task.task_type) !== 'custom') return false;
  if (Number(task.assigned_to_user_id) !== Number(userId)) return false;
  return true;
}

async function canUpdateOrDeleteTask(task, userId) {
  if (!task || String(task.task_type) !== 'custom') return false;
  if (task.task_list_id) {
    const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
    return membership && TaskListMember.canEdit(membership.role);
  }
  return ensureCustomTaskOwnedByUser(task, userId);
}

export const createCustomTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      title,
      description,
      dueDate,
      task_list_id,
      urgency,
      is_recurring,
      recurring_rule,
      typical_day_of_week,
      typical_time
    } = req.body || {};

    const titleStr = String(title || '').trim();
    if (!titleStr) {
      return res.status(400).json({ error: { message: 'title is required' } });
    }

    const task = await Task.create({
      taskType: 'custom',
      title: titleStr,
      description: description ? String(description).trim() || null : null,
      assignedToUserId: userId,
      assignedByUserId: userId,
      dueDate: dueDate || null,
      referenceId: null,
      taskListId: task_list_id ?? null,
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
      targetUserId: userId,
      metadata: { source: 'momentum_user_request', createdVia: 'me_tasks' }
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};

export const updateCustomTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);
    const body = req.body || {};
    const {
      title,
      description,
      task_list_id,
      urgency,
      is_recurring,
      recurring_rule,
      typical_day_of_week,
      typical_time
    } = body;
    const dueDate = body.dueDate ?? body.due_date;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found' } });
    const canModify = await canUpdateOrDeleteTask(task, userId);
    if (!canModify) {
      return res.status(403).json({ error: { message: 'You can only update your own custom tasks or tasks in lists where you have editor access' } });
    }

    const updates = {};
    if (title !== undefined) {
      const t = String(title || '').trim();
      if (!t) return res.status(400).json({ error: { message: 'title cannot be empty' } });
      updates.title = t;
    }
    if (description !== undefined) updates.description = description ? String(description).trim() || null : null;
    if (dueDate !== undefined) updates.dueDate = dueDate || null;
    if (task_list_id !== undefined) updates.taskListId = task_list_id ?? null;
    if (urgency !== undefined && ['low', 'medium', 'high'].includes(urgency)) updates.urgency = urgency;
    if (is_recurring !== undefined) updates.isRecurring = !!is_recurring;
    if (recurring_rule !== undefined) updates.recurringRule = recurring_rule || null;
    if (typical_day_of_week !== undefined) updates.typicalDayOfWeek = typical_day_of_week ?? null;
    if (typical_time !== undefined) updates.typicalTime = typical_time || null;

    const updated = await Task.updateCustomTask(taskId, updates);

    await TaskAuditLog.logAction({
      taskId,
      actionType: 'updated',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { source: 'momentum_user_request', updates }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const deleteCustomTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found' } });
    const canModify = await canUpdateOrDeleteTask(task, userId);
    if (!canModify) {
      return res.status(403).json({ error: { message: 'You can only delete your own custom tasks or tasks in lists where you have editor access' } });
    }

    let agencyId = task.assigned_to_agency_id || null;
    if (!agencyId && task.task_list_id) {
      const list = await TaskList.findById(task.task_list_id);
      agencyId = list?.agency_id || null;
    }
    await TaskDeletionLog.logDeletion({
      taskId,
      taskTitle: task.title,
      actorUserId: userId,
      agencyId,
      source: 'momentum_user_request',
      metadata: { taskType: task.task_type }
    });
    await Task.deleteById(taskId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
