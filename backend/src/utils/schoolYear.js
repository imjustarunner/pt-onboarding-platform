/**
 * Shared "school_year" label helpers for the `clients.school_year` column, stored as `YYYY-YYYY`
 * (e.g. "2025-2026"). Portal default year switches on the last Monday of July
 * (see schoolYearCalendar.js); before that Monday in July, prior year remains current.
 */
import { lastWeekdayOfMonth } from './schoolYearCalendar.js';

export function normalizeSchoolYearLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const m2 = s.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  // Tolerate "2025 2026" / "2025–2026" dirty labels from imports
  const m3 = s.match(/^(\d{4})\s*[–—\s]\s*(\d{4})$/);
  if (m3) return `${m3[1]}-${m3[2]}`;
  return s;
}

function ymdLocal(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * School year label for "now" (e.g. after last Monday of July 2026 → "2026-2027").
 * Aligns portal default year with July rollover automation.
 */
export function computeCurrentSchoolYearLabel(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m < 7) {
    return `${y - 1}-${y}`;
  }
  if (m > 7) {
    return `${y}-${y + 1}`;
  }
  // July: switch on/after last Monday of July
  const rollover = lastWeekdayOfMonth(y, 7, 1);
  const today = ymdLocal(now);
  const rolloverYmd = ymdLocal(rollover);
  if (rolloverYmd && today && today >= rolloverYmd) {
    return `${y}-${y + 1}`;
  }
  return `${y - 1}-${y}`;
}

/** PYU-style short year label (YYYY-YY). */
export function computeCurrentSchoolYearShort(now = new Date()) {
  const full = computeCurrentSchoolYearLabel(now);
  const m = String(full || '').match(/^(\d{4})-(\d{4})$/);
  if (!m) return full;
  return `${m[1]}-${m[2].slice(-2)}`;
}
