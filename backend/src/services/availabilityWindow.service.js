/**
 * Availability Hours / business-time helper.
 * Default: Mon–Fri 06:00–19:00 (inclusive end of hour = until 19:00:00) in the user's timezone.
 * Quiet hours: 19:01–05:59 (outside availability).
 * Employee overrides via user_work_schedules; disabled availability = always available.
 */
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';
import pool from '../config/database.js';

export const DEFAULT_AVAILABILITY = Object.freeze({
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startMinutes: 6 * 60, // 06:00
  endMinutes: 19 * 60 // 19:00 (exclusive upper bound for "inside" checks uses < end)
});

function parseMinutes(t) {
  const s = String(t || '');
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function localParts(now, timeZone) {
  const tz = String(timeZone || 'America/New_York').trim() || 'America/New_York';
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      timeZone: tz,
      dayOfWeek: weekdayMap[parts.weekday],
      year: parseInt(parts.year, 10),
      month: parseInt(parts.month, 10),
      day: parseInt(parts.day, 10),
      hour: parseInt(parts.hour, 10),
      minute: parseInt(parts.minute, 10),
      second: parseInt(parts.second, 10),
      minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10)
    };
  } catch {
    return {
      timeZone: 'America/New_York',
      dayOfWeek: now.getUTCDay(),
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
      second: now.getUTCSeconds(),
      minutes: now.getUTCHours() * 60 + now.getUTCMinutes()
    };
  }
}

/** Build a Date for local Y-M-D H:M in a timezone (best-effort via offset probe). */
function zonedDate({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const probe = new Date(utcGuess);
  const loc = localParts(probe, timeZone);
  const desiredAsUtcMin = Date.UTC(year, month - 1, day, hour, minute, second) / 60000;
  const actualAsUtcMin = Date.UTC(loc.year, loc.month - 1, loc.day, loc.hour, loc.minute, loc.second) / 60000;
  const deltaMin = desiredAsUtcMin - actualAsUtcMin;
  return new Date(utcGuess + deltaMin * 60000);
}

async function prefsAvailabilityEnabled(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT availability_hours_enabled FROM user_communication_prefs WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (!rows?.[0]) return true;
    const v = rows[0].availability_hours_enabled;
    return !(v === 0 || v === false || v === '0');
  } catch {
    return true;
  }
}

/**
 * Resolve the active availability windows for a user.
 * @returns {Promise<{
 *   enabled: boolean,
 *   source: 'disabled'|'override'|'default',
 *   timezone: string,
 *   blocks: Array<{dayOfWeek:number,startMinutes:number,endMinutes:number}>
 * }>}
 */
export async function resolveAvailabilitySchedule(userId, { agencyId = null } = {}) {
  const uid = Number(userId || 0);
  if (!uid) {
    return {
      enabled: true,
      source: 'default',
      timezone: 'America/New_York',
      blocks: DEFAULT_AVAILABILITY.days.map((d) => ({
        dayOfWeek: d,
        startMinutes: DEFAULT_AVAILABILITY.startMinutes,
        endMinutes: DEFAULT_AVAILABILITY.endMinutes
      }))
    };
  }

  const enabled = await prefsAvailabilityEnabled(uid);
  if (!enabled) {
    return { enabled: false, source: 'disabled', timezone: 'America/New_York', blocks: [] };
  }

  const data = await UserWorkSchedule.getForUser(uid, { agencyId });
  if (data?.isActive && data.blocks?.length) {
    const blocks = [];
    for (const b of data.blocks) {
      const start = parseMinutes(b.start_time);
      const end = parseMinutes(b.end_time);
      if (start == null || end == null || start >= end) continue;
      blocks.push({
        dayOfWeek: Number(b.day_of_week),
        startMinutes: start,
        endMinutes: end
      });
    }
    if (blocks.length) {
      return {
        enabled: true,
        source: 'override',
        timezone: String(data.timezone || 'America/New_York'),
        blocks
      };
    }
  }

  return {
    enabled: true,
    source: 'default',
    timezone: String(data?.timezone || 'America/New_York'),
    blocks: DEFAULT_AVAILABILITY.days.map((d) => ({
      dayOfWeek: d,
      startMinutes: DEFAULT_AVAILABILITY.startMinutes,
      endMinutes: DEFAULT_AVAILABILITY.endMinutes
    }))
  };
}

export function isInsideSchedule(schedule, now = new Date()) {
  if (!schedule?.enabled) return true;
  const loc = localParts(now, schedule.timezone);
  for (const b of schedule.blocks || []) {
    if (Number(b.dayOfWeek) !== loc.dayOfWeek) continue;
    if (loc.minutes >= b.startMinutes && loc.minutes < b.endMinutes) return true;
  }
  return false;
}

export async function isUserAvailable(userId, now = new Date(), opts = {}) {
  const schedule = await resolveAvailabilitySchedule(userId, opts);
  return {
    available: isInsideSchedule(schedule, now),
    schedule
  };
}

/**
 * Next moment the user becomes available at or after `now`.
 * If currently available, returns `now`.
 */
export function nextAvailableAt(schedule, now = new Date()) {
  if (!schedule?.enabled) return now;
  if (isInsideSchedule(schedule, now)) return now;

  const loc = localParts(now, schedule.timezone);
  // Search up to 14 days ahead
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const base = zonedDate(
      {
        year: loc.year,
        month: loc.month,
        day: loc.day + dayOffset,
        hour: 0,
        minute: 0,
        second: 0
      },
      schedule.timezone
    );
    const dayLoc = localParts(base, schedule.timezone);
    const dayBlocks = (schedule.blocks || [])
      .filter((b) => Number(b.dayOfWeek) === dayLoc.dayOfWeek)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    for (const b of dayBlocks) {
      const start = zonedDate(
        {
          year: dayLoc.year,
          month: dayLoc.month,
          day: dayLoc.day,
          hour: Math.floor(b.startMinutes / 60),
          minute: b.startMinutes % 60,
          second: 0
        },
        schedule.timezone
      );
      if (start >= now) return start;
      // Same day but already past start — if still inside window, return now
      const end = zonedDate(
        {
          year: dayLoc.year,
          month: dayLoc.month,
          day: dayLoc.day,
          hour: Math.floor(b.endMinutes / 60),
          minute: b.endMinutes % 60,
          second: 0
        },
        schedule.timezone
      );
      if (now >= start && now < end) return now;
    }
  }
  // Fallback: Monday 06:00 in one week
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Advance `from` by `businessHours` of Availability Hours (only counting time inside windows).
 */
export function addBusinessHours(schedule, from, businessHours) {
  const hours = Math.max(0, Number(businessHours) || 0);
  if (!hours) return new Date(from);
  if (!schedule?.enabled) {
    return new Date(from.getTime() + hours * 60 * 60 * 1000);
  }

  let remainingMs = hours * 60 * 60 * 1000;
  let cursor = new Date(from);
  // Cap iterations to avoid infinite loops
  for (let i = 0; i < 5000 && remainingMs > 0; i += 1) {
    if (!isInsideSchedule(schedule, cursor)) {
      cursor = nextAvailableAt(schedule, new Date(cursor.getTime() + 1000));
      continue;
    }
    const loc = localParts(cursor, schedule.timezone);
    const block = (schedule.blocks || []).find(
      (b) =>
        Number(b.dayOfWeek) === loc.dayOfWeek &&
        loc.minutes >= b.startMinutes &&
        loc.minutes < b.endMinutes
    );
    if (!block) {
      cursor = new Date(cursor.getTime() + 60 * 1000);
      continue;
    }
    const end = zonedDate(
      {
        year: loc.year,
        month: loc.month,
        day: loc.day,
        hour: Math.floor(block.endMinutes / 60),
        minute: block.endMinutes % 60,
        second: 0
      },
      schedule.timezone
    );
    const slice = Math.min(remainingMs, Math.max(0, end.getTime() - cursor.getTime()));
    cursor = new Date(cursor.getTime() + slice);
    remainingMs -= slice;
    if (remainingMs > 0) {
      cursor = nextAvailableAt(schedule, new Date(cursor.getTime() + 1000));
    }
  }
  return cursor;
}

export function formatReturnAt(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/New_York',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export default {
  DEFAULT_AVAILABILITY,
  resolveAvailabilitySchedule,
  isInsideSchedule,
  isUserAvailable,
  nextAvailableAt,
  addBusinessHours,
  formatReturnAt
};
