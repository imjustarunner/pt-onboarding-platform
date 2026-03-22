/**
 * Skill Builder recurring availability blocks (provider_skill_builder_availability) — normalize + persist.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SET = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
const WEEKEND_SET = new Set(['Saturday', 'Sunday']);

export const SKILL_BUILDER_MINUTES_PER_WEEK = 6 * 60;

function normalizeDayName(d) {
  const s = String(d || '').trim();
  const canonical = DAY_NAMES.find((x) => x.toLowerCase() === s.toLowerCase());
  return canonical || null;
}

function normalizeBlockType(t) {
  const s = String(t || '').trim().toUpperCase();
  if (s === 'AFTER_SCHOOL') return 'AFTER_SCHOOL';
  if (s === 'WEEKEND') return 'WEEKEND';
  if (s === 'CUSTOM') return 'CUSTOM';
  return null;
}

function normalizeTimeHHMM(v) {
  const s = String(v || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function minutesBetween(startHHMMSS, endHHMMSS) {
  const s = String(startHHMMSS || '');
  const e = String(endHHMMSS || '');
  const m1 = s.match(/^(\d{2}):(\d{2}):\d{2}$/);
  const m2 = e.match(/^(\d{2}):(\d{2}):\d{2}$/);
  if (!m1 || !m2) return 0;
  const a = Number(m1[1]) * 60 + Number(m1[2]);
  const b = Number(m2[1]) * 60 + Number(m2[2]);
  return b > a ? b - a : 0;
}

export function normalizeSkillBuilderBlocks(blocks) {
  const normalized = [];
  for (const b of blocks || []) {
    const dayOfWeek = normalizeDayName(b?.dayOfWeek);
    const blockType = normalizeBlockType(b?.blockType);
    if (!dayOfWeek || !blockType) continue;

    const departFrom = String(b?.departFrom || '').trim().slice(0, 255);
    if (!departFrom) continue;
    const departTime = b?.departTime ? normalizeTimeHHMM(b.departTime) : null;
    const isBooked =
      b?.isBooked === true ||
      b?.isBooked === 1 ||
      b?.isBooked === '1' ||
      String(b?.isBooked || '').toLowerCase() === 'true';

    if (blockType === 'AFTER_SCHOOL') {
      if (!WEEKDAY_SET.has(dayOfWeek)) continue;
      normalized.push({
        dayOfWeek,
        blockType,
        startTime: '15:00:00',
        endTime: '16:30:00',
        departFrom,
        departTime,
        isBooked
      });
    } else if (blockType === 'WEEKEND') {
      if (!WEEKEND_SET.has(dayOfWeek)) continue;
      normalized.push({
        dayOfWeek,
        blockType,
        startTime: '12:00:00',
        endTime: '15:00:00',
        departFrom,
        departTime,
        isBooked
      });
    } else {
      const startTime = normalizeTimeHHMM(b?.startTime);
      const endTime = normalizeTimeHHMM(b?.endTime);
      if (!startTime || !endTime) continue;
      if (endTime <= startTime) continue;
      normalized.push({ dayOfWeek, blockType, startTime, endTime, departFrom, departTime, isBooked });
    }
  }
  return normalized;
}

export function totalMinutesForSkillBuilderBlocks(blocks) {
  let total = 0;
  for (const b of blocks || []) {
    const t = String(b?.blockType || '').toUpperCase();
    if (t === 'AFTER_SCHOOL') total += 90;
    else if (t === 'WEEKEND') total += 180;
    else total += minutesBetween(b?.startTime, b?.endTime);
  }
  return total;
}

function toYmd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function startOfWeekMonday(dateLike) {
  const d = new Date(dateLike || Date.now());
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(dateLike, days) {
  const d = new Date(dateLike);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 */
export async function replaceProviderSkillBuilderAvailabilityBlocks(conn, { agencyId, providerId, normalizedBlocks }) {
  const aid = Number(agencyId);
  const pid = Number(providerId);
  await conn.execute(`DELETE FROM provider_skill_builder_availability WHERE agency_id = ? AND provider_id = ?`, [
    aid,
    pid
  ]);
  for (const b of normalizedBlocks) {
    // eslint-disable-next-line no-await-in-loop
    await conn.execute(
      `INSERT INTO provider_skill_builder_availability
        (agency_id, provider_id, depart_from, depart_time, is_booked, day_of_week, block_type, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [aid, pid, b.departFrom, b.departTime || null, b.isBooked ? 1 : 0, b.dayOfWeek, b.blockType, b.startTime, b.endTime]
    );
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 */
export async function upsertBiweeklySkillBuilderConfirmations(conn, { agencyId, providerId }) {
  const cycleStart = startOfWeekMonday(new Date());
  const weekStart = toYmd(cycleStart);
  const nextWeekStart = toYmd(addDays(cycleStart, 7));
  for (const wk of [weekStart, nextWeekStart]) {
    // eslint-disable-next-line no-await-in-loop
    await conn.execute(
      `INSERT INTO provider_skill_builder_availability_confirmations
        (agency_id, provider_id, week_start_date, confirmed_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE confirmed_at = VALUES(confirmed_at)`,
      [agencyId, providerId, wk]
    );
  }
}
