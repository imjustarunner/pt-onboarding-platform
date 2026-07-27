/**
 * Shared "school_year" label helpers for the `clients.school_year` column, stored as `YYYY-YYYY`
 * (e.g. "2025-2026"). Cutoff mirrors the fiscal/school-year conventions used elsewhere in the app
 * (new school year begins in July).
 */

export function normalizeSchoolYearLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const m2 = s.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return s;
}

/** School year label for "now" (e.g. Jul 2026 → "2026-2027"). */
export function computeCurrentSchoolYearLabel(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}
