/**
 * Nth-weekday-of-month helpers for school-year lifecycle automation.
 * Months are 1–12. Weekday: 0=Sunday … 6=Saturday (JS Date.getDay()).
 */

export function nthWeekdayOfMonth(year, month1to12, weekday0to6, n) {
  const y = Number(year);
  const m = Number(month1to12);
  const wd = Number(weekday0to6);
  const nth = Number(n);
  if (!y || !m || nth < 1) return null;
  let count = 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(y, m - 1, day);
    if (d.getDay() === wd) {
      count += 1;
      if (count === nth) return d;
    }
  }
  return null;
}

export function lastWeekdayOfMonth(year, month1to12, weekday0to6) {
  const y = Number(year);
  const m = Number(month1to12);
  const wd = Number(weekday0to6);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let day = daysInMonth; day >= 1; day -= 1) {
    const d = new Date(y, m - 1, day);
    if (d.getDay() === wd) return d;
  }
  return null;
}

function ymd(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameYmd(a, b) {
  return ymd(a) && ymd(a) === ymd(b);
}

/** Second Monday of May. */
export function springUpdateOpensAt(year) {
  return nthWeekdayOfMonth(year, 5, 1, 2);
}

/** Last Friday of May. */
export function springUpdateDueAt(year) {
  return lastWeekdayOfMonth(year, 5, 5);
}

/** Last Monday of July. */
export function julyRolloverAt(year) {
  return lastWeekdayOfMonth(year, 7, 1);
}

/** Second Monday of August. */
export function fallConfirmationDueAt(year) {
  return nthWeekdayOfMonth(year, 8, 1, 2);
}

export function isSpringUpdateOpenDay(now = new Date()) {
  return sameYmd(now, springUpdateOpensAt(now.getFullYear()));
}

export function isSpringUpdateDueDay(now = new Date()) {
  return sameYmd(now, springUpdateDueAt(now.getFullYear()));
}

export function isJulyRolloverDay(now = new Date()) {
  return sameYmd(now, julyRolloverAt(now.getFullYear()));
}

export function isFallConfirmationDueDay(now = new Date()) {
  return sameYmd(now, fallConfirmationDueAt(now.getFullYear()));
}

/** Inclusive: spring open through spring due. */
export function isInSpringUpdateWindow(now = new Date()) {
  const y = now.getFullYear();
  const open = springUpdateOpensAt(y);
  const due = springUpdateDueAt(y);
  if (!open || !due) return false;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return t >= open.getTime() && t <= due.getTime();
}

/** From July rollover through fall confirmation due (inclusive). */
export function isInFallConfirmationWindow(now = new Date()) {
  const y = now.getFullYear();
  const open = julyRolloverAt(y);
  const due = fallConfirmationDueAt(y);
  if (!open || !due) return false;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return t >= open.getTime() && t <= due.getTime() + 90 * 24 * 60 * 60 * 1000; // keep open past due until resolved
}

export function upcomingSchoolYearLabel(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  // Before July: upcoming is current calendar year's school year starting this July
  // On/after July: upcoming is next July's year
  if (m < 7) return `${y}-${y + 1}`;
  return `${y + 1}-${y + 2}`;
}

export function currentSchoolYearLabelFromCalendar(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}
