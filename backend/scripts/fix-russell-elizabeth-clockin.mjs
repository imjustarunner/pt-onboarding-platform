/**
 * One-off: assign Elizabeth Lantz to Russell back-to-school event and backdate clock-in.
 * Safe to re-run (upserts assignment; skips punch if already clocked in).
 *
 * Usage: node backend/scripts/fix-russell-elizabeth-clockin.mjs
 */
import pool from '../src/config/database.js';
import { recordEventEmployeeClockIn } from '../src/services/skillBuildersEventKioskPunch.service.js';

const EVENT_TITLE_MATCH = '%back to school%russell%';
const STAFF_LAST = 'lantz';
const STAFF_FIRST = 'elizabeth';
const BACKDATE_MINUTES = 15;
const ASSIGNED_BY_USER_ID = 501;

async function main() {
  const [users] = await pool.execute(
    `SELECT id, first_name, last_name, email, status FROM users
     WHERE LOWER(last_name) = ? AND LOWER(first_name) LIKE ?
     ORDER BY id ASC LIMIT 5`,
    [STAFF_LAST, `${STAFF_FIRST}%`]
  );
  const user = users?.[0];
  if (!user) {
    throw new Error(`Staff not found: ${STAFF_FIRST} ${STAFF_LAST}`);
  }

  const [events] = await pool.execute(
    `SELECT id, title, agency_id, event_type, starts_at, timezone
     FROM company_events
     WHERE is_active = 1
       AND LOWER(title) LIKE ?
       AND starts_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
     ORDER BY starts_at DESC
     LIMIT 1`,
    [EVENT_TITLE_MATCH]
  );
  const ev = events?.[0];
  if (!ev) {
    throw new Error('Russell school event not found for today/recent window');
  }

  const [sessions] = await pool.execute(
    `SELECT id, session_date FROM company_event_session_dates
     WHERE company_event_id = ?
     ORDER BY session_date ASC LIMIT 1`,
    [ev.id]
  );
  const sessionDateId = sessions?.[0]?.id;
  if (!sessionDateId) {
    throw new Error(`No session date for event ${ev.id}`);
  }

  await pool.execute(
    `INSERT INTO company_event_session_providers
       (company_event_id, agency_id, session_date_id, provider_user_id, assigned_by_user_id,
        assigned_at, assignment_status, published_at, published_by_user_id)
     VALUES (?, ?, ?, ?, ?, NOW(), 'finalized', NOW(), ?)
     ON DUPLICATE KEY UPDATE
       assigned_by_user_id = VALUES(assigned_by_user_id),
       assigned_at = NOW(),
       assignment_status = 'finalized',
       published_at = COALESCE(company_event_session_providers.published_at, NOW()),
       published_by_user_id = COALESCE(company_event_session_providers.published_by_user_id, VALUES(published_by_user_id))`,
    [ev.id, ev.agency_id, sessionDateId, user.id, ASSIGNED_BY_USER_ID, ASSIGNED_BY_USER_ID]
  );

  const punchedAt = new Date(Date.now() - BACKDATE_MINUTES * 60 * 1000);
  const kioskDate = punchedAt.toISOString().slice(0, 10);

  const [openPunch] = await pool.execute(
    `SELECT id, punched_at FROM skill_builders_event_kiosk_punches
     WHERE company_event_id = ? AND user_id = ? AND punch_type = 'clock_in'
       AND id > COALESCE((
         SELECT MAX(id) FROM skill_builders_event_kiosk_punches p2
         WHERE p2.company_event_id = ? AND p2.user_id = ? AND p2.punch_type = 'clock_out'
       ), 0)
     ORDER BY id DESC LIMIT 1`,
    [ev.id, user.id, ev.id, user.id]
  );

  let punchResult = { ok: true, alreadyClockedIn: true, punchId: openPunch?.[0]?.id || null };
  if (!openPunch?.[0]) {
    punchResult = await recordEventEmployeeClockIn(pool, {
      agencyId: ev.agency_id,
      eventId: ev.id,
      userId: user.id,
      kioskDateYmd: kioskDate,
      source: 'school_events_kiosk',
      punchedAt
    });
  }

  try {
    await pool.execute(
      `INSERT INTO event_day_kiosk_checkins
         (company_event_id, agency_id, user_id, person_type, action, checked_in_at, kiosk_date, ip_address)
       VALUES (?, ?, ?, 'employee', 'check_in', ?, ?, NULL)`,
      [ev.id, ev.agency_id, user.id, punchedAt, kioskDate]
    );
  } catch (err) {
    if (err?.code !== 'ER_DUP_ENTRY' && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  console.log(JSON.stringify({
    ok: true,
    user: { id: user.id, name: `${user.first_name} ${user.last_name}`, status: user.status },
    event: { id: ev.id, title: ev.title, agencyId: ev.agency_id },
    sessionDateId,
    punchedAt: punchedAt.toISOString(),
    punch: punchResult
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
