import User from '../models/User.model.js';

const denied = () => Object.assign(new Error('Administrator access to this task’s organization is required.'), { status: 403 });
export async function administratorTaskAgency(user, requestedAgencyId, users = User) {
  if (user?.role === 'super_admin') return Number(requestedAgencyId) || null;
  if (user?.role !== 'admin') throw denied();
  const agencies = (await users.getAgencies(user.id)).filter(a => Number(a.is_active) !== 0 && !Number(a.is_archived));
  const agencyId = Number(requestedAgencyId || agencies[0]?.id);
  if (!agencyId || !agencies.some(a => Number(a.id) === agencyId)) throw denied();
  return agencyId;
}

export async function canAdministerTask(user, task, users = User) {
  if (user?.role === 'super_admin') return true;
  if (user?.role !== 'admin' || !Number(task?.assigned_to_agency_id)) return false;
  try { await administratorTaskAgency(user, task.assigned_to_agency_id, users); return true; }
  catch (error) { if (error.status === 403) return false; throw error; }
}

export async function assertTaskAdministration(user, task, users = User) {
  if (!await canAdministerTask(user, task, users)) throw denied();
}

export async function scopeTaskAssignment(req, users = User) {
  if (req.user?.role === 'super_admin') return;
  const agencyId = await administratorTaskAgency(req.user, req.body?.assignedToAgencyId || req.user.scopedAgencyId || req.headers?.['x-agency-id'], users);
  const userIds = req.body?.assignedToUserIds || (req.body?.assignedToUserId ? [req.body.assignedToUserId] : []);
  for (const userId of userIds) {
    if (!(await users.getAgencies(Number(userId))).some(a => Number(a.id) === agencyId && Number(a.is_active) !== 0)) throw denied();
  }
  req.body.assignedToAgencyId = agencyId;
}
