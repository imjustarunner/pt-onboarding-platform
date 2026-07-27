#!/usr/bin/env node
/**
 * Resync kiosk session dates after a company event date change.
 *
 * Usage:
 *   node backend/scripts/resync-event-kiosk-dates.mjs --search Twain
 *   node backend/scripts/resync-event-kiosk-dates.mjs --eventId 123 --agencyId 1
 *   node backend/scripts/resync-event-kiosk-dates.mjs --search Twain --week 2026-07-27
 */
import pool from '../src/config/database.js';
import { syncIntegratedSkillsGroupAfterCompanyEventSave } from '../src/services/skillBuildersEventSessions.service.js';
import { materializeSessionsForEvent } from '../src/services/companyEventSessionDates.service.js';
import { utcDateToZonedYmd } from '../src/utils/zonedWallTime.util.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--search') out.search = argv[++i];
    else if (a === '--eventId') out.eventId = Number(argv[++i]);
    else if (a === '--agencyId') out.agencyId = Number(argv[++i]);
    else if (a === '--week') out.weekStart = String(argv[++i] || '').slice(0, 10);
  }
  return out;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

async function findEvents({ search, eventId, agencyId }) {
  if (eventId && agencyId) {
    const [rows] = await pool.execute(
      `SELECT ce.id, ce.agency_id, ce.title, ce.event_type, ce.starts_at, ce.ends_at, ce.timezone,
              sg.id AS skills_group_id, sg.start_date, sg.end_date
       FROM company_events ce
       LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
       WHERE ce.id = ? AND ce.agency_id = ?
       LIMIT 1`,
      [eventId, agencyId]
    );
    return rows || [];
  }

  const term = String(search || '').trim();
  if (!term) {
    const [rows] = await pool.execute(
      `SELECT ce.id, ce.agency_id, ce.title, ce.event_type, ce.starts_at, ce.ends_at, ce.timezone,
              sg.id AS skills_group_id, sg.start_date, sg.end_date
       FROM company_events ce
       LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
       WHERE LOWER(COALESCE(ce.event_type, '')) IN ('skills_group', 'program_event', 'guardian_program_class')
         AND ce.is_active = 1
       ORDER BY ce.id DESC
       LIMIT 1`
    );
    return rows || [];
  }

  const [rows] = await pool.execute(
    `SELECT ce.id, ce.agency_id, ce.title, ce.event_type, ce.starts_at, ce.ends_at, ce.timezone,
            sg.id AS skills_group_id, sg.start_date, sg.end_date, a.slug AS agency_slug
     FROM company_events ce
     LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     LEFT JOIN agencies a ON a.id = ce.agency_id
     WHERE (
       LOWER(ce.title) LIKE ?
       OR LOWER(COALESCE(sg.name, '')) LIKE ?
       OR LOWER(COALESCE(a.name, '')) LIKE ?
     )
     ORDER BY ce.id DESC
     LIMIT 5`,
    [`%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`]
  );
  return rows || [];
}

async function resyncEvent(row) {
  const eventType = String(row.event_type || '').toLowerCase();
  const agencyId = Number(row.agency_id);
  const eventId = Number(row.id);
  const tz = String(row.timezone || 'America/Denver').trim() || 'America/Denver';
  const ceStart = utcDateToZonedYmd(row.starts_at, tz);
  const ceEnd = utcDateToZonedYmd(row.ends_at, tz);

  console.log(`\nEvent #${eventId} — ${row.title} (${eventType})`);
  console.log(`  company_events: ${ceStart} → ${ceEnd}`);
  if (row.skills_group_id) {
    console.log(`  skills_groups:  ${String(row.start_date).slice(0, 10)} → ${String(row.end_date).slice(0, 10)}`);
  }

  if (eventType === 'skills_group' && row.skills_group_id) {
    const result = await syncIntegratedSkillsGroupAfterCompanyEventSave(pool, agencyId, eventId);
    console.log('  skills_group sync:', result);
    return result;
  }

  const result = await materializeSessionsForEvent(pool, { companyEventId: eventId });
  console.log('  program session dates:', result);

  const [sessionRows] = await pool.execute(
    `SELECT session_date FROM company_event_session_dates
     WHERE company_event_id = ? ORDER BY session_date ASC`,
    [eventId]
  );
  console.log('  session dates:', (sessionRows || []).map((r) => String(r.session_date).slice(0, 10)).join(', ') || '(none)');
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const events = await findEvents(args);
  if (!events.length) {
    console.error('No matching events found.');
    process.exit(1);
  }

  if (events.length > 1) {
    console.log('Multiple matches — resyncing all:');
    for (const e of events) console.log(`  #${e.id} ${e.title}`);
  }

  for (const row of events) {
    // eslint-disable-next-line no-await-in-loop
    await resyncEvent(row);
  }

  if (args.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(args.weekStart)) {
    const weekEnd = addDaysYmd(args.weekStart, 6);
    console.log(`\nWeek window ${args.weekStart} → ${weekEnd}`);
    for (const row of events) {
      const [sb] = await pool.execute(
        `SELECT session_date FROM skill_builders_event_sessions
         WHERE company_event_id = ? AND session_date >= ? AND session_date <= ?
         ORDER BY session_date`,
        [row.id, args.weekStart, weekEnd]
      );
      console.log(`  #${row.id} skill_builders_event_sessions:`, (sb || []).map((r) => String(r.session_date).slice(0, 10)).join(', ') || '(none)');
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
