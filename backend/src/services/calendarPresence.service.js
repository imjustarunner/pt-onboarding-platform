import pool from '../config/database.js';

/**
 * Resolve a calendar-busy label for a user based on current schedule events / appointments.
 * Returns { label, activityType } or null.
 */
export async function getCurrentCalendarBusyForUser(userId) {
  const uid = Number(userId || 0);
  if (!uid) return null;

  try {
    // Active schedule events (meetings, huddles, personal, holds, sessions linked to PSE)
    const [eventRows] = await pool.execute(
      `SELECT e.id, e.kind, e.title, e.client_id
       FROM provider_schedule_events e
       WHERE e.provider_id = ?
         AND UPPER(COALESCE(e.status, 'ACTIVE')) = 'ACTIVE'
         AND e.all_day = 0
         AND e.start_at IS NOT NULL
         AND e.end_at IS NOT NULL
         AND e.start_at <= NOW()
         AND e.end_at > NOW()
       ORDER BY e.start_at DESC
       LIMIT 1`,
      [uid]
    );
    const ev = eventRows?.[0] || null;
    if (ev) {
      const kind = String(ev.kind || '').toUpperCase();
      if (kind === 'TEAM_MEETING') return { label: 'In Meeting', activityType: 'team_meeting', source: 'schedule_event' };
      if (kind === 'HUDDLE') return { label: 'In Meeting', activityType: 'huddle', source: 'schedule_event' };
      if (kind === 'INDIRECT_SERVICES') return { label: 'Busy', activityType: 'indirect', source: 'schedule_event' };
      if (ev.client_id || kind.includes('SESSION')) {
        return { label: 'In Session', activityType: 'session', source: 'schedule_event' };
      }
      // PERSONAL_EVENT / SCHEDULE_HOLD — do not override presence as clinical busy
    }

    // Appointments currently in progress
    const [apptRows] = await pool.execute(
      `SELECT a.id, a.appointment_type_code, a.status
       FROM appointments a
       WHERE a.provider_user_id = ?
         AND a.start_at IS NOT NULL
         AND a.end_at IS NOT NULL
         AND a.start_at <= NOW()
         AND a.end_at > NOW()
         AND UPPER(COALESCE(a.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'NO_SHOW')
       ORDER BY a.start_at DESC
       LIMIT 1`,
      [uid]
    );
    const appt = apptRows?.[0] || null;
    if (appt) {
      const code = String(appt.appointment_type_code || '').toLowerCase();
      if (code.includes('supervision')) {
        return { label: 'Supervision', activityType: 'supervision', source: 'appointment' };
      }
      return { label: 'In Session', activityType: 'session', source: 'appointment' };
    }
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

  return null;
}

/**
 * Batch-load current busy labels for many users (one/two queries).
 * Returns Map<userId, { label, activityType }>
 */
export async function getCurrentCalendarBusyMap(userIds) {
  const ids = [...new Set((userIds || []).map((n) => Number(n)).filter((n) => n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const ph = ids.map(() => '?').join(',');

  try {
    const [eventRows] = await pool.execute(
      `SELECT e.provider_id AS user_id, e.kind, e.client_id
       FROM provider_schedule_events e
       WHERE e.provider_id IN (${ph})
         AND UPPER(COALESCE(e.status, 'ACTIVE')) = 'ACTIVE'
         AND e.all_day = 0
         AND e.start_at IS NOT NULL
         AND e.end_at IS NOT NULL
         AND e.start_at <= NOW()
         AND e.end_at > NOW()`,
      ids
    );
    for (const ev of eventRows || []) {
      const uid = Number(ev.user_id);
      if (!uid || map.has(uid)) continue;
      const kind = String(ev.kind || '').toUpperCase();
      if (kind === 'TEAM_MEETING' || kind === 'HUDDLE') {
        map.set(uid, { label: 'In Meeting', activityType: kind === 'HUDDLE' ? 'huddle' : 'team_meeting' });
      } else if (ev.client_id || kind.includes('SESSION')) {
        map.set(uid, { label: 'In Session', activityType: 'session' });
      }
    }

    const missing = ids.filter((id) => !map.has(id));
    if (missing.length) {
      const ph2 = missing.map(() => '?').join(',');
      const [apptRows] = await pool.execute(
        `SELECT a.provider_user_id AS user_id, a.appointment_type_code
         FROM appointments a
         WHERE a.provider_user_id IN (${ph2})
           AND a.start_at IS NOT NULL
           AND a.end_at IS NOT NULL
           AND a.start_at <= NOW()
           AND a.end_at > NOW()
           AND UPPER(COALESCE(a.status, '')) NOT IN ('CANCELLED', 'CANCELED', 'NO_SHOW')`,
        missing
      );
      for (const appt of apptRows || []) {
        const uid = Number(appt.user_id);
        if (!uid || map.has(uid)) continue;
        const code = String(appt.appointment_type_code || '').toLowerCase();
        if (code.includes('supervision')) {
          map.set(uid, { label: 'Supervision', activityType: 'supervision' });
        } else {
          map.set(uid, { label: 'In Session', activityType: 'session' });
        }
      }
    }
  } catch {
    return map;
  }
  return map;
}

export async function attachCalendarBusyToPresenceRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  // Overlay calendar busy on Active only. Idle (signed-in Away overlay) stays Idle for peers.
  const candidates = list
    .filter((r) => r.status === 'online')
    .map((r) => Number(r.id || r.user_id || 0))
    .filter(Boolean);
  const busyMap = await getCurrentCalendarBusyMap(candidates);
  return list.map((r) => {
    if (r.status !== 'online') return r;
    const id = Number(r.id || r.user_id || 0);
    const calendarBusy = id ? busyMap.get(id) : null;
    if (!calendarBusy?.label) return r;
    return {
      ...r,
      calendar_busy: calendarBusy.activityType,
      status_label: calendarBusy.label,
      presence_display_label: calendarBusy.label
    };
  });
}
