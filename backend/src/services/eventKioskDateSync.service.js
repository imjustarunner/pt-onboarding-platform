import pool from '../config/database.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { syncIntegratedSkillsGroupAfterCompanyEventSave } from './skillBuildersEventSessions.service.js';
import { materializeSessionsForEvent } from './companyEventSessionDates.service.js';

function normalizeYmd(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/**
 * When company_events dates were edited but skills_groups / session rows were not
 * rebuilt, the kiosk hides the event or blocks check-in. Detect drift and resync.
 */
export async function ensureKioskSkillBuildersEventSynced({ agencyId, eventId } = {}) {
  const aid = Number(agencyId);
  const eid = Number(eventId);
  if (!aid || !eid) return { synced: false, reason: 'invalid_args' };

  const [rows] = await pool.execute(
    `SELECT ce.id, ce.event_type, ce.starts_at, ce.ends_at, ce.timezone,
            sg.id AS skills_group_id, sg.start_date, sg.end_date
     FROM company_events ce
     INNER JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     WHERE ce.id = ? AND ce.agency_id = ?
     LIMIT 1`,
    [eid, aid]
  );
  const row = rows?.[0];
  if (!row) return { synced: false, reason: 'not_found' };

  const eventType = String(row.event_type || '').toLowerCase();
  if (eventType === 'skills_group') {
    const tz = String(row.timezone || 'America/Denver').trim() || 'America/Denver';
    const ceStart = utcDateToZonedYmd(row.starts_at, tz);
    const ceEnd = utcDateToZonedYmd(row.ends_at, tz);
    const sgStart = normalizeYmd(row.start_date);
    const sgEnd = normalizeYmd(row.end_date);
    const drifted = !sgStart || !sgEnd || ceStart !== sgStart || ceEnd !== sgEnd;
    if (!drifted) return { synced: false, reason: 'already_aligned' };
    return syncIntegratedSkillsGroupAfterCompanyEventSave(pool, aid, eid);
  }

  await materializeSessionsForEvent(pool, { companyEventId: eid });
  return { synced: true, mode: 'program_session_dates' };
}

/**
 * Scan office-linked Skill Builders events and resync any whose skills_groups
 * calendar span no longer matches company_events (common after date edits).
 */
export async function resyncStaleKioskSkillBuildersEventsAtOffice(officeLocationId) {
  const lid = Number(officeLocationId);
  if (!lid) return { checked: 0, synced: 0 };

  const [rows] = await pool.execute(
    `SELECT ce.id AS event_id, ce.agency_id, ce.starts_at, ce.ends_at, ce.timezone,
            sg.start_date, sg.end_date
     FROM company_events ce
     INNER JOIN skills_groups sg ON sg.company_event_id = ce.id
     INNER JOIN office_location_agencies ola ON ola.agency_id = sg.agency_id AND ola.office_location_id = ?
     WHERE LOWER(COALESCE(ce.event_type, '')) = 'skills_group'
       AND ce.is_active = 1`,
    [lid]
  );

  let synced = 0;
  for (const row of rows || []) {
    const tz = String(row.timezone || 'America/Denver').trim() || 'America/Denver';
    const ceStart = utcDateToZonedYmd(row.starts_at, tz);
    const ceEnd = utcDateToZonedYmd(row.ends_at, tz);
    const sgStart = normalizeYmd(row.start_date);
    const sgEnd = normalizeYmd(row.end_date);
    const drifted = !sgStart || !sgEnd || ceStart !== sgStart || ceEnd !== sgEnd;
    if (!drifted) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await syncIntegratedSkillsGroupAfterCompanyEventSave(
        pool,
        Number(row.agency_id),
        Number(row.event_id)
      );
      if (r?.synced) synced += 1;
    } catch (err) {
      console.error('[resyncStaleKioskSkillBuildersEventsAtOffice] sync failed', {
        eventId: row.event_id,
        message: err?.message
      });
    }
  }

  return { checked: (rows || []).length, synced };
}

/**
 * Ensure program-event kiosk session dates match company_events recurrence.
 */
export async function ensureProgramEventKioskSessionsSynced(eventId) {
  const eid = Number(eventId);
  if (!eid) return { synced: false };
  const result = await materializeSessionsForEvent(pool, { companyEventId: eid });
  return { synced: true, ...result };
}

export default {
  ensureKioskSkillBuildersEventSynced,
  resyncStaleKioskSkillBuildersEventsAtOffice,
  ensureProgramEventKioskSessionsSynced
};
