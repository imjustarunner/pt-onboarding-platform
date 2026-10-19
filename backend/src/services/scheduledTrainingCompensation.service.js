import pool from '../config/database.js';
import { canManageMeetingCompensation } from './meetingClaimRate.service.js';
import { isStudentIntern } from '../utils/studentIntern.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export function validateTrainingCompensationOverrides(input, actor, roster, participants) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw fail(400, 'Training compensation overrides must be a list.');
  if (!input.length) return [];
  if (!canManageMeetingCompensation(actor)) throw fail(403, 'Only admins and superadmins may authorize a training compensation override.');
  const seen = new Set();
  return input.map(item => {
    const userId = Number(item?.userId);
    const user = roster.find(person => Number(person.id) === userId);
    if (!user || participants.get(userId) !== true || isStudentIntern(user)) throw fail(400, 'Compensation overrides require a mandatory, non-student staff participant.');
    if (seen.has(userId)) throw fail(400, 'Choose only one compensation override per participant.');
    seen.add(userId);
    if (item.rateType !== 'admin_time') throw fail(400, 'The scheduled training override supports Administrative time only.');
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (!reason || reason.length > 500) throw fail(400, 'Add a compensation override reason of 1–500 characters.');
    return { userId, rateType: 'admin_time', reason };
  });
}

export async function trainingCompensationOverrides(event, db = pool) {
  if (event.meeting_subtype !== 'training') return new Map();
  const [rows] = await db.execute(
    `SELECT user_id,rate_type,reason,authorized_by_user_id FROM scheduled_training_compensation_overrides WHERE event_id=? AND agency_id=?`,
    [event.id,event.agency_id]
  );
  return new Map(rows.filter(row => row.rate_type === 'admin_time').map(row => [Number(row.user_id),row]));
}
