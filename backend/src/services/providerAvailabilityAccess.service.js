import pool from '../config/database.js';

const MANAGERS = new Set(['super_admin', 'superadmin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff']);

/** Keep edits scoped to the selected tenant and provider, including book-on-behalf. */
export async function requireProviderAvailabilityAccess({ actor, agencyId, providerId }) {
  const actorId = Number(actor?.id);
  const aid = Number(agencyId);
  const pid = Number(providerId);
  const deny = () => { throw Object.assign(new Error('Access denied'), { status: 403 }); };
  if (!Number.isSafeInteger(pid) || pid <= 0 || !actorId || !aid) deny();
  const role = String(actor?.role || '').toLowerCase();
  if (!['super_admin', 'superadmin'].includes(role)) {
    const [membership] = await pool.execute('SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1', [actorId, aid]);
    if (!membership.length) deny();
  }
  if (pid !== actorId && !MANAGERS.has(role)) {
    const [assignment] = role === 'supervisor'
      ? await pool.execute('SELECT 1 FROM supervisor_assignments WHERE supervisor_id = ? AND supervisee_id = ? AND agency_id = ? LIMIT 1', [actorId, pid, aid])
      : [[]];
    if (!assignment.length) deny();
  }
  const [target] = await pool.execute('SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1', [pid, aid]);
  if (!target.length) deny();
  return pid;
}
