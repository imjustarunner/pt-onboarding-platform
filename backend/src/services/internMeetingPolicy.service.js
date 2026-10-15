import pool from '../config/database.js';
import { isStudentIntern } from '../utils/studentIntern.js';
export { isStudentIntern } from '../utils/studentIntern.js';

export async function loadMeetingPayIdentity(userId, db = pool) {
  const [rows] = await db.execute('SELECT role, credential, title, employment_type FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows[0] || {};
}
export async function isUnpaidInternActivity(claim, db = pool) {
  const p = claim?.payload || {};
  if (p.unpaidIndirect === true) return true;
  if (!['meeting_compensation_auto','supervision_session_finalize','supervision_payroll_correction','provider_update','onboarding_portal','schedule_event_training_flag'].includes(p.source)) return false;
  return isStudentIntern(await loadMeetingPayIdentity(claim.user_id, db));
}
