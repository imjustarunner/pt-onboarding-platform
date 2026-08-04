import Task from '../models/Task.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import TaskProject from '../models/TaskProject.model.js';
import TaskCollaborator from '../models/TaskCollaborator.model.js';

export async function allowedCollaboratorUserIds(task) {
  const listId = task?.task_list_id;
  const projectId = task?.project_id;
  if (!listId && !projectId) return new Set();

  let allowed = null;

  if (listId) {
    const members = await TaskListMember.listByTaskList(listId);
    allowed = new Set(members.map((m) => Number(m.user_id)));
  }

  if (projectId) {
    const members = await TaskProject.listMembers(projectId);
    const projectIds = new Set(members.map((m) => Number(m.user_id)));
    allowed = allowed
      ? new Set([...allowed].filter((id) => projectIds.has(id)))
      : projectIds;
  }

  return allowed || new Set();
}

export async function validateCollaboratorUserIds(task, userIds = [], { excludeAssignee = true } = {}) {
  const listId = task?.task_list_id;
  const projectId = task?.project_id;
  const candidates = [...new Set(
    (userIds || []).map((n) => parseInt(n, 10)).filter((n) => n > 0)
  )];

  if (!candidates.length) return [];

  if (!listId && !projectId) {
    const err = new Error('Collaborators are only available for tasks on a shared list or project');
    err.statusCode = 400;
    throw err;
  }

  const allowed = await allowedCollaboratorUserIds(task);
  const assigneeId = task?.assigned_to_user_id ? Number(task.assigned_to_user_id) : null;
  const invalid = candidates.filter((id) => !allowed.has(id));
  if (invalid.length) {
    const err = new Error('Collaborators must be members of the task shared list and/or project');
    err.statusCode = 400;
    throw err;
  }

  return candidates.filter((id) => !(excludeAssignee && assigneeId && id === assigneeId));
}

export async function syncCollaboratorsForTask(taskId) {
  const task = await Task.findById(taskId);
  if (!task) return [];
  if (!task.task_list_id && !task.project_id) {
    await TaskCollaborator.clearForTask(taskId);
    return [];
  }
  const allowed = await allowedCollaboratorUserIds(task);
  return TaskCollaborator.pruneToAllowed(taskId, [...allowed]);
}
