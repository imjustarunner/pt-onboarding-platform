import pool from '../config/database.js';

const USER_NAME_SQL = `TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))`;

function busyFromScheduleEvent(ev) {
  if (!ev) return null;
  const kind = String(ev.kind || '').toUpperCase();
  const title = String(ev.title || '').trim() || null;
  if (kind === 'TEAM_MEETING') {
    return { label: 'In Meeting', activityType: 'team_meeting', detail: title, source: 'schedule_event' };
  }
  if (kind === 'HUDDLE') {
    return { label: 'In Meeting', activityType: 'huddle', detail: title, source: 'schedule_event' };
  }
  if (kind === 'SUPERVISION') {
    return { label: 'In Supervision', activityType: 'supervision', detail: title, source: 'schedule_event' };
  }
  if (kind === 'INDIRECT_SERVICES') {
    return { label: 'Busy', activityType: 'indirect', detail: title, source: 'schedule_event' };
  }
  if (ev.client_id || kind.includes('SESSION')) {
    return { label: 'In Session', activityType: 'session', detail: title, source: 'schedule_event' };
  }
  return null;
}

function busyFromAppointment(appt) {
  if (!appt) return null;
  const code = String(appt.appointment_type_code || '').toLowerCase();
  if (code.includes('supervision')) {
    return { label: 'In Supervision', activityType: 'supervision', source: 'appointment' };
  }
  return { label: 'In Session', activityType: 'session', source: 'appointment' };
}

function busyFromSupervisionSession(row) {
  if (!row) return null;
  const counterparty = String(row.counterparty_name || '').trim() || null;
  return {
    label: 'In Supervision',
    activityType: 'supervision',
    detail: counterparty,
    source: 'supervision_session'
  };
}

function hasExplicitAwaySignal(row) {
  if (!row || row.planned_out_active) return true;
  const rich = String(row.presence_status || '').trim();
  if (rich.startsWith('out_') || rich === 'traveling_offsite' || rich === 'in_heads_down') return true;
  if (row.status === 'idle' && row.presence_reason) return true;
  return false;
}

/**
 * Resolve a calendar-busy label for a user based on current schedule events / appointments.
 * Returns { label, activityType, detail?, source } or null.
 */
export async function getCurrentCalendarBusyForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return null;

  try {
    const [eventRows] = await pool.execute(
      `SELECT e.id, e.kind, e.title, e.client_id
       FROM provider_schedule_events e
       WHERE e.provider_id = ?
         AND UPPER(COALESCE(e.status, 'ACTIVE')) = 'ACTIVE'
         AND e.all_day = 0
         AND e.start_at IS NOT NULL
         AND e.end_at IS NOT NULL
         AND e.start_at <= UTC_TIMESTAMP()
         AND e.end_at > UTC_TIMESTAMP()
       ORDER BY e.start_at DESC
       LIMIT 1`,
      [uid]
    );
    const fromEvent = busyFromScheduleEvent(eventRows?.[0] || null);
    if (fromEvent) return fromEvent;

    const [supervisionRows] = await pool.execute(
      `SELECT ss.id,
              CASE
                WHEN ss.supervisor_user_id = ? THEN TRIM(CONCAT(COALESCE(su.first_name, ''), ' ', COALESCE(su.last_name, '')))
                ELSE TRIM(CONCAT(COALESCE(sv.first_name, ''), ' ', COALESCE(sv.last_name, '')))
              END AS counterparty_name
       FROM supervision_sessions ss
       LEFT JOIN users su ON su.id = ss.supervisee_user_id
       LEFT JOIN users sv ON sv.id = ss.supervisor_user_id
       WHERE (ss.supervisor_user_id = ? OR ss.supervisee_user_id = ?)
         AND UPPER(COALESCE(ss.status, '')) NOT IN ('CANCELLED', 'CANCELED')
         AND ss.start_at <= UTC_TIMESTAMP()
         AND ss.end_at > UTC_TIMESTAMP()
       ORDER BY ss.start_at DESC
       LIMIT 1`,
      [uid, uid, uid]
    );
    const fromSupervision = busyFromSupervisionSession(supervisionRows?.[0] || null);
    if (fromSupervision) return fromSupervision;

    const [apptRows] = await pool.execute(
      `SELECT a.id, a.appointment_type_code, a.status
       FROM appointments a
       WHERE a.provider_user_id = ?
         AND a.start_at IS NOT NULL
         AND a.end_at IS NOT NULL
         AND a.start_at <= UTC_TIMESTAMP()
         AND a.end_at > UTC_TIMESTAMP()
         AND UPPER(COALESCE(a.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'NO_SHOW')
       ORDER BY a.start_at DESC
       LIMIT 1`,
      [uid]
    );
    return busyFromAppointment(apptRows?.[0] || null);
  } catch (e) {
    const msg = String(e?.message || '');
    if (
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column')
    ) {
      return null;
    }
    throw e;
  }
}

/**
 * Batch-load current busy labels for many users (one/two queries).
 * Returns Map<userId, { label, activityType, detail? }>
 */
export async function getCurrentCalendarBusyMap(userIds) {
  const ids = [...new Set((userIds || []).map((n) => Number(n)).filter((n) => n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const ph = ids.map(() => '?').join(',');

  try {
    const [eventRows] = await pool.execute(
      `SELECT e.provider_id AS user_id, e.kind, e.title, e.client_id
       FROM provider_schedule_events e
       WHERE e.provider_id IN (${ph})
         AND UPPER(COALESCE(e.status, 'ACTIVE')) = 'ACTIVE'
         AND e.all_day = 0
         AND e.start_at IS NOT NULL
         AND e.end_at IS NOT NULL
         AND e.start_at <= UTC_TIMESTAMP()
         AND e.end_at > UTC_TIMESTAMP()`,
      ids
    );
    for (const ev of eventRows || []) {
      const uid = Number(ev.user_id);
      if (!uid || map.has(uid)) continue;
      const busy = busyFromScheduleEvent(ev);
      if (busy) map.set(uid, busy);
    }

    const missingAfterEvents = ids.filter((id) => !map.has(id));
    if (missingAfterEvents.length) {
      const ph2 = missingAfterEvents.map(() => '?').join(',');
      const supervisorNameSql = USER_NAME_SQL.replace(/u\./g, 'su.');
      const superviseeNameSql = USER_NAME_SQL.replace(/u\./g, 'sv.');
      const [supervisionRows] = await pool.execute(
        `SELECT ss.supervisor_user_id AS user_id,
                ${superviseeNameSql} AS counterparty_name
         FROM supervision_sessions ss
         LEFT JOIN users sv ON sv.id = ss.supervisee_user_id
         WHERE ss.supervisor_user_id IN (${ph2})
           AND UPPER(COALESCE(ss.status, '')) NOT IN ('CANCELLED', 'CANCELED')
           AND ss.start_at <= UTC_TIMESTAMP()
           AND ss.end_at > UTC_TIMESTAMP()
         UNION ALL
         SELECT ss.supervisee_user_id AS user_id,
                ${supervisorNameSql} AS counterparty_name
         FROM supervision_sessions ss
         LEFT JOIN users su ON su.id = ss.supervisor_user_id
         WHERE ss.supervisee_user_id IN (${ph2})
           AND UPPER(COALESCE(ss.status, '')) NOT IN ('CANCELLED', 'CANCELED')
           AND ss.start_at <= UTC_TIMESTAMP()
           AND ss.end_at > UTC_TIMESTAMP()`,
        [...missingAfterEvents, ...missingAfterEvents]
      );
      for (const row of supervisionRows || []) {
        const uid = Number(row.user_id);
        if (!uid || map.has(uid)) continue;
        const busy = busyFromSupervisionSession(row);
        if (busy) map.set(uid, busy);
      }
    }

    const missing = ids.filter((id) => !map.has(id));
    if (missing.length) {
      const ph3 = missing.map(() => '?').join(',');
      const [apptRows] = await pool.execute(
        `SELECT a.provider_user_id AS user_id, a.appointment_type_code
         FROM appointments a
         WHERE a.provider_user_id IN (${ph3})
           AND a.start_at IS NOT NULL
           AND a.end_at IS NOT NULL
           AND a.start_at <= UTC_TIMESTAMP()
           AND a.end_at > UTC_TIMESTAMP()
           AND UPPER(COALESCE(a.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'NO_SHOW')`,
        missing
      );
      for (const appt of apptRows || []) {
        const uid = Number(appt.user_id);
        if (!uid || map.has(uid)) continue;
        const busy = busyFromAppointment(appt);
        if (busy) map.set(uid, busy);
      }
    }
  } catch {
    return map;
  }
  return map;
}

/**
 * Attach current schedule activity to presence rows.
 * @param {object[]} rows
 * @param {{ preservePrimaryStatus?: boolean }} options
 *   When preservePrimaryStatus is true (Team Board), schedule activity is exposed as
 *   schedule_activity_label without replacing manual away / planned-out labels.
 */
export async function attachCalendarBusyToPresenceRows(rows, { preservePrimaryStatus = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const candidates = list
    .filter((r) => {
      const wire = String(r.status || '').toLowerCase();
      return wire === 'online' || wire === 'idle';
    })
    .map((r) => Number(r.id || r.user_id || 0))
    .filter(Boolean);
  const busyMap = await getCurrentCalendarBusyMap(candidates);
  return list.map((r) => {
    const wire = String(r.status || '').toLowerCase();
    if (wire !== 'online' && wire !== 'idle') return r;
    const id = Number(r.id || r.user_id || 0);
    const calendarBusy = id ? busyMap.get(id) : null;
    if (!calendarBusy?.label) return r;
    const scheduleFields = {
      calendar_busy: calendarBusy.activityType,
      schedule_activity_label: calendarBusy.label,
      schedule_activity_detail: calendarBusy.detail || null
    };
    if (preservePrimaryStatus || hasExplicitAwaySignal(r)) {
      return { ...r, ...scheduleFields };
    }
    return {
      ...r,
      ...scheduleFields,
      status_label: calendarBusy.label,
      presence_display_label: calendarBusy.label
    };
  });
}
