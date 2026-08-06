/**
 * Notification helpers for custom task assignment and dependency lifecycle.
 *
 * Rules:
 *  - Notify assignee when task is assigned ONLY if the task is NOT in 'waiting' state.
 *  - Notify assignee when a waiting task becomes active (status goes to 'pending').
 *  - When a task is set to 'waiting' after already sending an assignment notification,
 *    resolve (soft-remove) that notification so it stops appearing.
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
 */
export async function notifyTaskAssigned({ task, actorUserId }) {
  try {
    const assigneeId = task?.assigned_to_user_id ?? task?.assignedToUserId;
    if (!assigneeId) return;
    if (Number(assigneeId) === Number(actorUserId)) return;
    if (task?.status === 'waiting') return;

    const agencyId = task?.assigned_to_agency_id ?? task?.assignedToAgencyId ?? null;

    await Notification.create({
      type: 'custom_task_assigned',
      severity: 'info',
      title: 'Task assigned to you',
      message: `"${task.title}" has been assigned to you.`,
      userId: Number(assigneeId),
      agencyId: agencyId ? Number(agencyId) : null,
      relatedEntityType: 'task',
      relatedEntityId: task.id,
      actorUserId: actorUserId ? Number(actorUserId) : null,
      actorSource: 'task_assignment'
    });
  } catch (err) {
    console.error('[taskNotifications] notifyTaskAssigned failed:', err);
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
