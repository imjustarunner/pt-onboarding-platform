/**
 * Summit Stats Team Challenge: Week boundary utilities
 * Week = Sunday(cutoff) to next Sunday(cutoff). Configurable cutoff time.
 */

const parseCutoffTime = (cutoffTime) => {
  const raw = String(cutoffTime || '00:00').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hours: 0, minutes: 0 };
  const hours = Math.max(0, Math.min(23, Number.parseInt(m[1], 10) || 0));
  const minutes = Math.max(0, Math.min(59, Number.parseInt(m[2], 10) || 0));
  return { hours, minutes };
};

const isValidTimeZone = (tz) => {
  const zone = String(tz || '').trim();
  if (!zone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const normalizeTimeZone = (tz, fallback = 'UTC') => (isValidTimeZone(tz) ? String(tz).trim() : fallback);

const zonedParts = (date, timeZone) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: weekdayMap[out.weekday] ?? 0
  };
};

const zonedTimeToUtcDate = ({ year, month, day, hour, minute, second = 0, timeZone }) => {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(guess, timeZone);
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const gotUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = targetUtc - gotUtc;
    if (!delta) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
};

const toYmd = (year, month, day) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Get the Sunday boundary date (YYYY-MM-DD) for the week containing the given date.
 * @param {Date|string} date
 * @param {string} cutoffTime HH:MM (24h), e.g. "20:00"
 * @returns {string} YYYY-MM-DD
 */
export function getWeekStartDate(date, cutoffTime = '00:00', timeZone = null) {
  const d = date instanceof Date ? new Date(date) : new Date(String(date));
  if (!Number.isFinite(d.getTime())) return null;
  const { hours, minutes } = parseCutoffTime(cutoffTime);
  const tz = timeZone ? normalizeTimeZone(timeZone, null) : null;
  if (tz) {
    const p = zonedParts(d, tz);
    const cal = new Date(Date.UTC(p.year, p.month - 1, p.day));
    cal.setUTCDate(cal.getUTCDate() - p.weekday);
    const boundary = zonedTimeToUtcDate({
      year: cal.getUTCFullYear(),
      month: cal.getUTCMonth() + 1,
      day: cal.getUTCDate(),
      hour: hours,
      minute: minutes,
      second: 0,
      timeZone: tz
    });
    if (d.getTime() < boundary.getTime()) {
      cal.setUTCDate(cal.getUTCDate() - 7);
    }
    return toYmd(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate());
  }
  const day = d.getDay();
  const diff = d.getDate() - day;
  const thisSunday = new Date(d);
  thisSunday.setDate(diff);
  thisSunday.setHours(hours, minutes, 0, 0);
  const start = new Date(thisSunday);
  if (d.getTime() < thisSunday.getTime()) {
    start.setDate(start.getDate() - 7);
  }
  return start.toISOString().slice(0, 10);
}

/**
 * Get week range [start, end) for a given week start date.
 * @param {string} weekStartDate YYYY-MM-DD (Sunday)
 * @returns {{ start: string, end: string }} ISO date strings
 */
export function getWeekRange(weekStartDate) {
  const start = new Date(weekStartDate + 'T00:00:00');
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

/**
 * Get week datetime range [start, end) using Sunday cutoff.
 * @param {string} weekStartDate YYYY-MM-DD (Sunday boundary date)
 * @param {string} cutoffTime HH:MM (24h)
 * @returns {{ start: string, end: string }} SQL datetime strings
 */
export function getWeekDateTimeRange(weekStartDate, cutoffTime = '00:00', timeZone = null) {
  const { hours, minutes } = parseCutoffTime(cutoffTime);
  const tz = timeZone ? normalizeTimeZone(timeZone, null) : null;
  if (tz) {
    const [yRaw, mRaw, dRaw] = String(weekStartDate || '').slice(0, 10).split('-');
    const y = Number(yRaw);
    const m = Number(mRaw);
    const d = Number(dRaw);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    const startUtc = zonedTimeToUtcDate({ year: y, month: m, day: d, hour: hours, minute: minutes, second: 0, timeZone: tz });
    const calEnd = new Date(Date.UTC(y, m - 1, d));
    calEnd.setUTCDate(calEnd.getUTCDate() + 7);
    const endUtc = zonedTimeToUtcDate({
      year: calEnd.getUTCFullYear(),
      month: calEnd.getUTCMonth() + 1,
      day: calEnd.getUTCDate(),
      hour: hours,
      minute: minutes,
      second: 0,
      timeZone: tz
    });
    const toSql = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ');
    return { start: toSql(startUtc), end: toSql(endUtc) };
  }
  const start = new Date(`${weekStartDate}T00:00:00`);
  if (!Number.isFinite(start.getTime())) return null;
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const toSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  return { start: toSql(start), end: toSql(end) };
}

export function getWeekScheduledDateTime(weekStartDate, {
  weekday = 'sunday',
  time = '00:00',
  timeZone = 'UTC'
} = {}) {
  const tz = normalizeTimeZone(timeZone, 'UTC');
  const weekdayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  const targetOffset = weekdayMap[String(weekday || '').trim().toLowerCase()] ?? 0;
  const [yRaw, mRaw, dRaw] = String(weekStartDate || '').slice(0, 10).split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const { hours, minutes } = parseCutoffTime(time);
  const baseCal = new Date(Date.UTC(y, m - 1, d));
  baseCal.setUTCDate(baseCal.getUTCDate() + targetOffset);
  return zonedTimeToUtcDate({
    year: baseCal.getUTCFullYear(),
    month: baseCal.getUTCMonth() + 1,
    day: baseCal.getUTCDate(),
    hour: hours,
    minute: minutes,
    second: 0,
    timeZone: tz
  });
}

export function getSeasonWeekPhase({
  klass,
  weekStartDate,
  cutoffTime = '00:00',
  timeZone = null
}) {
  const settingsRaw = klass?.season_settings_json;
  let settings = {};
  try {
    settings = typeof settingsRaw === 'string' ? JSON.parse(settingsRaw) : (settingsRaw || {});
  } catch {
    settings = {};
  }
  const postseason = settings?.postseason && typeof settings.postseason === 'object' ? settings.postseason : {};
  const anchor = klass?.starts_at
    ? getWeekStartDate(new Date(klass.starts_at), cutoffTime, timeZone)
    : String(weekStartDate || '').slice(0, 10);
  const startAnchor = new Date(`${String(anchor).slice(0, 10)}T00:00:00`);
  const currentWeek = new Date(`${String(weekStartDate || '').slice(0, 10)}T00:00:00`);
  const weekIndex = Math.max(0, Math.floor((currentWeek.getTime() - startAnchor.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const weekNumber = weekIndex + 1;
  const enabled = postseason?.enabled === true;
  const regularSeasonWeeks = Math.max(1, Number.parseInt(postseason?.regularSeasonWeeks, 10) || 10);
  const hasBreakWeek = postseason?.hasBreakWeek === true;
  const breakWeekNumber = hasBreakWeek ? Math.max(1, Number.parseInt(postseason?.breakWeekNumber, 10) || (regularSeasonWeeks + 1)) : null;
  const playoffWeekNumber = Math.max(1, Number.parseInt(postseason?.playoffWeekNumber, 10) || (regularSeasonWeeks + (hasBreakWeek ? 2 : 1)));
  const championshipWeekNumber = Math.max(playoffWeekNumber + 1, Number.parseInt(postseason?.championshipWeekNumber, 10) || (playoffWeekNumber + 1));

  // Per-week phase override map. When the manager has filled out the
  // visual week-by-week schedule editor, an entry here wins over the
  // legacy numeric "regular season weeks / playoff week / championship
  // week" fields. Phases supported: regular_season, break_week,
  // playoff_week, championship_week.
  const weekPhasesArray = Array.isArray(postseason?.weekPhases) ? postseason.weekPhases : [];
  const weekPhaseMap = new Map();
  for (const entry of weekPhasesArray) {
    if (!entry || typeof entry !== 'object') continue;
    const wn = Number.parseInt(entry.weekNumber, 10);
    const ph = String(entry.phase || '').trim().toLowerCase();
    if (!Number.isFinite(wn) || wn < 1) continue;
    if (!['regular_season', 'break_week', 'playoff_week', 'championship_week'].includes(ph)) continue;
    weekPhaseMap.set(wn, ph);
  }
  const hasWeekPhaseOverrides = weekPhaseMap.size > 0;

  let phase = 'regular_season';
  if (enabled) {
    if (hasWeekPhaseOverrides) {
      // Per-week schedule wins. If the requested week isn't listed, fall
      // back to the most natural default: weeks before the last listed
      // week are regular_season, weeks after it are postseason_complete.
      if (weekPhaseMap.has(weekNumber)) {
        phase = weekPhaseMap.get(weekNumber);
      } else {
        const maxListed = Math.max(...weekPhaseMap.keys());
        phase = weekNumber > maxListed ? 'postseason_complete' : 'regular_season';
      }
    } else if (weekNumber <= regularSeasonWeeks) phase = 'regular_season';
    else if (hasBreakWeek && weekNumber === breakWeekNumber) phase = 'break_week';
    else if (weekNumber === playoffWeekNumber) phase = 'playoff_week';
    else if (weekNumber === championshipWeekNumber) phase = 'championship_week';
    else if (weekNumber > championshipWeekNumber) phase = 'postseason_complete';
    else phase = 'postseason';
  }
  return {
    weekNumber,
    weekIndex,
    phase,
    regularSeasonWeeks,
    breakWeekNumber,
    playoffWeekNumber,
    championshipWeekNumber,
    postseasonEnabled: enabled,
    hasWeekPhaseOverrides
  };
}

const parseJsonLocal = (raw, fallback = {}) => {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return fallback;
};

/** Whole calendar days between two YYYY-MM-DD strings (UTC noon anchors, DST-safe). */
export function ymdUtcDiffDays(ymdA, ymdB) {
  const a = String(ymdA || '').slice(0, 10);
  const b = String(ymdB || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0;
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.round((db - da) / 86400000);
}

/**
 * Weekly on-track pacing in 7 day-sized steps using calendar dates in the challenge timezone.
 * Expected miles/points so far = weeklyTarget * (dayNumber / 7), where dayNumber is 1..7 from week start date through "today" (capped).
 * Also returns fine-grained hour ratio for optional UI.
 */
export function weekSeventhPaceState({ rangeStartSql, rangeEndSql, timeZone }) {
  const tz = normalizeTimeZone(timeZone || 'UTC', 'UTC');
  const startMs = Date.parse(String(rangeStartSql || '').replace(' ', 'T') + 'Z');
  const endMs = Date.parse(String(rangeEndSql || '').replace(' ', 'T') + 'Z');
  const nowMs = Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      paceFraction: 1,
      dayNumberInWeek: 7,
      elapsedHoursRatio: 1
    };
  }
  const elapsedHoursRatio =
    nowMs <= startMs ? 0 : nowMs >= endMs ? 1 : (nowMs - startMs) / (endMs - startMs);

  if (nowMs >= endMs) {
    return { paceFraction: 1, dayNumberInWeek: 7, elapsedHoursRatio: 1 };
  }
  if (nowMs < startMs) {
    return { paceFraction: 0, dayNumberInWeek: 0, elapsedHoursRatio: 0 };
  }

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const startYmd = fmt.format(new Date(startMs));
  const nowYmd = fmt.format(new Date(nowMs));
  const inclusiveCalendarDays = ymdUtcDiffDays(startYmd, nowYmd) + 1;
  const dayNumberInWeek = Math.min(7, Math.max(1, inclusiveCalendarDays));
  const paceFraction = dayNumberInWeek / 7;

  return { paceFraction, dayNumberInWeek, elapsedHoursRatio };
}

const firstPositiveNumber = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

/**
 * Single source of truth for weekly distance (miles) targets on run/ruck seasons.
 * Uses season JSON + DB columns; week index from calendar weeks between season anchor week and selected week.
 */
export function resolveWeeklyDistanceTargets(klass, weekStartYmd) {
  const settings = parseJsonLocal(klass?.season_settings_json || {});
  const participation = parseJsonLocal(settings.participation || {});
  const schedule = parseJsonLocal(settings.schedule || {});
  const drafting = parseJsonLocal(settings.drafting || {});
  const teamsBlock = parseJsonLocal(settings.teams || {});
  const cutoff = String(schedule.weekEndsSundayAt || klass?.week_start_time || '00:00').trim() || '00:00';
  const tz = normalizeTimeZone(schedule.weekTimeZone || 'UTC');

  const membersPerTeamFromTeamsSettings = firstPositiveNumber(
    teamsBlock.membersPerTeam,
    teamsBlock.members_per_team
  );
  const chainBaseline =
    (membersPerTeamFromTeamsSettings > 0 ? Math.floor(membersPerTeamFromTeamsSettings) : 0) ||
    Number(participation.weeklyGoalMembersPerTeam) ||
    Number(participation.baselineMemberCount) ||
    Number(drafting.membersPerTeam) ||
    Number(klass?.expected_team_size) ||
    12;
  let baselineMembers = Math.max(1, Math.floor(Number(chainBaseline) || 12));
  if (!Number.isFinite(baselineMembers) || baselineMembers < 1) baselineMembers = 12;

  let perPersonStart = firstPositiveNumber(
    participation.runRuckStartMilesPerPerson,
    participation.run_ruck_start_miles_per_person,
    participation.individualMinPointsPerWeek,
    participation.individual_min_points_per_week,
    klass?.individual_min_points_per_week
  );

  const weeklyIncrease = Number(
    participation.runRuckWeeklyIncreaseMilesPerPerson ?? participation.run_ruck_weekly_increase_miles_per_person ?? 0
  ) || 0;

  const weeklyGoalMin = firstPositiveNumber(
    participation.weeklyGoalMinimum,
    participation.weekly_goal_minimum,
    klass?.weekly_goal_minimum,
    klass?.weeklyGoalMinimum
  );

  const anchorWeek = klass?.starts_at
    ? getWeekStartDate(new Date(klass.starts_at), cutoff, tz)
    : String(weekStartYmd || '').slice(0, 10);
  const ws = String(weekStartYmd || '').slice(0, 10);
  const weekIndex = anchorWeek && ws ? Math.max(0, Math.floor(ymdUtcDiffDays(anchorWeek, ws) / 7)) : 0;

  let perPersonMiles = Number((perPersonStart + weekIndex * weeklyIncrease).toFixed(2));

  if (perPersonMiles <= 0 && weeklyGoalMin > 0) {
    perPersonMiles = Number((weeklyGoalMin / baselineMembers).toFixed(2));
  }

  let teamMilesBaseline = Number((perPersonMiles * baselineMembers).toFixed(2));

  const dbTeamMin = klass?.team_min_points_per_week != null ? Number(klass.team_min_points_per_week) : 0;
  if (Number.isFinite(dbTeamMin) && dbTeamMin > 0) {
    if (teamMilesBaseline <= 0 || dbTeamMin > teamMilesBaseline) {
      teamMilesBaseline = Number(dbTeamMin.toFixed(2));
    }
    if (perPersonMiles <= 0 && baselineMembers > 0) {
      perPersonMiles = Number((teamMilesBaseline / baselineMembers).toFixed(2));
    }
  }

  if (perPersonMiles <= 0 && weeklyGoalMin > 0 && baselineMembers > 0) {
    perPersonMiles = Number((weeklyGoalMin / baselineMembers).toFixed(2));
    teamMilesBaseline = Number((perPersonMiles * baselineMembers).toFixed(2));
  }

  return {
    weekIndex,
    perPersonMilesMinimum: perPersonMiles,
    teamMilesMinimumBaseline: teamMilesBaseline,
    baselineMemberCount: baselineMembers,
    weeklyIncrease
  };
}

/**
 * Per-person and team mile targets for a week (baseline team total = baseline roster × per-person miles).
 * @deprecated Prefer resolveWeeklyDistanceTargets; kept for callers expecting legacy field names.
 */
export function getSeasonWeekMileGoals(klass, weekStartYmd) {
  const t = resolveWeeklyDistanceTargets(klass, weekStartYmd);
  return {
    weekIndex: t.weekIndex,
    individualMilesMinimum: t.perPersonMilesMinimum,
    teamMilesMinimum: t.teamMilesMinimumBaseline,
    baselineMembers: t.baselineMemberCount
  };
}
