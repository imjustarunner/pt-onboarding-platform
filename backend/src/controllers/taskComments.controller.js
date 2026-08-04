/**
 * Task comments - discussion and @mentions on shared list tasks.
 * Uses same access as task attachments: list members can read/write.
 */
import Task from '../models/Task.model.js';
import TaskComment, { parseMentionedUserIds } from '../models/TaskComment.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import TaskList from '../models/TaskList.model.js';
import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';

export async function requireTaskCommentAccess(req, res, next) {
  const userId = req.user?.id;
  const taskId = parseInt(req.params.id || req.params.taskId, 10);
  if (!userId || !taskId) {
    return res.status(400).json({ error: { message: 'Invalid request' } });
  }
  const task = await Task.findById(taskId);
  if (!task) return res.status(404).json({ error: { message: 'Task not found' } });
  // Allow comments on custom hub tasks and other task types the user can see.
  const role = String(req.user?.role || '').toLowerCase();
  const isManager = ['super_admin', 'superadmin', 'admin', 'support'].includes(role);
  const isAssignee = Number(task.assigned_to_user_id) === Number(userId);
  const isCreator = Number(task.assigned_by_user_id) === Number(userId)
    || Number(task.created_by_user_id) === Number(userId);

  let isListMember = false;
  if (task.task_list_id) {
    const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
    isListMember = !!membership;
  }

  let isCollaborator = false;
  try {
    const TaskCollaborator = (await import('../models/TaskCollaborator.model.js')).default;
    const collaborators = await TaskCollaborator.listForTask(taskId);
    isCollaborator = (collaborators || []).some((c) => Number(c.user_id) === Number(userId));
  } catch {
    isCollaborator = false;
  }

  if (!isManager && !isAssignee && !isCreator && !isListMember && !isCollaborator) {
    return res.status(403).json({ error: { message: 'Access denied' } });
  }
  req.task = task;
  req.taskId = taskId;
  next();
}

export const listComments = async (req, res, next) => {
  try {
    const taskId = req.taskId;
    const comments = await TaskComment.listByTaskId(taskId);
    res.json(comments);
  } catch (err) {
    next(err);
  }
};

export const createComment = async (req, res, next) => {
  try {
    const taskId = req.taskId;
    const userId = req.user.id;
    const body = (req.body?.body || '').trim();
    if (!body) {
      return res.status(400).json({ error: { message: 'body is required' } });
    }

    const comment = await TaskComment.create({ taskId, userId, body });
    if (!comment) return res.status(500).json({ error: { message: 'Failed to create comment' } });

    const mentionedIds = parseMentionedUserIds(body).filter((id) => Number(id) !== Number(userId));
    const task = req.task;
    let agencyId = task.assigned_to_agency_id || null;
    if (!agencyId && task.task_list_id) {
      const list = await TaskList.findById(task.task_list_id);
      agencyId = list?.agency_id || null;
    }

    const author = await User.findById(userId);
    const authorName = [author?.first_name, author?.last_name].filter(Boolean).join(' ') || 'Someone';
    const snippet = body.length > 120 ? body.slice(0, 117) + '…' : body;

    for (const rid of mentionedIds) {
      // Notify anyone @mentioned who exists (visibility already gated by comment access).
      const mentioned = await User.findById(rid);
      if (!mentioned) continue;

      await Notification.create({
        type: 'task_comment_mention',
        severity: 'info',
        title: 'Mentioned in task comment',
        message: `${authorName} on "${task.title}": ${snippet}`,
        userId: rid,
        agencyId,
        relatedEntityType: 'task',
        relatedEntityId: taskId,
        actorUserId: userId
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};
