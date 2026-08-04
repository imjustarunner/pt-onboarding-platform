import pool from '../config/database.js';
import TaskActionItem from '../models/TaskActionItem.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import {
  resolveTaskListAndProject,
  sendListProjectError
} from '../services/taskListProjectLink.service.js';

async function canMutate(item, userId, role) {
  if (!item) return false;
  if (['admin', 'super_admin', 'support'].includes(role)) return true;
  if (Number(item.assignee_user_id) === Number(userId)) return true;
  if (Number(item.created_by_user_id) === Number(userId)) return true;
  return false;
}

export const listActionItems = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const status = req.query.status || null;
    const unassignedFromList = String(req.query.unassignedFromList || '') === '1';
    const unassignedFromProject = String(req.query.unassignedFromProject || '') === '1';
    const items = await TaskActionItem.listForUser(userId, {
      agencyId,
      status,
      unassignedFromList,
      unassignedFromProject
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
};

export const createActionItem = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const {
      title,
      notes,
      assigneeUserId,
      parentTaskId,
      meetingEventId,
      agencyId,
      projectToHub = true,
      taskListId,
      projectId,
      isPrivate
    } = req.body || {};
    const titleStr = String(title || '').trim();
    if (!titleStr) return res.status(400).json({ error: { message: 'title is required' } });

    const assignee = assigneeUserId != null ? parseInt(assigneeUserId, 10) : userId;
    const aid = agencyId ? parseInt(agencyId, 10) : null;

    let resolvedListId = taskListId ? parseInt(taskListId, 10) : null;
    let resolvedProjectId = projectId ? parseInt(projectId, 10) : null;
    try {
      const linked = await resolveTaskListAndProject({
        taskListId: resolvedListId,
        projectId: resolvedProjectId
      });
      resolvedListId = linked.taskListId;
      resolvedProjectId = linked.projectId;
    } catch (err) {
      const sent = sendListProjectError(res, err);
      if (sent) return sent;
      throw err;
    }

    const item = await TaskActionItem.create({
      parentTaskId: parentTaskId ? parseInt(parentTaskId, 10) : null,
      meetingEventId: meetingEventId ? parseInt(meetingEventId, 10) : null,
      title: titleStr,
      notes: notes || null,
      assigneeUserId: assignee,
      createdByUserId: userId,
      agencyId: aid,
      taskListId: resolvedListId,
      projectId: resolvedProjectId,
      isPrivate: !!isPrivate
    });

    if (projectToHub && assignee) {
      try {
        const hubTask = await Task.create({
          taskType: 'meeting_action',
          title: titleStr,
          description: notes || null,
          assignedToUserId: assignee,
          assignedByUserId: userId,
          assignedToAgencyId: aid,
          dueDate: null,
          linkedScheduleEventId: meetingEventId ? parseInt(meetingEventId, 10) : null,
          sourceRefType: 'action_item',
          sourceRefId: String(item.id),
          taskListId: resolvedListId,
          projectId: resolvedProjectId,
          metadata: { source: 'task_action_items', actionItemId: item.id }
        });
        await TaskActionItem.update(item.id, { hubTaskId: hubTask.id });
        await TaskAuditLog.logAction({
          taskId: hubTask.id,
          actionType: 'assigned',
          actorUserId: userId,
          targetUserId: assignee,
          metadata: { source: 'task_action_items', actionItemId: item.id }
        }).catch(() => null);
      } catch (e) {
        console.warn('Failed to project action item to hub task:', e?.message);
      }
    }

    res.status(201).json(await TaskActionItem.findById(item.id));
  } catch (err) {
    next(err);
  }
};

export const updateActionItem = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toLowerCase();
    const id = parseInt(req.params.id, 10);
    const item = await TaskActionItem.findById(id);
    if (!item) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await canMutate(item, userId, role))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const { title, notes, assigneeUserId, status, taskListId, projectId, isPrivate } = req.body || {};

    const nextListId =
      taskListId !== undefined
        ? (taskListId != null ? parseInt(taskListId, 10) : null)
        : item.task_list_id;
    const nextProjectId =
      projectId !== undefined
        ? (projectId != null ? parseInt(projectId, 10) : null)
        : item.project_id;

    let resolvedListId = nextListId;
    let resolvedProjectId = nextProjectId;
    if (taskListId !== undefined || projectId !== undefined) {
      try {
        const linked = await resolveTaskListAndProject({
          taskListId: nextListId,
          projectId: nextProjectId
        });
        resolvedListId = linked.taskListId;
        resolvedProjectId = linked.projectId;
      } catch (err) {
        const sent = sendListProjectError(res, err);
        if (sent) return sent;
        throw err;
      }
    }

    const updated = await TaskActionItem.update(id, {
      title,
      notes,
      assigneeUserId: assigneeUserId !== undefined
        ? (assigneeUserId != null ? parseInt(assigneeUserId, 10) : null)
        : undefined,
      status,
      taskListId: taskListId !== undefined ? resolvedListId : undefined,
      projectId: projectId !== undefined ? resolvedProjectId : undefined,
      isPrivate: isPrivate !== undefined ? !!isPrivate : undefined
    });
    if (updated?.hub_task_id) {
      try {
        if (status === 'completed') {
          await pool.execute(
            `UPDATE tasks SET status = 'completed', completed_at = COALESCE(completed_at, NOW()) WHERE id = ?`,
            [updated.hub_task_id]
          );
        } else if (status === 'pending' || status === 'in_progress') {
          await pool.execute(
            `UPDATE tasks SET status = 'pending', completed_at = NULL WHERE id = ?`,
            [updated.hub_task_id]
          );
        }
        if (title !== undefined || notes !== undefined) {
          await pool.execute(
            `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?`,
            [title != null ? String(title).trim() : null, notes !== undefined ? notes : null, updated.hub_task_id]
          );
        }
        if (taskListId !== undefined || projectId !== undefined) {
          await Task.updateCustomTask(updated.hub_task_id, {
            taskListId: resolvedListId,
            projectId: resolvedProjectId
          });
        }
      } catch { /* ignore hub sync errors */ }
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const completeActionItem = async (req, res, next) => {
  req.body = { ...(req.body || {}), status: 'completed' };
  return updateActionItem(req, res, next);
};

export const reopenActionItem = async (req, res, next) => {
  req.body = { ...(req.body || {}), status: 'pending' };
  return updateActionItem(req, res, next);
};
