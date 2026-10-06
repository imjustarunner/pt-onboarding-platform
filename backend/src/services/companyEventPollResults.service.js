import pool from '../config/database.js';

const preferenceKey = eventId => {
  if (!Number.isSafeInteger(Number(eventId)) || Number(eventId) < 1) throw new Error('Invalid event');
  return `company_event_results_${Number(eventId)}`;
};
export async function getPollResultPreference(eventId, userId) {
  const [rows] = await pool.execute('SELECT JSON_UNQUOTE(JSON_EXTRACT(notification_categories, ?)) AS opted_in FROM user_preferences WHERE user_id = ?', [`$.${preferenceKey(eventId)}`, userId]);
  return rows[0]?.opted_in === 'true';
}
export async function setPollResultPreference(eventId, userId, optedIn) {
  if (typeof optedIn !== 'boolean') throw Object.assign(new Error('Choose whether to receive the results text'), { status: 400 });
  const key = preferenceKey(eventId);
  await pool.execute(`INSERT INTO user_preferences (user_id, notification_categories)
    VALUES (?, JSON_OBJECT(?, CAST(? AS JSON)))
    ON DUPLICATE KEY UPDATE notification_categories = JSON_SET(COALESCE(notification_categories, JSON_OBJECT()), ?, CAST(? AS JSON)), updated_at = CURRENT_TIMESTAMP`,
  [userId, key, JSON.stringify(optedIn), `$.${key}`, JSON.stringify(optedIn)]);
  return optedIn;
}
export function pollResultsMessage(event, summary) {
  const totals = summary.map(s => `${s.label}: ${s.total}`).join('; ') || 'No votes received';
  // Keep arbitrary poll labels out of the SMS when the full totals would be unwieldy.
  const body = `${event.title}: Voting is closed. Final totals: ${totals}. You requested this results text.`;
  return body.length <= 420 ? body : 'Your staff poll is closed. View the final totals in the app under Staff polls and results. You requested this results text.';
}
export async function deliverPollResults({ event, summary, recipients, send, optedIn = getPollResultPreference, db = pool }) {
  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const recipient of recipients) {
    const userId = Number(recipient.id);
    if (!recipient.phone || !await optedIn(event.id, userId)) { counts.skipped++; continue; }
    const conn = await db.getConnection();
    const lock = `poll-results-${event.id}-${userId}`;
    let locked = false;
    try {
      const [locks] = await conn.execute('SELECT GET_LOCK(?, 0) AS acquired', [lock]);
      locked = Number(locks[0]?.acquired) === 1;
      if (!locked) { counts.skipped++; continue; }
      const [prior] = await conn.execute("SELECT id FROM company_event_dispatch_logs WHERE company_event_id = ? AND user_id = ? AND channel = 'sms' AND dispatch_type = 'poll_results' LIMIT 1", [event.id, userId]);
      // A queued/failed delivery is not retried automatically: the carrier may already have accepted it.
      if (prior.length || !await optedIn(event.id, userId)) { counts.skipped++; continue; }
      const [record] = await conn.execute("INSERT INTO company_event_dispatch_logs (company_event_id,user_id,channel,dispatch_type,status) VALUES (?,?,'sms','poll_results','queued')", [event.id, userId]);
      try {
        await send({ userId, to: recipient.phone, body: pollResultsMessage(event, summary) });
        await conn.execute("UPDATE company_event_dispatch_logs SET status = 'sent', sent_at = NOW() WHERE id = ?", [record.insertId]);
        counts.sent++;
      } catch (error) {
        await conn.execute("UPDATE company_event_dispatch_logs SET status = 'failed', status_reason = ? WHERE id = ?", [String(error.code || 'delivery_failed').slice(0,255), record.insertId]);
        counts.failed++;
      }
    } finally {
      try { if (locked) await conn.execute('SELECT RELEASE_LOCK(?)', [lock]); } finally { conn.release(); }
    }
  }
  return counts;
}
