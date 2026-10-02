import { utcDateToZonedYmd } from './zonedWallTime.util.js';
import { resolveOfficeTimeZone } from './officeEventDateTime.util.js';

/** Exclusive anniversary; February 29 renews on February 28 next year. */
export function officeYearBoundary(startYmd) {
  const [year, month, day] = String(startYmd).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

export function withinOfficeRecordWindow(dateYmd, timeZone, now = new Date()) {
  const today = utcDateToZonedYmd(now, resolveOfficeTimeZone(timeZone));
  return String(dateYmd).slice(0, 10) < officeYearBoundary(today);
}

export function officePlanHasClient(plan) {
  let context = plan?.session_context_json;
  if (typeof context === 'string') { try { context = JSON.parse(context); } catch { return true; } }
  return !!context?.clientId;
}
