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
  if (String(task.task_type) !== 'custom') {
    return res.status(400).json({ error: { message: 'Comments only supported for custom tasks' } });
  }
  if (task.task_list_id) {
    const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
    if (!membership) return res.status(403).json({ error: { message: 'You must be a list member' } });
  } else {
    if (Number(task.assigned_to_user_id) !== Number(userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
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
      const membership = task.task_list_id
        ? await TaskListMember.findByListAndUser(task.task_list_id, rid)
        : null;
      if (!membership && task.task_list_id) continue; // only notify list members
      if (!task.task_list_id && Number(task.assigned_to_user_id) !== Number(rid)) continue;

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
