/**
 * Shared schedule recurrence constants + date expansion (backend).
 * Keep in sync with frontend/src/utils/scheduleRecurrence.js
 */

export const RECURRENCE_ONCE = 'ONCE';
export const RECURRENCE_WEEKLY = 'WEEKLY';
export const RECURRENCE_BIWEEKLY = 'BIWEEKLY';
export const RECURRENCE_EVERY_3_WEEKS = 'EVERY_3_WEEKS';
export const RECURRENCE_EVERY_4_WEEKS = 'EVERY_4_WEEKS';
export const RECURRENCE_MONTHLY = 'MONTHLY';

export const RECURRING_FREQUENCIES = Object.freeze([
  RECURRENCE_WEEKLY,
  RECURRENCE_BIWEEKLY,
  RECURRENCE_EVERY_3_WEEKS,
  RECURRENCE_EVERY_4_WEEKS,
  RECURRENCE_MONTHLY
]);

export const ALL_RECURRENCE_FREQUENCIES = Object.freeze([
  RECURRENCE_ONCE,
  ...RECURRING_FREQUENCIES
]);

export const RECURRENCE_LABELS = Object.freeze({
  ONCE: 'Once',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every 2 weeks',
  EVERY_3_WEEKS: 'Every 3 weeks',
  EVERY_4_WEEKS: 'Every 4 weeks',
  MONTHLY: 'Monthly (same day of month)'
});

export function normalizeRecurrenceFrequency(raw, { fallback = RECURRENCE_ONCE } = {}) {
  const freq = String(raw || '').trim().toUpperCase();
  if (ALL_RECURRENCE_FREQUENCIES.includes(freq)) return freq;
  return fallback;
}

export function isRecurringFrequency(raw) {
  return RECURRING_FREQUENCIES.includes(normalizeRecurrenceFrequency(raw, { fallback: '' }));
}

export function stepDaysForRecurrence(raw) {
  const freq = normalizeRecurrenceFrequency(raw, { fallback: RECURRENCE_ONCE });
  if (freq === RECURRENCE_WEEKLY) return 7;
  if (freq === RECURRENCE_BIWEEKLY) return 14;
  if (freq === RECURRENCE_EVERY_3_WEEKS) return 21;
  if (freq === RECURRENCE_EVERY_4_WEEKS) return 28;
  return 0;
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

/** Same calendar day next N months; clamps to last day of month when needed. */
export function addMonthsYmd(ymd, monthsToAdd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map((n) => Number(n));
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + Number(monthsToAdd || 0), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(day)}`;
}

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
 * Generate occurrence dates for a recurrence series.
 * Monthly uses same day-of-month (clamped). Week-based uses day steps.
 */
export function generateOccurrenceDates({ startDate, recurrence, occurrenceCount }) {
  const normalized = String(startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return [];
  const freq = normalizeRecurrenceFrequency(recurrence);
  if (freq === RECURRENCE_ONCE || !isRecurringFrequency(freq)) return [normalized];

  const count = occurrenceCount == null
    ? (freq === RECURRENCE_MONTHLY ? 12 : 12)
    : Math.max(1, Number(occurrenceCount || 1));

  const dates = [];
  if (freq === RECURRENCE_MONTHLY) {
    for (let i = 0; i < count; i += 1) dates.push(addMonthsYmd(normalized, i));
    return dates.filter(Boolean);
  }
  const step = stepDaysForRecurrence(freq);
  for (let i = 0; i < count; i += 1) dates.push(addDaysYmd(normalized, i * step));
  return dates.filter(Boolean);
}

export function normalizeOfficeRequestRecurrence({ recurrenceRaw, occurrenceCountRaw }) {
  const normalizedRecurrence = normalizeRecurrenceFrequency(recurrenceRaw, { fallback: RECURRENCE_ONCE });
  if (normalizedRecurrence === RECURRENCE_ONCE) {
    return { recurrence: RECURRENCE_ONCE, occurrenceCount: 1 };
  }
  const max = normalizedRecurrence === RECURRENCE_WEEKLY ? 52 : 104;
  const parsed = parseInt(occurrenceCountRaw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      recurrence: normalizedRecurrence,
      occurrenceCount: normalizedRecurrence === RECURRENCE_WEEKLY ? null : 1
    };
  }
  return {
    recurrence: normalizedRecurrence,
    occurrenceCount: Math.min(max, Math.max(1, parsed))
  };
}
