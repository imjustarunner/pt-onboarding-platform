/**
 * Shared schedule recurrence constants + date expansion.
 * Used by meetings, supervision, office booking, personal events, and holds.
 */

export const RECURRENCE_ONCE = 'ONCE';
export const RECURRENCE_WEEKLY = 'WEEKLY';
export const RECURRENCE_BIWEEKLY = 'BIWEEKLY';
export const RECURRENCE_EVERY_3_WEEKS = 'EVERY_3_WEEKS';
export const RECURRENCE_EVERY_4_WEEKS = 'EVERY_4_WEEKS';
export const RECURRENCE_MONTHLY = 'MONTHLY';

/** Week-based + monthly recurring frequencies (excludes ONCE). */
export const RECURRING_FREQUENCIES = Object.freeze([
  RECURRENCE_WEEKLY,
  RECURRENCE_BIWEEKLY,
  RECURRENCE_EVERY_3_WEEKS,
  RECURRENCE_EVERY_4_WEEKS,
  RECURRENCE_MONTHLY
]);

/** All allowed values including ONCE. */
export const ALL_RECURRENCE_FREQUENCIES = Object.freeze([
  RECURRENCE_ONCE,
  ...RECURRING_FREQUENCIES
]);

export const RECURRENCE_OPTIONS = Object.freeze([
  { value: RECURRENCE_ONCE, label: 'Does not repeat' },
  { value: RECURRENCE_WEEKLY, label: 'Weekly' },
  { value: RECURRENCE_BIWEEKLY, label: 'Every 2 weeks' },
  { value: RECURRENCE_EVERY_3_WEEKS, label: 'Every 3 weeks' },
  { value: RECURRENCE_EVERY_4_WEEKS, label: 'Every 4 weeks' },
  { value: RECURRENCE_MONTHLY, label: 'Monthly (same day of month)' }
]);

export const RECURRENCE_LABELS = Object.freeze(
  Object.fromEntries(RECURRENCE_OPTIONS.map((o) => [o.value, o.label]))
);

export function normalizeRecurrenceFrequency(raw, { fallback = RECURRENCE_ONCE } = {}) {
  const freq = String(raw || '').trim().toUpperCase();
  if (ALL_RECURRENCE_FREQUENCIES.includes(freq)) return freq;
  return fallback;
}

export function isRecurringFrequency(raw) {
  return RECURRING_FREQUENCIES.includes(normalizeRecurrenceFrequency(raw, { fallback: '' }));
}

export function isWeekBasedFrequency(raw) {
  const freq = normalizeRecurrenceFrequency(raw, { fallback: '' });
  return [
    RECURRENCE_WEEKLY,
    RECURRENCE_BIWEEKLY,
    RECURRENCE_EVERY_3_WEEKS,
    RECURRENCE_EVERY_4_WEEKS
  ].includes(freq);
}

/** Days between occurrences for week-based frequencies. MONTHLY returns null. */
export function stepDaysForRecurrence(raw) {
  const freq = normalizeRecurrenceFrequency(raw, { fallback: RECURRENCE_ONCE });
  if (freq === RECURRENCE_WEEKLY) return 7;
  if (freq === RECURRENCE_BIWEEKLY) return 14;
  if (freq === RECURRENCE_EVERY_3_WEEKS) return 21;
  if (freq === RECURRENCE_EVERY_4_WEEKS) return 28;
  return 0;
}

export function stepWeeksForRecurrence(raw) {
  const days = stepDaysForRecurrence(raw);
  return days > 0 ? days / 7 : 0;
}

export function recurrenceLabel(raw, occurrenceCount = null) {
  const freq = normalizeRecurrenceFrequency(raw, { fallback: String(raw || '').trim().toUpperCase() || RECURRENCE_ONCE });
  const base = RECURRENCE_LABELS[freq] || freq;
  if (freq === RECURRENCE_ONCE || !occurrenceCount || Number(occurrenceCount) <= 1) return base;
  return `${base} × ${occurrenceCount}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map((n) => Number(n));
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Same calendar day next N months; clamps to last day of month when needed (Jan 31 → Feb 28). */
export function addMonthsYmd(ymd, monthsToAdd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map((n) => Number(n));
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + Number(monthsToAdd || 0), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(day)}`;
}

function weekdayShortFromYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map((n) => Number(n));
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
}

/**
 * Default occurrence count for indefinite series (~5 years).
 */
export function indefiniteOccurrenceCount(raw) {
  const freq = normalizeRecurrenceFrequency(raw);
  if (freq === RECURRENCE_WEEKLY) return 260;
  if (freq === RECURRENCE_BIWEEKLY) return 130;
  if (freq === RECURRENCE_EVERY_3_WEEKS) return 87;
  if (freq === RECURRENCE_EVERY_4_WEEKS) return 65;
  if (freq === RECURRENCE_MONTHLY) return 60;
  return 1;
}

/**
 * Expand a start date into occurrence dates.
 * Monthly = same day of month (clamped). Week-based supports multi-weekday series.
 */
export function expandRecurrenceDates({
  startYmd,
  frequency = RECURRENCE_ONCE,
  endMode = 'count',
  occurrenceCount = 1,
  untilDate = '',
  weekdays = []
} = {}) {
  const start = String(startYmd || '').slice(0, 10);
  if (!start) return [];
  const freq = normalizeRecurrenceFrequency(frequency);
  if (freq === RECURRENCE_ONCE) return [start];

  const maxCount = Math.min(520, Math.max(1, Number(occurrenceCount || 1) || 1));
  const until = endMode === 'until' ? String(untilDate || '').slice(0, 10) : '';
  const occurrenceCap = endMode === 'count'
    ? maxCount
    : (endMode === 'indefinite' ? indefiniteOccurrenceCount(freq) : 52);

  if (freq === RECURRENCE_MONTHLY) {
    const out = [];
    let cursor = start;
    while (out.length < occurrenceCap) {
      if (until && cursor > until) break;
      out.push(cursor);
      cursor = addMonthsYmd(cursor, 1);
      if (!cursor || out.length > 600) break;
    }
    return out;
  }

  const stepWeeks = stepWeeksForRecurrence(freq) || 1;
  const days = Array.isArray(weekdays) && weekdays.length
    ? weekdays.map(String)
    : [weekdayShortFromYmd(start)].filter(Boolean);
  const order = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const out = [];
  let weekOffset = 0;
  while (out.length < occurrenceCap && weekOffset < 600) {
    let hitPastUntil = false;
    for (const day of days) {
      const base = addDaysYmd(start, weekOffset * 7);
      const baseDow = weekdayShortFromYmd(base);
      const baseIdx = order.indexOf(baseDow);
      const wantIdx = order.indexOf(day);
      if (baseIdx < 0 || wantIdx < 0) continue;
      const delta = (wantIdx - baseIdx + 7) % 7;
      const candidate = addDaysYmd(base, delta);
      if (candidate < start) continue;
      if (until && candidate > until) {
        hitPastUntil = true;
        continue;
      }
      if (!out.includes(candidate)) out.push(candidate);
      if (out.length >= occurrenceCap) break;
    }
    if (hitPastUntil && until) break;
    weekOffset += stepWeeks;
  }
  return out.sort().slice(0, occurrenceCap);
}

/**
 * Simple linear expansion (single weekday, count mode) — used when multi-day/until not needed.
 */
export function occurrenceDatesSimple(baseDateYmd, recurrence, occurrenceCount) {
  const base = String(baseDateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];
  const freq = normalizeRecurrenceFrequency(recurrence);
  if (freq === RECURRENCE_ONCE || !isRecurringFrequency(freq)) return [base];
  const count = Math.min(520, Math.max(1, Number(occurrenceCount || 1)));
  const dates = [];
  if (freq === RECURRENCE_MONTHLY) {
    for (let i = 0; i < count; i += 1) dates.push(addMonthsYmd(base, i));
    return dates;
  }
  const step = stepDaysForRecurrence(freq);
  for (let i = 0; i < count; i += 1) dates.push(addDaysYmd(base, i * step));
  return dates;
}
