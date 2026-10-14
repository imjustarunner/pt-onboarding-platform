import { utcToZonedMysqlWall } from './officeEventDateTime.util.js';
import { addDaysYmd } from './scheduleRecurrence.js';

export function assertOfficeRequestNotExpired({startDate, recurrence, endHour, timeZone = 'America/Denver'}, now = new Date()) {
  if (String(recurrence).toUpperCase() !== 'ONCE') return;
  const wall = utcToZonedMysqlWall(now, timeZone);
  const today = wall.slice(0,10);
  const currentHour = Number(wall.slice(11,13)) + Number(wall.slice(14,16))/60;
  if (startDate < today || (startDate === today && Number(endHour) <= currentHour)) {
    throw Object.assign(new Error('This one-time room request has already ended. Ask the provider to choose a future date and confirm whether it should repeat; no reservation was created.'), {status:409,code:'OFFICE_REQUEST_EXPIRED'});
  }
}

// This limits the first date of a new request/series, not its recurring tail.
export function assertRoomBookingStart(start, timeZone = 'America/Denver', now = new Date()) {
  const text = String(start || '');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : utcToZonedMysqlWall(start, timeZone)?.slice(0,10);
  const lastDay = addDaysYmd(utcToZonedMysqlWall(now,timeZone).slice(0,10),42);
  if (!day || day > lastDay) throw Object.assign(new Error('New room bookings must start within the next six weeks. Recurring bookings can continue through the next year.'), {status:400,code:'ROOM_BOOKING_START_TOO_FAR'});
}
