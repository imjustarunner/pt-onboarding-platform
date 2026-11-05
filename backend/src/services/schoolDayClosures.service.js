import pool from '../config/database.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { createSchoolPortalEvent } from './schoolPortalEvents.service.js';

export const SCHOOL_CLOSURE_EVENT_TYPES = ['school_holiday', 'school_day_off', 'school_sessions_prohibited'];

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function closureKind(eventType) {
  return String(eventType || '') === 'school_sessions_prohibited' ? 'sessions_prohibited' : 'no_school';
}

function zonedDay(value, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

/** Calendar days an active closure occupies inside [startDate, endDate). */
export function closureDates(row, startDate, endDate) {
  const timeZone = row?.timezone || 'America/Denver';
  const start = row?.starts_at instanceof Date ? row.starts_at : new Date(row?.starts_at);
  const endRaw = row?.ends_at instanceof Date ? row.ends_at : new Date(row?.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endRaw.getTime())) return [];
  const end = new Date(endRaw.getTime() - 1000);
  let cursor = zonedDay(start, timeZone);
  const last = zonedDay(end, timeZone);
  const dates = [];
  for (let guard = 0; guard < 40 && cursor <= last; guard += 1) {
    if (cursor >= startDate && cursor < endDate) dates.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return dates;
}

function closureRank(item) {
  return (item.scope === 'school' ? 0 : 2) + (item.kind === 'no_school' ? 0 : 1);
}

export function closureRecords(rows, schools, startDate, endDate) {
  const bySchool = new Map((schools || []).map(school => [Number(school.schoolOrgId), school]));
  const found = [];
  for (const row of rows || []) {
    const scope = row.organization_id == null ? 'district' : 'school';
    const district = String(row.district_name || '').trim().toLowerCase();
    const targets = scope === 'school'
      ? [bySchool.get(Number(row.organization_id))].filter(Boolean)
      : (schools || []).filter(school => String(school.districtName || '').trim().toLowerCase() === district && district);
    for (const school of targets) {
      for (const date of closureDates(row, startDate, endDate)) {
        found.push({
          schoolOrgId: Number(school.schoolOrgId),
          agencyId: Number(row.agency_id || school.agencyId || 0) || null,
          date,
          kind: closureKind(row.event_type),
          reason: String(row.description || '').trim() || String(row.title || '').trim(),
          title: String(row.title || '').trim(),
          scope,
          districtName: row.district_name ? String(row.district_name).trim() : null,
          recordedByName: String(row.recorded_by_name || '').trim() || null,
          recordedAt: row.created_at || null,
          eventId: Number(row.id) || null
        });
      }
    }
  }
  const best = new Map();
  for (const item of found) {
    const key = `${item.schoolOrgId}:${item.date}`;
    const current = best.get(key);
    if (!current || closureRank(item) < closureRank(current)) best.set(key, item);
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date) || a.schoolOrgId - b.schoolOrgId);
}

export function createSchoolDayClosures({ db = pool, createEvent = createSchoolPortalEvent } = {}) {
  async function assignedSchools(providerId, agencyIds) {
    const ids = [...new Set((agencyIds || []).map(Number).filter(id => id > 0))];
    if (!ids.length) return [];
    const [rows] = await db.execute(
      `SELECT psa.school_organization_id AS schoolOrgId, oa.agency_id AS agencyId, sp.district_name AS districtName
       FROM provider_school_assignments psa
       JOIN organization_affiliations oa
         ON oa.organization_id = psa.school_organization_id AND oa.is_active = 1
       LEFT JOIN school_profiles sp ON sp.school_organization_id = psa.school_organization_id
       WHERE psa.provider_user_id = ? AND psa.is_active = 1
         AND oa.agency_id IN (${ids.map(() => '?').join(',')})`,
      [providerId, ...ids]
    );
    const seen = new Set();
    return (rows || []).filter(row => {
      const key = Number(row.schoolOrgId);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function listProviderSchoolDayClosures({ providerId, agencyIds, startDate, endDate }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) return [];
    const schools = await assignedSchools(providerId, agencyIds);
    if (!schools.length) return [];
    const schoolIds = schools.map(school => Number(school.schoolOrgId));
    const agencies = [...new Set(schools.map(school => Number(school.agencyId)).filter(id => id > 0))];
    const [rows] = await db.execute(
      `SELECT ce.id, ce.agency_id, ce.organization_id, ce.district_name, ce.event_type, ce.title, ce.description,
              ce.starts_at, ce.ends_at, ce.timezone, ce.created_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS recorded_by_name
       FROM company_events ce
       LEFT JOIN users u ON u.id = ce.created_by_user_id
       WHERE ce.is_active = 1
         AND ce.school_event_status IN ('scheduled', 'rescheduled')
         AND ce.event_type IN (${SCHOOL_CLOSURE_EVENT_TYPES.map(() => '?').join(',')})
         AND ce.agency_id IN (${agencies.map(() => '?').join(',')})
         AND ce.starts_at < DATE_ADD(?, INTERVAL 2 DAY)
         AND ce.ends_at > DATE_SUB(?, INTERVAL 1 DAY)
         AND (ce.organization_id IN (${schoolIds.map(() => '?').join(',')}) OR ce.organization_id IS NULL)`,
      [...SCHOOL_CLOSURE_EVENT_TYPES, ...agencies, endDate, startDate, ...schoolIds]
    );
    return closureRecords(rows, schools, startDate, endDate);
  }

  async function markSchoolNoSchoolDay({ providerId, agencyId, schoolOrgId, userId, date, reason, timeZone = 'America/Denver' }) {
    const day = String(date || '').slice(0, 10);
    const why = String(reason || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail('Choose a school day.');
    if (!why || why.length > 500) throw fail('Say why this school day is canceled (up to 500 characters).');
    const schoolId = Number(schoolOrgId);
    const aid = Number(agencyId);
    if (!schoolId || !aid) throw fail('School and agency are required.');
    const [assigned] = await db.execute(
      `SELECT psa.id
       FROM provider_school_assignments psa
       JOIN organization_affiliations oa
         ON oa.organization_id = psa.school_organization_id AND oa.agency_id = ? AND oa.is_active = 1
       WHERE psa.provider_user_id = ? AND psa.school_organization_id = ? AND psa.is_active = 1
       LIMIT 1`,
      [aid, providerId, schoolId]
    );
    if (!assigned?.[0]) throw fail('This provider is not assigned to that school.', 404);
    const existing = await listProviderSchoolDayClosures({
      providerId, agencyIds: [aid], startDate: day, endDate: addDaysYmd(day, 1)
    });
    const already = existing.find(item => item.schoolOrgId === schoolId && item.date === day);
    if (already) return { alreadyClosed: true, closure: already };
    const startUtc = wallMysqlToUtcMysql(`${day} 00:00:00`, timeZone);
    const endUtc = wallMysqlToUtcMysql(`${day} 23:59:59`, timeZone);
    if (!startUtc || !endUtc) throw fail('Choose a valid timezone.');
    const created = await createEvent({
      agencyId: aid,
      organizationId: schoolId,
      userId,
      title: 'No school',
      description: why,
      category: 'day_off',
      startsAt: new Date(`${startUtc.replace(' ', 'T')}Z`),
      endsAt: new Date(`${endUtc.replace(' ', 'T')}Z`),
      timezone: timeZone,
      schoolEventStatus: 'scheduled'
    });
    const [actors] = await db.execute('SELECT CONCAT_WS(\' \', first_name, last_name) AS name FROM users WHERE id = ? LIMIT 1', [userId]);
    return {
      alreadyClosed: false,
      closure: {
        schoolOrgId: schoolId,
        agencyId: aid,
        date: day,
        kind: 'no_school',
        reason: why,
        title: 'No school',
        scope: 'school',
        districtName: null,
        recordedByName: String(actors?.[0]?.name || '').trim() || null,
        recordedAt: new Date().toISOString(),
        eventId: Number(created?.id) || null
      }
    };
  }

  return { listProviderSchoolDayClosures, markSchoolNoSchoolDay };
}

const schoolDayClosures = createSchoolDayClosures();
export const listProviderSchoolDayClosures = (...args) => schoolDayClosures.listProviderSchoolDayClosures(...args);
export const markSchoolNoSchoolDay = (...args) => schoolDayClosures.markSchoolNoSchoolDay(...args);
