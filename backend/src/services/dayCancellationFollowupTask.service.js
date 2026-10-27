import pool from '../config/database.js';
import Task from '../models/Task.model.js';
export async function ensureDayCancellationTask(token, plan, actor) {
  const [[existing]] = await pool.execute("SELECT id FROM tasks WHERE source_ref_type='day_cancellation_notice' AND source_ref_id=?", [token]);
  if (existing) return existing.id;
  const task = await Task.create({ taskType: 'custom', title: `Review cancellation emails for ${plan.dates.join(', ')}`,
    description: 'Sessions have been canceled. Review the family and school emails, then approve sending them. No cancellation emails are sent by this task automatically.',
    assignedToUserId: plan.followupOwner === 'support' ? null : plan.providerId,
    assignedToRole: plan.followupOwner === 'support' ? 'support' : null,
    assignedToAgencyId: plan.scopes[0].agencyId, assignedByUserId: actor.id, urgency: 'high',
    sourceRefType: 'day_cancellation_notice', sourceRefId: token,
    metadata: { kind: 'day_cancellation_notice', providerId: plan.providerId, agencyId: plan.scopes[0].agencyId, date: plan.date, cancellationToken: token } });
  return task.id;
}
export async function completeDayCancellationTask(token) {
  await pool.execute("UPDATE tasks SET status='completed',completed_at=NOW() WHERE source_ref_type='day_cancellation_notice' AND source_ref_id=? AND status<>'completed'", [token]);
}
