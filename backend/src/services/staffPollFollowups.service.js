import pool from '../config/database.js';
import { pollClosedAt, pollDeadline } from '../utils/staffPollPresentation.js';

export function duePollFollowup(event, now = Date.now()) {
  const config = event.reminderConfig || {};
  if (!config.enabled || pollClosedAt(event, now)) return null;
  const target = event.eventType === 'team_poll' || config.anchor === 'poll_close'
    ? pollDeadline(event) : event.nextOccurrenceStart || event.startsAt;
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs) || targetMs <= now) return null;
  const due = (config.offsetsHours || []).map(hours => ({ hours, at: targetMs - hours * 3600000 })).filter(item => item.at <= now).sort((a,b) => b.at - a.at)[0];
  // Catch up only the most recent due reminder, never a burst of overdue reminders.
  return due ? { ...due, key: `scheduled:${new Date(targetMs).toISOString()}:${due.hours}h` } : null;
}

export async function withPollFollowupLock(eventId, action, db = pool) {
  const conn = await db.getConnection();
  const key = `company-poll-followup:${Number(eventId)}`;
  let acquired = false;
  try {
    const [[row]] = await conn.execute('SELECT GET_LOCK(?, 0) AS acquired', [key]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired) throw Object.assign(new Error('A follow-up is already being sent for this poll. Refresh delivery history shortly.'), { status: 409 });
    return await action();
  } finally {
    try { if (acquired) await conn.execute('SELECT RELEASE_LOCK(?)', [key]); }
    finally { conn.release(); }
  }
}
