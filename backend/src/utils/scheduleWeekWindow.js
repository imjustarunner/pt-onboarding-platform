import { clientScheduleInstantToUtcMysql, utcMysqlToIso } from './zonedWallTime.util.js';
import { addDaysYmd } from './scheduleRecurrence.js';

export function scheduleWeekWindow(weekStart, timeZone) {
  const windowStart = clientScheduleInstantToUtcMysql(`${weekStart}T00:00:00`, timeZone);
  const windowEnd = clientScheduleInstantToUtcMysql(`${addDaysYmd(weekStart, 7)}T00:00:00`, timeZone);
  if (!windowStart || !windowEnd) throw Object.assign(new Error('Choose a valid calendar timezone.'), { status: 400 });
  return { windowStart, windowEnd, timeMinIso: utcMysqlToIso(windowStart), timeMaxIso: utcMysqlToIso(windowEnd) };
}
