import TaskProject from '../models/TaskProject.model.js';

export class ListProjectMismatchError extends Error {
  constructor(linkedProject) {
    super(
      'This shared list is already assigned to a different project. To select a different project, deselect the shared list.'
    );
    this.statusCode = 400;
    this.code = 'LIST_PROJECT_MISMATCH';
    this.linkedProjectId = linkedProject?.project_id ?? linkedProject?.id;
    this.linkedProjectName = linkedProject?.name ?? linkedProject?.project_name;
  }
}

function parseOptionalId(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * When a task is saved with a shared list and/or project:
 * - list only → inherit linked project (if any)
 * - project only → keep as-is
 * - both → attach list to project (if not already); reject if list is on a different project
 */
export async function resolveTaskListAndProject({ taskListId, projectId } = {}) {
  const listId = parseOptionalId(taskListId);
  let projId = parseOptionalId(projectId);

  if (!listId) {
    return { taskListId: null, projectId: projId, listAttachedToProject: false };
  }

  const linked = await TaskProject.findLinkedProjectForList(listId);

  if (!projId) {
    if (linked) projId = Number(linked.project_id);
    return { taskListId: listId, projectId: projId || null, listAttachedToProject: false };
  }

  if (linked && Number(linked.project_id) !== Number(projId)) {
    throw new ListProjectMismatchError(linked);
  }

  const wasLinked = !!linked;
  await TaskProject.attachList(projId, listId);
  return { taskListId: listId, projectId: projId, listAttachedToProject: !wasLinked };
}

export function sendListProjectError(res, err) {
  if (err?.code === 'LIST_PROJECT_MISMATCH') {
    return res.status(400).json({
      error: {
        message: err.message,
        code: err.code,
        linkedProjectId: err.linkedProjectId,
        linkedProjectName: err.linkedProjectName
      }
    });
  }
  return null;
}
