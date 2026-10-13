import pool from '../config/database.js';
import { isInternRoleOrCredential } from '../utils/credentialNormalization.js';

// Clinical interns may have the platform role "provider" and a BA credential.
// Do not classify all bachelor's-level staff or prelicensed clinicians as interns.
export function isStudentIntern(user = {}) {
  return isInternRoleOrCredential(user)
    || ['intern', 'internship', 'practicum'].includes(String(user.employment_type || '').trim().toLowerCase())
    || /\b(intern|internship|practicum)\b/i.test(String(user.title || '')) && !/\b(mentor|supervisor|coordinator|director)\b/i.test(String(user.title || ''));
}
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
