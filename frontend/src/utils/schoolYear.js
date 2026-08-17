/**
 * School year labels (aligns with backend schoolYear.js / last Monday of July).
 */
function lastMondayOfJuly(year) {
  const d = new Date(year, 7, 0);
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d;
}

export function normalizeSchoolYearLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const m2 = s.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  const m3 = s.match(/^(\d{4})\s*[–—\s]\s*(\d{4})$/);
  if (m3) return `${m3[1]}-${m3[2]}`;
  return s;
}

export function computeCurrentSchoolYearLabel(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m < 7) return `${y - 1}-${y}`;
  if (m > 7) return `${y}-${y + 1}`;
  const rollover = lastMondayOfJuly(y);
  const today = new Date(y, now.getMonth(), now.getDate());
  return today.getTime() >= rollover.getTime() ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function parseSchoolYearDate(dateLike) {
  if (dateLike instanceof Date && Number.isFinite(dateLike.getTime())) return dateLike;
  const s = String(dateLike || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** True when the date falls in the active school year (last Monday of July rollover). */
export function isDateInCurrentSchoolYear(dateLike, now = new Date()) {
  const dt = parseSchoolYearDate(dateLike);
  if (!dt) return false;
  return computeCurrentSchoolYearLabel(dt) === computeCurrentSchoolYearLabel(now);
}

/** Current year plus optional prior labels (prefer API-driven roster years in school portal). */
export function buildSchoolYearPickerOptions(now = new Date(), priorCount = 0) {
  const current = computeCurrentSchoolYearLabel(now);
  const m = String(current).match(/^(\d{4})-(\d{4})$/);
  if (!m) return [current];
  let start = parseInt(m[1], 10);
  const out = [current];
  for (let i = 0; i < priorCount; i += 1) {
    start -= 1;
    out.push(`${start}-${start + 1}`);
  }
  return out;
}

/** Prior roster years from server data — excludes the current label. */
export function priorSchoolYearsFromAvailable(availableYears = [], currentLabel = null) {
  const current = normalizeSchoolYearLabel(currentLabel) || computeCurrentSchoolYearLabel();
  const seen = new Set();
  const out = [];
  for (const raw of availableYears || []) {
    const label = normalizeSchoolYearLabel(raw);
    if (!label || label === current || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.sort((a, b) => String(b).localeCompare(String(a)));
}

export function formatSchoolYearDisplay(label) {
  const n = normalizeSchoolYearLabel(label);
  return n ? `${n} school year` : 'School year';
}

/** Prior roster year for a label (2026-2027 → 2025-2026). */
export function previousSchoolYearLabel(label = null) {
  const current = normalizeSchoolYearLabel(label) || computeCurrentSchoolYearLabel();
  const m = String(current).match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  return `${start - 1}-${start}`;
}
