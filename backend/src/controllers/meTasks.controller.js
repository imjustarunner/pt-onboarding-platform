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
import TaskCollaborator from '../models/TaskCollaborator.model.js';
import TaskLink from '../models/TaskLink.model.js';
import {
  resolveTaskListAndProject,
  sendListProjectError
} from '../services/taskListProjectLink.service.js';
import {
  syncCollaboratorsForTask,
  validateCollaboratorUserIds
} from '../services/taskCollaborators.service.js';
import {
  notifyTaskAssigned,
  resolveAssignmentNotificationForWaiting
} from '../services/taskNotifications.service.js';
import { normalizeTaskCategory, normalizeTaskCategories } from '../constants/taskCategories.js';
import pool from '../config/database.js';

function ensureCustomTaskOwnedByUser(task, userId) {
  if (!task) return false;
  if (String(task.task_type) !== 'custom') return false;
  if (Number(task.assigned_to_user_id) === Number(userId)) return true;
  if (
    (task.assigned_to_user_id == null || task.assigned_to_user_id === '')
    && Number(task.assigned_by_user_id) === Number(userId)
  ) {
    return true;
  }
  return false;
}

async function canUpdateOrDeleteTask(task, userId, role = '') {
  if (!task) return false;
  const r = String(role || '').toLowerCase();
  if (['admin', 'super_admin', 'support', 'supervisor'].includes(r)) return true;
  if (String(task.task_type) === 'custom') {
    if (task.task_list_id) {
      const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
      return membership && TaskListMember.canEdit(membership.role);
    }
    return ensureCustomTaskOwnedByUser(task, userId);
  }
  // Assignees may update list/project/private/notes on their own tasks
  return Number(task.assigned_to_user_id) === Number(userId)
    || Number(task.assigned_by_user_id) === Number(userId);
}

export const createCustomTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      title,
      description,
      dueDate,
      task_list_id,
      listName,
      agencyId,
      urgency,
      is_recurring,
      recurring_rule,
      typical_day_of_week,
      typical_time,
      target_count,
      metadata: metadataIn
    } = req.body || {};

    const titleStr = String(title || '').trim();
    if (!titleStr) {
      return res.status(400).json({ error: { message: 'title is required' } });
    }

    let resolvedListId = task_list_id ?? null;
    if (!resolvedListId && listName && agencyId) {
      const lists = await TaskList.listByUserMembership(userId, { agencyId: parseInt(agencyId, 10) });
      const match = lists.find(
        (l) => String(l.name || '').toLowerCase() === String(listName || '').toLowerCase()
      );
      if (match) resolvedListId = match.id;
    }

    const meta =
      metadataIn && typeof metadataIn === 'object' && !Array.isArray(metadataIn)
        ? { ...metadataIn, createdVia: 'me_tasks' }
        : { source: 'momentum_user_request', createdVia: 'me_tasks' };

    let resolvedAgencyId = agencyId != null ? parseInt(agencyId, 10) || null : null;
    if (!resolvedAgencyId && resolvedListId) {
      const list = await TaskList.findById(resolvedListId);
      resolvedAgencyId = list?.agency_id ? Number(list.agency_id) : null;
    }

    let resolvedProjectId = null;
    try {
      const linked = await resolveTaskListAndProject({
        taskListId: resolvedListId,
        projectId: req.body?.project_id ?? req.body?.projectId ?? null
      });
      resolvedListId = linked.taskListId;
      resolvedProjectId = linked.projectId;
    } catch (err) {
      const sent = sendListProjectError(res, err);
      if (sent) return sent;
      throw err;
    }

    const assigneeRaw = req.body?.assigned_to_user_id ?? req.body?.assignedToUserId ?? null;
    const resolvedAssignee =
      assigneeRaw != null && assigneeRaw !== ''
        ? parseInt(assigneeRaw, 10) || null
        : null;

    const task = await Task.create({
      taskType: 'custom',
      title: titleStr,
      description: description ? String(description).trim() || null : null,
      assignedToUserId: resolvedAssignee,
      assignedByUserId: userId,
      assignedToAgencyId: resolvedAgencyId,
      dueDate: dueDate || null,
      referenceId: null,
      taskListId: resolvedListId,
      urgency: urgency && ['low', 'medium', 'high'].includes(urgency) ? urgency : 'medium',
      isRecurring: !!is_recurring,
      recurringRule: recurring_rule || null,
      typicalDayOfWeek: typical_day_of_week ?? null,
      typicalTime: typical_time || null,
      targetCount: target_count ?? null,
      metadata: meta,
      workTypeId: req.body?.work_type_id ?? metadataIn?.work_type_id ?? null,
      workTypeIconKey: req.body?.work_type_icon_key ?? null,
      isPrivate: !!(req.body?.isPrivate ?? req.body?.is_private),
      projectId: resolvedProjectId,
      categories: normalizeTaskCategories(req.body?.categories ?? req.body?.category)
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: resolvedAssignee ? 'assigned' : 'created',
      actorUserId: userId,
      targetUserId: resolvedAssignee || userId,
      metadata: meta
    });

    // Notify assignee (skips if waiting or self-assigned)
    notifyTaskAssigned({ task, actorUserId: userId }).catch(() => {});

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
      assigned_to_user_id,
      urgency,
      is_recurring,
      recurring_rule,
      typical_day_of_week,
      typical_time,
      target_count,
      metadata,
      subtasks
    } = body;
    const dueDate = body.dueDate ?? body.due_date;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found' } });
    const canModify = await canUpdateOrDeleteTask(task, userId, req.user?.role);
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
    if (assigned_to_user_id !== undefined) {
      updates.assignedToUserId =
        assigned_to_user_id != null && assigned_to_user_id !== ''
          ? parseInt(assigned_to_user_id, 10) || null
          : null;
    }
    if (body.assignedToUserId !== undefined) {
      const raw = body.assignedToUserId;
      updates.assignedToUserId =
        raw != null && raw !== '' ? parseInt(raw, 10) || null : null;
    }
    if (urgency !== undefined && ['low', 'medium', 'high'].includes(urgency)) updates.urgency = urgency;
    if (body.work_type_id !== undefined || body.workTypeId !== undefined) {
      updates.workTypeId = body.work_type_id ?? body.workTypeId ?? null;
    }
    if (body.categories !== undefined || body.category !== undefined) {
      updates.categories = normalizeTaskCategories(body.categories ?? body.category);
    }
    if (is_recurring !== undefined) updates.isRecurring = !!is_recurring;
    if (recurring_rule !== undefined) updates.recurringRule = recurring_rule || null;
    if (typical_day_of_week !== undefined) updates.typicalDayOfWeek = typical_day_of_week ?? null;
    if (typical_time !== undefined) updates.typicalTime = typical_time || null;
    if (target_count !== undefined) updates.targetCount = target_count != null ? Math.max(0, parseInt(target_count, 10) || 0) : null;
    if (body.isPrivate !== undefined || body.is_private !== undefined) {
      updates.isPrivate = !!(body.isPrivate ?? body.is_private);
    }
    if (body.project_id !== undefined || body.projectId !== undefined) {
      updates.projectId = body.project_id ?? body.projectId ?? null;
    }
    if (body.task_list_id !== undefined || body.taskListId !== undefined) {
      updates.taskListId = body.task_list_id ?? body.taskListId ?? null;
    }

    const nextListId =
      updates.taskListId !== undefined ? updates.taskListId : task.task_list_id;
    const nextProjectId =
      updates.projectId !== undefined ? updates.projectId : task.project_id;
    if (
      updates.taskListId !== undefined
      || updates.projectId !== undefined
    ) {
      try {
        const linked = await resolveTaskListAndProject({
          taskListId: nextListId,
          projectId: nextProjectId
        });
        updates.taskListId = linked.taskListId;
        updates.projectId = linked.projectId;
      } catch (err) {
        const sent = sendListProjectError(res, err);
        if (sent) return sent;
        throw err;
      }
    }

    if (metadata !== undefined || subtasks !== undefined) {
      const existing = typeof task.metadata === 'object' ? task.metadata : Task.parseMetadata(task.metadata);
      const merged = { ...(existing || {}) };
      if (metadata !== undefined && typeof metadata === 'object') Object.assign(merged, metadata);
      if (subtasks !== undefined && Array.isArray(subtasks)) merged.subtasks = subtasks;
      updates.metadata = merged;
    }

    // Handle status changes for waiting / in_progress (not covered by markComplete/incomplete)
    const statusAllowed = ['pending', 'in_progress', 'waiting'];
    if (body.status !== undefined && statusAllowed.includes(body.status)) {
      await pool.execute(
        `UPDATE tasks SET status = ? WHERE id = ? AND task_type = 'custom'`,
        [body.status, taskId]
      );
      if (body.status === 'waiting') {
        resolveAssignmentNotificationForWaiting(taskId, null).catch(() => {});
      }
    }

    const updated = await Task.updateCustomTask(taskId, updates);

    if (
      updates.taskListId !== undefined
      || updates.projectId !== undefined
      || updates.assignedToUserId !== undefined
    ) {
      const fresh = await Task.findById(taskId);
      if (updates.assignedToUserId && fresh?.assigned_to_user_id) {
        await TaskCollaborator.removeUser(taskId, fresh.assigned_to_user_id);
      }
      await syncCollaboratorsForTask(taskId);
    }

    await TaskAuditLog.logAction({
      taskId,
      actionType: 'updated',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { source: 'momentum_user_request', updates }
    });

    // If assignee changed, notify the new assignee (skips if waiting or self-assigned)
    if (updates.assignedToUserId !== undefined && updated) {
      notifyTaskAssigned({ task: updated, actorUserId: userId }).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const claimTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const taskId = parseInt(req.params.id, 10);

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found' } });
    if (String(task.task_type) !== 'custom') return res.status(400).json({ error: { message: 'Only custom tasks can be claimed' } });
    if (!task.task_list_id) return res.status(400).json({ error: { message: 'Task must be in a shared list to claim' } });
    if (task.assigned_to_user_id) return res.status(400).json({ error: { message: 'Task is already assigned' } });

    const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
    if (!membership) return res.status(403).json({ error: { message: 'You must be a member of this list to claim' } });

    const updated = await Task.updateCustomTask(taskId, { assignedToUserId: userId });

    await TaskAuditLog.logAction({
      taskId,
      actionType: 'assigned',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { source: 'claim', taskListId: task.task_list_id }
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

    // Session Notes: soft-archive (audit retained) instead of hard delete.
    if (String(task.task_type || '') === 'session_note') {
      const { archiveSessionNoteTask } = await import(
        '../services/sessionDocumentationTask.service.js'
      );
      await archiveSessionNoteTask(taskId, { userId });
      return res.status(204).send();
    }

    await Task.deleteById(taskId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

async function canViewTaskDetails(task, userId, role) {
  if (!task) return false;
  if (Number(task.is_private) === 1) {
    return (
      Number(task.assigned_to_user_id) === Number(userId)
      || Number(task.assigned_by_user_id) === Number(userId)
    );
  }
  if (['admin', 'super_admin', 'support', 'supervisor'].includes(String(role || '').toLowerCase())) {
    return true;
  }
  if (Number(task.assigned_to_user_id) === Number(userId)) return true;
  if (Number(task.assigned_by_user_id) === Number(userId)) return true;
  if (task.task_list_id) {
    const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
    if (membership) return true;
  }
  try {
    const collaborators = await TaskCollaborator.listForTask(task.id);
    if ((collaborators || []).some((c) => Number(c.user_id) === Number(userId))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export const revealTaskPhi = async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = await Task.findById(taskId, { revealPhi: true });
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    res.json({
      id: task.id,
      description: task.description || '',
      has_encrypted_description: !!task.has_encrypted_description
    });
  } catch (err) {
    next(err);
  }
};

export const getTaskAssignees = async (req, res, next) => {
  try {
    const task = await Task.findById(parseInt(req.params.id, 10));
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    res.json({
      assigneeUserId: task.assigned_to_user_id ?? null
    });
  } catch (err) {
    next(err);
  }
};

export const setTaskAssignees = async (req, res, next) => {
  try {
    const task = await Task.findById(parseInt(req.params.id, 10));
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const canModify = await canUpdateOrDeleteTask(task, req.user.id, req.user?.role);
    if (!canModify) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    let raw =
      req.body?.userId
      ?? req.body?.assignedToUserId
      ?? req.body?.assigned_to_user_id
      ?? null;
    if (raw == null && Array.isArray(req.body?.userIds)) {
      raw = req.body.userIds[0] ?? null;
    }
    const assigneeId =
      raw != null && raw !== '' ? parseInt(raw, 10) || null : null;
    const updated = await Task.updateCustomTask(task.id, { assignedToUserId: assigneeId });
    if (assigneeId) await TaskCollaborator.removeUser(task.id, assigneeId);
    res.json({ assigneeUserId: updated?.assigned_to_user_id ?? null });
  } catch (err) {
    next(err);
  }
};

export const getTaskCollaborators = async (req, res, next) => {
  try {
    const task = await Task.findById(parseInt(req.params.id, 10));
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    res.json(await TaskCollaborator.listForTask(task.id));
  } catch (err) {
    next(err);
  }
};

export const setTaskCollaborators = async (req, res, next) => {
  try {
    const task = await Task.findById(parseInt(req.params.id, 10));
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const canModify = await canUpdateOrDeleteTask(task, req.user.id, req.user?.role);
    if (!canModify) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const validated = await validateCollaboratorUserIds(task, userIds);
    res.json(await TaskCollaborator.setForTask(task.id, validated));
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: { message: err.message } });
    }
    next(err);
  }
};

export const getTaskLinks = async (req, res, next) => {
  try {
    const task = await Task.findById(parseInt(req.params.id, 10));
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    res.json(await TaskLink.listForTask(task.id));
  } catch (err) {
    next(err);
  }
};

export const addTaskLink = async (req, res, next) => {
  try {
    const task = await Task.findById(parseInt(req.params.id, 10));
    if (!(await canViewTaskDetails(task, req.user.id, req.user.role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: { message: 'url is required' } });
    const link = await TaskLink.create({
      taskId: task.id,
      url,
      label: req.body?.label || null,
      createdByUserId: req.user.id
    });
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
};

export const deleteTaskLink = async (req, res, next) => {
  try {
    const ok = await TaskLink.delete(parseInt(req.params.linkId, 10));
    if (!ok) return res.status(404).json({ error: { message: 'Not found' } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
