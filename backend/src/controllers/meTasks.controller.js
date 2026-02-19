/**
 * Self-service task management for Momentum List (custom tasks).
 * Users can create, update, and delete their own custom tasks without admin.
 */
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import TaskDeletionLog from '../models/TaskDeletionLog.model.js';

function ensureCustomTaskOwnedByUser(task, userId) {
  if (!task) return false;
  if (String(task.task_type) !== 'custom') return false;
  if (Number(task.assigned_to_user_id) !== Number(userId)) return false;
  return true;
}

export const createCustomTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, description, dueDate } = req.body || {};

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
      referenceId: null
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
    const { title, description, dueDate } = req.body || {};

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found' } });
    if (!ensureCustomTaskOwnedByUser(task, userId)) {
      return res.status(403).json({ error: { message: 'You can only update your own custom tasks' } });
    }

    const updates = {};
    if (title !== undefined) {
      const t = String(title || '').trim();
      if (!t) return res.status(400).json({ error: { message: 'title cannot be empty' } });
      updates.title = t;
    }
    if (description !== undefined) updates.description = description ? String(description).trim() || null : null;
    if (dueDate !== undefined) updates.dueDate = dueDate || null;

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
    if (!ensureCustomTaskOwnedByUser(task, userId)) {
      return res.status(403).json({ error: { message: 'You can only delete your own custom tasks' } });
    }

    await TaskDeletionLog.logDeletion({
      taskId,
      taskTitle: task.title,
      actorUserId: userId,
      source: 'momentum_user_request',
      metadata: { taskType: task.task_type }
    });
    await Task.deleteById(taskId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
