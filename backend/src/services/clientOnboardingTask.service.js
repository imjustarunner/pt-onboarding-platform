/**
 * Creates a "New client on caseload" task for a provider when a client is assigned to them.
 * Task includes subtasks the provider must complete to engage with the new client.
 */
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import pool from '../config/database.js';

const DEFAULT_SUBTASKS = [
  { id: '1', title: 'Review client packet', is_completed: false },
  { id: '2', title: 'Contact guardian/parent', is_completed: false },
  { id: '3', title: 'Schedule first session', is_completed: false },
  { id: '4', title: 'Complete intake checklist', is_completed: false }
];

/**
 * Check if we already created a client onboarding task for this provider+client.
 */
async function hasExistingClientOnboardingTask(providerUserId, clientId) {
  const [rows] = await pool.execute(
    `SELECT id FROM tasks
     WHERE task_type = 'custom'
       AND assigned_to_user_id = ?
       AND status NOT IN ('completed', 'overridden')
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.clientId')) = ?
     LIMIT 1`,
    [providerUserId, String(clientId)]
  );
  return !!rows?.[0]?.id;
}

/**
 * Create a "New client on caseload" task for the provider with subtasks.
 * Called when a client is newly assigned to a provider (and optionally added to their day).
 *
 * @param {Object} opts
 * @param {number} opts.providerUserId - Provider user ID
 * @param {number} opts.clientId - Client ID
 * @param {string} opts.clientLabel - Client initials or name for display
 * @param {string|null} opts.serviceDay - e.g. "Monday"
 * @param {number|null} opts.assignedByUserId - User who assigned (for audit)
 */
export async function createClientOnboardingTaskForProvider({
  providerUserId,
  clientId,
  clientLabel,
  serviceDay,
  assignedByUserId
}) {
  if (!providerUserId || !clientId) return null;

  try {
    const existing = await hasExistingClientOnboardingTask(providerUserId, clientId);
    if (existing) return null;

    const subtasks = DEFAULT_SUBTASKS.map((s) => ({ ...s }));
    const metadata = {
      clientId,
      source: 'client_assignment',
      subtasks,
      serviceDay: serviceDay || null
    };

    const task = await Task.create({
      taskType: 'custom',
      title: `New client on your caseload: ${clientLabel || `Client #${clientId}`}`,
      description: serviceDay ? `Scheduled for ${serviceDay}. Complete the steps below to onboard this client.` : 'Complete the steps below to onboard this client.',
      assignedToUserId: providerUserId,
      assignedByUserId: assignedByUserId || providerUserId,
      dueDate: null,
      referenceId: null,
      metadata,
      urgency: 'high'
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: assignedByUserId || providerUserId,
      targetUserId: providerUserId,
      metadata: { source: 'client_assignment', clientId }
    });

    return task;
  } catch (err) {
    console.error('createClientOnboardingTaskForProvider:', err);
    return null;
  }
}
