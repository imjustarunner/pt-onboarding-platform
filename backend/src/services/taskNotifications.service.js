/**
 * Notification helpers for custom task assignment and dependency lifecycle.
 *
 * Rules:
 *  - Notify assignee when task is assigned ONLY if the task is NOT in 'waiting' state.
 *  - Notify assignee when a waiting task becomes active (status goes to 'pending').
 *  - When a task is set to 'waiting' after already sending an assignment notification,
 *    resolve (soft-remove) that notification so it stops appearing.
 *  - Shared-list notifications and personal assignment notifications are COALESCED:
 *    if the recipient already has an unread notification of the same kind, the count
 *    is incremented and the message is updated in place rather than creating a new row.
 *    Once the user marks the notification as read, the next event starts a fresh one.
 */
import Notification from '../models/Notification.model.js';
import pool from '../config/database.js';

/**
 * Returns the full name + agency_id for a user. Lightweight lookup.
 */
async function getUserMeta(userId) {
  if (!userId) return null;
  const [[row]] = await pool.execute(
    'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
    [userId]
  );
  return row || null;
}

/**
 * Send a `custom_task_assigned` notification to the assignee.
 * Skips silently if:
 *  - task is in 'waiting' status
 *  - assignee is the same as actorUserId (self-assign)
 *
 * Notifications are COALESCED per assignee: consecutive unread assignment
 * notifications are merged into one row whose count increments ("3 tasks
 * assigned to you") rather than one row per task.
 */
export async function notifyTaskAssigned({ task, actorUserId }) {
  try {
    const assigneeId = task?.assigned_to_user_id ?? task?.assignedToUserId;
    if (!assigneeId) return;
    if (Number(assigneeId) === Number(actorUserId)) return;
    if (task?.status === 'waiting') return;

    const agencyId = task?.assigned_to_agency_id ?? task?.assignedToAgencyId ?? null;
    const taskTitle = task?.title ?? 'A task';

    await Notification.coalesceOrCreate({
      type: 'custom_task_assigned',
      severity: 'info',
      title: 'Task assigned to you',
      userId: Number(assigneeId),
      agencyId: agencyId ? Number(agencyId) : null,
      // Scope to null/null so all assignment events for this user coalesce together.
      relatedEntityType: null,
      relatedEntityId: null,
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actorSource: 'task_assignment',
      batchDelta: 1,
      // First assignment: name the task. Subsequent: show the count.
      messageBuilder: (count) =>
        count === 1
          ? `"${taskTitle}" has been assigned to you.`
          : `${count} tasks have been assigned to you. Open your Task Hub to review them.`,
      titleBuilder: (count) =>
        count === 1 ? 'Task assigned to you' : `${count} tasks assigned to you`
    });
  } catch (err) {
    console.error('[taskNotifications] notifyTaskAssigned failed:', err);
  }
}

/**
 * Notify all members of a shared task list that a new task was added.
 * Notifications are COALESCED per member: if a member already has an unread
 * `task_list_activity` notification for this list, the count is incremented
 * and the message updated rather than creating a new notification row.
 *
 * @param {object} opts
 * @param {object} opts.task         - The newly created task object.
 * @param {number} opts.listId       - ID of the task list.
 * @param {string} opts.listName     - Display name of the task list.
 * @param {number} opts.agencyId     - Agency the list belongs to.
 * @param {number} [opts.actorUserId] - User who created the task (excluded from notifications).
 */
export async function notifyTaskAddedToList({ task, listId, listName, agencyId, actorUserId }) {
  try {
    // Lazy-import to avoid circular dependency with TaskListMember model.
    const { default: TaskListMember } = await import('../models/TaskListMember.model.js');

    const members = await TaskListMember.listByTaskList(listId);
    if (!members.length) return;

    const actorId = actorUserId ? Number(actorUserId) : null;
    const safeListName = listName || 'a shared task list';
    const lid = Number(listId);
    const aid = agencyId ? Number(agencyId) : null;

    for (const member of members) {
      const memberId = Number(member.user_id);
      if (memberId === actorId) continue; // Don't notify the person who added the task.

      await Notification.coalesceOrCreate({
        type: 'task_list_activity',
        severity: 'info',
        title: `New task in "${safeListName}"`,
        userId: memberId,
        agencyId: aid,
        relatedEntityType: 'task_list',
        relatedEntityId: lid,
        actorUserId: actorId,
        actorSource: 'task_list_activity',
        batchDelta: 1,
        messageBuilder: (count) =>
          count === 1
            ? `"${task.title}" was added to "${safeListName}".`
            : `${count} new tasks were added to "${safeListName}".`,
        titleBuilder: (count) =>
          count === 1
            ? `New task in "${safeListName}"`
            : `${count} new tasks in "${safeListName}"`
      });
    }
  } catch (err) {
    console.error('[taskNotifications] notifyTaskAddedToList failed:', err);
  }
}

/**
 * Send a `custom_task_unlocked` notification when a waiting task becomes active.
 * Called from TaskDependency.unlockDependents.
 */
export async function notifyTaskUnlocked({ task, unlockedByTaskTitle = null }) {
  try {
    const assigneeId = task?.assigned_to_user_id ?? task?.assignedToUserId;
    if (!assigneeId) return;

    const agencyId = task?.assigned_to_agency_id ?? task?.assignedToAgencyId ?? null;
    const context = unlockedByTaskTitle
      ? ` "${unlockedByTaskTitle}" was completed, so this task is now ready.`
      : ' Its blocker was completed.';

    await Notification.create({
      type: 'custom_task_unlocked',
      severity: 'info',
      title: 'Task is now active',
      message: `"${task.title}" is now ready for you.${context}`,
      userId: Number(assigneeId),
      agencyId: agencyId ? Number(agencyId) : null,
      relatedEntityType: 'task',
      relatedEntityId: task.id,
      actorUserId: null,
      actorSource: 'task_dependency'
    });
  } catch (err) {
    console.error('[taskNotifications] notifyTaskUnlocked failed:', err);
  }
}

/**
 * When a task transitions to 'waiting' status, resolve any outstanding
 * custom_task_assigned notifications for that task so the assignee is not
 * prompted about a task they can't yet act on.
 */
export async function resolveAssignmentNotificationForWaiting(taskId, agencyId) {
  try {
    if (!taskId) return;
    // Resolve all unresolved custom_task_assigned notifications for this task
    await pool.execute(
      `UPDATE notifications
         SET is_resolved = TRUE, resolved_at = NOW(),
             message = CONCAT(message, ' (This task is now waiting on a blocker.)')
       WHERE type = 'custom_task_assigned'
         AND related_entity_type = 'task'
         AND related_entity_id = ?
         AND is_resolved = FALSE`,
      [taskId]
    );
  } catch (err) {
    console.error('[taskNotifications] resolveAssignmentNotificationForWaiting failed:', err);
  }
}
