/** Shared gates for countable supervision hours and supervisee MEETING pay. */

/** Normalize user_agencies.supervision_start_date (DATE string or mysql2 Date) to YYYY-MM-DD. */
export function normalizeSupervisionStartDateYmd(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const sd = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : null;
}

export const MASTERS_SUPERVISION_CREDENTIAL_CODES = [
  'LPCC',
  'LMFT',
  'LMFTC',
  'MFTC',
  'LSW',
  'SWC'
];

/**
 * Countable toward 50/100 only when session date is on/after effective start date.
 * Missing start date → logged but not counted.
 */
export function sessionHoursAreCountable({ sessionDateYmd, effectiveStartDate }) {
  const dos = String(sessionDateYmd || '').slice(0, 10);
  const start = String(effectiveStartDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dos)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
  return dos >= start;
}

/** Payroll / UI pay eligibility: ≥50 individual and ≥100 total. */
export function isSupervisionPayEligibleHours({ individualHours = 0, groupHours = 0 } = {}) {
  const ind = Number(individualHours || 0);
  const grp = Number(groupHours || 0);
  const total = ind + grp;
  return ind >= 50 - 1e-9 && total >= 100 - 1e-9;
}
