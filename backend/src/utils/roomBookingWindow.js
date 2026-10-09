import { utcToZonedMysqlWall } from './officeEventDateTime.util.js';
import { addDaysYmd } from './scheduleRecurrence.js';

// This limits the first date of a new request/series, not its recurring tail.
export function assertRoomBookingStart(start, timeZone = 'America/Denver', now = new Date()) {
  const text = String(start || '');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : utcToZonedMysqlWall(start, timeZone)?.slice(0,10);
  const lastDay = addDaysYmd(utcToZonedMysqlWall(now,timeZone).slice(0,10),42);
  if (!day || day > lastDay) throw Object.assign(new Error('New room bookings must start within the next six weeks. Recurring bookings can continue through the next year.'), {status:400,code:'ROOM_BOOKING_START_TOO_FAR'});
}
