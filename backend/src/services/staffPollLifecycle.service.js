import pool from '../config/database.js';
import { pollClosedAt, pollDeadline } from '../utils/staffPollPresentation.js';

const configFor = row => typeof row.voting_config_json === 'string' ? JSON.parse(row.voting_config_json) : row.voting_config_json || {};
const closedError = () => Object.assign(new Error('Voting has closed. Your previous response is unchanged.'), { status: 409, code: 'poll_closed' });

async function lockedPoll(eventId, agencyId, action, db) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ? FOR UPDATE', [eventId, agencyId]);
    if (!row || !Number(row.is_active) || !configFor(row).enabled) throw Object.assign(new Error('Poll not found'), { status: 404 });
    const result = await action(row, conn);
    await conn.commit();
    return result;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

// Votes and closure take the same event lock. A reply that loses the race to a
// manual close or reaches its deadline cannot overwrite the saved response.
export async function saveStaffPollVote({ eventId, agencyId, userId, response, source, fromNumber = null }, db = pool) {
  return lockedPoll(eventId, agencyId, async (row, conn) => {
    if (pollClosedAt(row)) throw closedError();
    await conn.execute(`INSERT INTO company_event_responses
      (company_event_id, user_id, response_key, response_label, response_body, source, from_number, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE response_key = VALUES(response_key), response_label = VALUES(response_label),
        response_body = VALUES(response_body), source = VALUES(source), from_number = VALUES(from_number), received_at = VALUES(received_at)`,
    [eventId, userId, response.key, response.label, response.raw, source, fromNumber]);
  }, db);
}

export async function scheduleStaffPollClosing({ eventId, agencyId, closesAt, actorUserId }, db = pool) {
  const time = new Date(closesAt).getTime();
  if (!closesAt || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(String(closesAt)) || !Number.isFinite(time) || time <= Date.now()) {
    throw Object.assign(new Error('Choose a future closing date and time.'), { status: 400 });
  }
  return lockedPoll(eventId, agencyId, async (row, conn) => {
    if (pollClosedAt(row)) throw closedError();
    const config = { ...configFor(row), closesAt: new Date(time).toISOString() };
    // A standalone poll uses its end time as the listing window. An actual
    // event keeps its own schedule, independent of the RSVP/poll deadline.
    await conn.execute(`UPDATE company_events SET voting_config_json = ?,
      ends_at = CASE WHEN event_type = 'team_poll' THEN ? ELSE ends_at END,
      updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?`,
    [JSON.stringify(config), new Date(time), actorUserId, eventId, agencyId]);
    return { closesAt: config.closesAt };
  }, db);
}

export async function closeStaffPoll({ eventId, agencyId, scheduledOnly = false }, db = pool) {
  return lockedPoll(eventId, agencyId, async (row, conn) => {
    if (row.voting_closed_at) return { closed: false, row };
    const config = configFor(row);
    if (scheduledOnly && (!config.closesAt || new Date(config.closesAt).getTime() > Date.now())) return { closed: false, row };
    const closedAt = scheduledOnly ? new Date(pollDeadline(row)) : new Date();
    if (!Number.isFinite(closedAt.getTime())) return { closed: false, row };
    await conn.execute('UPDATE company_events SET voting_closed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?', [closedAt, eventId, agencyId]);
    return { closed: true, row: { ...row, voting_closed_at: closedAt } };
  }, db);
}
