import PayrollPeriod from '../models/PayrollPeriod.model.js';

const DEFAULT_TIMEZONE = 'America/New_York';

// Message shown when submission is outside the allowed in-app window.
export const CLAIM_DEADLINE_ERROR_MESSAGE =
  'This claim is past the submission deadline. If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.';

export const CLAIM_DEADLINE_60_DAYS_ERROR_MESSAGE =
  'This claim is past the 60-day submission deadline. If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.';

function parseYmd(ymd) {
  const s = String(ymd || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day, ymd: s };
}

function ymdStr(v) {
  if (!v) return '';
  // MySQL drivers sometimes return DATE/DATETIME columns as JS Date objects.
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // If it's already ISO-like, slicing is fine.
  return s.slice(0, 10);
}

function ymdFromParts({ year, month, day }) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, days) {
  const p = parseYmd(ymd);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return ymdFromParts({
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate()
  });
}

// Day-of-week for a calendar date is universal (timezone-independent).
// Returns 0..6 where 0 is Sunday.
function weekdayUtcForYmd(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

function nextSundayOnOrAfterYmd(ymd) {
  const dow = weekdayUtcForYmd(ymd);
  if (dow === null) return null;
  const daysUntilSunday = (7 - dow) % 7;
  return addDaysYmd(ymd, daysUntilSunday);
}

function tzOffsetMillis(date, timeZone) {
  // Use formatToParts to avoid locale parsing.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc({ ymd, hour = 0, minute = 0, second = 0, timeZone }) {
  const p = parseYmd(ymd);
  if (!p) return null;
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, hour, minute, second));
  // Two-pass adjustment to handle DST transitions.
  const off1 = tzOffsetMillis(guess, timeZone);
  const d1 = new Date(guess.getTime() - off1);
  const off2 = tzOffsetMillis(d1, timeZone);
  return new Date(guess.getTime() - off2);
}

function fmtLocalCutoff({ ymd, hour, minute, second }) {
  // Human-readable string for logs/debug.
  return `${String(ymd)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

/**
 * Compute which pay period a claim can be posted to based on:
 * - Effective date (drive_date/claim_date/expense_date/etc.)
 * - Submission timestamp
 *
 * Policy:
 * - Submit by Sunday 11:59 PM after the pay period end => eligible for that pay period
 * - After that cutoff, eligible for next pay period only (grace window)
 * - Hard stop depends on claim category:
 *   - In-school: after the next pay period’s Sunday 11:59 PM cutoff => not allowed in-app
 *   - Other: after 60 days from effective date => not allowed in-app
 */
export async function computeSubmissionWindow({
  agencyId,
  effectiveDateYmd,
  submittedAt,
  timeZone = DEFAULT_TIMEZONE,
  hardStopPolicy = '60_days', // '60_days' | 'in_school' | 'none'
  hardStopDays = 60
}) {
  // Validate timezone early so Intl calls never throw.
  const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const eff = String(effectiveDateYmd || '').slice(0, 10);
  const effParts = parseYmd(eff);
  if (!effParts) {
    return { ok: false, status: 400, errorMessage: 'Effective date (YYYY-MM-DD) is required.' };
  }
  if (!agencyId) {
    return { ok: false, status: 400, errorMessage: 'agencyId is required.' };
  }

  const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt || Date.now());
  if (Number.isNaN(submitted.getTime())) {
    return { ok: false, status: 400, errorMessage: 'submittedAt is invalid.' };
  }

  // Find pay period P that contains the effective date.
  const period = await PayrollPeriod.findForAgencyByDate({ agencyId, dateYmd: eff });
  if (!period) {
    return {
      ok: false,
      status: 409,
      errorMessage:
        'No pay period exists for the selected date. Please contact your administrative team.',
      meta: { reason: 'no_period_for_effective_date', effectiveDateYmd: eff, timeZone: safeTimeZone }
    };
  }

  const periodEndYmd = ymdStr(period.period_end);
  if (!parseYmd(periodEndYmd)) {
    return {
      ok: false,
      status: 409,
      errorMessage:
        'Unable to compute submission deadlines (invalid pay period end date). Please contact your administrative team.',
      meta: {
        reason: 'invalid_period_end',
        effectiveDateYmd: eff,
        timeZone: safeTimeZone,
        periodId: period.id,
        periodEndRawType: typeof period.period_end,
        periodEndRaw: String(period.period_end || '')
      }
    };
  }

  const cutoffSameYmd = nextSundayOnOrAfterYmd(periodEndYmd);
  if (!cutoffSameYmd) {
    return {
      ok: false,
      status: 409,
      errorMessage: 'Unable to compute submission deadlines. Please contact your administrative team.',
      meta: {
        reason: 'cutoff_same_missing',
        effectiveDateYmd: eff,
        timeZone: safeTimeZone,
        periodId: period.id,
        periodEndYmd
      }
    };
  }

  const cutoffSameUtc = zonedTimeToUtc({ ymd: cutoffSameYmd, hour: 23, minute: 59, second: 59, timeZone: safeTimeZone });
  if (!cutoffSameUtc) {
    return {
      ok: false,
      status: 409,
      errorMessage: 'Unable to compute submission deadlines. Please contact your administrative team.',
      meta: {
        reason: 'cutoff_same_utc_missing',
        effectiveDateYmd: eff,
        timeZone: safeTimeZone,
        periodId: period.id,
        cutoffSameYmd
      }
    };
  }

  // Find next pay period only when needed.
  const needsNext =
    (submitted.getTime() > cutoffSameUtc.getTime()) ||
    String(hardStopPolicy || '').toLowerCase() === 'in_school';
  const next = needsNext
    ? await PayrollPeriod.findNextForAgencyAfter({ agencyId, afterDateYmd: periodEndYmd })
    : null;
  const nextMissing = Boolean(needsNext && !next);

  const hardPolicy = String(hardStopPolicy || '60_days').toLowerCase();
  let cutoffFinalUtc = null;
  let cutoffFinalYmd = null;

  if (hardPolicy === 'in_school') {
    if (nextMissing) {
      // If the next pay period isn't configured yet, we still allow submission.
      // We cannot compute the "final" in-school cutoff without the next period.
      cutoffFinalUtc = null;
      cutoffFinalYmd = null;
    } else {
    const nextEndYmd = ymdStr(next.period_end);
    cutoffFinalYmd = nextSundayOnOrAfterYmd(nextEndYmd);
    if (!cutoffFinalYmd) {
      return {
        ok: false,
        status: 409,
        errorMessage: 'Unable to compute submission deadlines. Please contact your administrative team.',
        meta: {
          reason: 'cutoff_final_missing',
          effectiveDateYmd: eff,
          timeZone: safeTimeZone,
          periodId: period.id,
          nextPeriodId: next?.id || null,
          nextEndYmd
        }
      };
    }
    cutoffFinalUtc = zonedTimeToUtc({ ymd: cutoffFinalYmd, hour: 23, minute: 59, second: 59, timeZone: safeTimeZone });
    if (!cutoffFinalUtc) {
      return {
        ok: false,
        status: 409,
        errorMessage: 'Unable to compute submission deadlines. Please contact your administrative team.',
        meta: {
          reason: 'cutoff_final_utc_missing',
          effectiveDateYmd: eff,
          timeZone: safeTimeZone,
          periodId: period.id,
          nextPeriodId: next?.id || null,
          cutoffFinalYmd
        }
      };
    }
    }
  } else if (hardPolicy === '60_days') {
    const days = Number.isFinite(Number(hardStopDays)) && Number(hardStopDays) >= 0 ? Number(hardStopDays) : 60;
    cutoffFinalYmd = addDaysYmd(eff, days);
    if (!cutoffFinalYmd) {
      return {
        ok: false,
        status: 409,
        errorMessage: 'Unable to compute submission deadlines. Please contact your administrative team.',
        meta: { reason: 'cutoff_60_days_missing', effectiveDateYmd: eff, timeZone: safeTimeZone, days }
      };
    }
    cutoffFinalUtc = zonedTimeToUtc({ ymd: cutoffFinalYmd, hour: 23, minute: 59, second: 59, timeZone: safeTimeZone });
    if (!cutoffFinalUtc) {
      return {
        ok: false,
        status: 409,
        errorMessage: 'Unable to compute submission deadlines. Please contact your administrative team.',
        meta: { reason: 'cutoff_60_days_utc_missing', effectiveDateYmd: eff, timeZone: safeTimeZone, cutoffFinalYmd }
      };
    }
  } else {
    // hardPolicy === 'none'
    cutoffFinalUtc = null;
    cutoffFinalYmd = null;
  }

  // Determine the minimum eligible period for posting.
  let eligibleMin = period;
  let decision = 'same_period';
  if (submitted.getTime() > cutoffSameUtc.getTime()) {
    eligibleMin = next || period;
    decision = next ? 'next_period' : 'same_period_next_missing';
  }
  if (cutoffFinalUtc && submitted.getTime() > cutoffFinalUtc.getTime()) {
    return {
      ok: false,
      status: 409,
      errorMessage: hardPolicy === '60_days' ? CLAIM_DEADLINE_60_DAYS_ERROR_MESSAGE : CLAIM_DEADLINE_ERROR_MESSAGE,
      meta: {
        timeZone: safeTimeZone,
        effectiveDateYmd: eff,
        periodId: period.id,
        nextPeriodId: next?.id || null,
        cutoffSameLocal: fmtLocalCutoff({ ymd: cutoffSameYmd, hour: 23, minute: 59, second: 59 }),
        cutoffFinalLocal: cutoffFinalYmd ? fmtLocalCutoff({ ymd: cutoffFinalYmd, hour: 23, minute: 59, second: 59 }) : null,
        hardStopPolicy: hardPolicy
      }
    };
  }

  return {
    ok: true,
    timeZone: safeTimeZone,
    effectiveDateYmd: eff,
    period,
    next,
    nextMissing,
    decision,
    eligibleMinPeriod: eligibleMin,
    suggestedPayrollPeriodId: eligibleMin.id,
    hardStopPolicy: hardPolicy,
    cutoffs: {
      cutoffSameUtc,
      cutoffFinalUtc,
      cutoffSameLocal: fmtLocalCutoff({ ymd: cutoffSameYmd, hour: 23, minute: 59, second: 59 }),
      cutoffFinalLocal: cutoffFinalYmd ? fmtLocalCutoff({ ymd: cutoffFinalYmd, hour: 23, minute: 59, second: 59 }) : null
    }
  };
}

export function isValidTimeZone(tz) {
  const s = String(tz || '').trim();
  if (!s) return false;
  try {
    // Will throw RangeError for invalid time zones.
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveClaimTimeZone({ officeLocationTimeZone } = {}) {
  const tz = String(officeLocationTimeZone || '').trim();
  if (tz && isValidTimeZone(tz)) return tz;
  return DEFAULT_TIMEZONE;
}

