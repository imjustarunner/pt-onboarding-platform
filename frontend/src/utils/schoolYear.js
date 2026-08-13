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

/** Current year plus a few prior labels for roster year picker. */
export function buildSchoolYearPickerOptions(now = new Date(), priorCount = 4) {
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

export function formatSchoolYearDisplay(label) {
  const n = normalizeSchoolYearLabel(label);
  return n ? `${n} school year` : 'School year';
}
