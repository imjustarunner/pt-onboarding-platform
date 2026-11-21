import { utcToZonedMysqlWall, mysqlDateTimeForDateHour } from './officeEventDateTime.util.js';
import { clientScheduleInstantToUtcMysql, dateToMysqlUtcDateTime, utcMysqlToIso } from './zonedWallTime.util.js';
import { addDaysYmd } from './scheduleRecurrence.js';

function wallMinute(value) {
  return Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
}

const invalid = message => Object.assign(new Error(message), { status: 400 });

// Room requests hold whole hours. Session times follow the office wall clock even across DST.
export function roomBlockForSession(startAt, endAt, timeZone) {
  startAt = utcMysqlToIso(startAt)?.slice(0, 19).replace('T', ' ');
  endAt = utcMysqlToIso(endAt)?.slice(0, 19).replace('T', ' ');
  const start = utcToZonedMysqlWall(startAt, timeZone);
  const end = utcToZonedMysqlWall(endAt, timeZone);
  const date = start?.slice(0, 10);
  if (!date || !end || start.slice(17) !== '00' || end.slice(17) !== '00') {
    throw invalid('Choose a valid session start and end in whole minutes.');
  }
  const endMinute = end.slice(0, 10) === date ? wallMinute(end)
    : end.slice(0, 10) === addDaysYmd(date, 1) && end.slice(11) === '00:00:00' ? 1440 : null;
  const startMinute = wallMinute(start);
  if (endMinute == null || endMinute <= startMinute) throw invalid('Choose a session that ends after it starts on the same service day.');
  const startHour = Math.floor(startMinute / 60);
  const endHour = Math.ceil(endMinute / 60);
  const roomStart = mysqlDateTimeForDateHour(date, startHour, timeZone);
  const roomEnd = mysqlDateTimeForDateHour(date, endHour, timeZone);
  if (!roomStart || !roomEnd || roomStart > startAt || roomEnd < endAt) {
    throw invalid('That room window crosses a clock change. Choose another session time.');
  }
  return { startAt: roomStart, endAt: roomEnd, offsets: [startMinute - startHour * 60, endMinute - startHour * 60] };
}

export function sessionWindowInRoom(roomStart, roomEnd, offsets, timeZone) {
  if (!offsets) return { startAt: roomStart, endAt: roomEnd };
  const [from, to] = offsets;
  const localStart = utcToZonedMysqlWall(roomStart, timeZone);
  if (!localStart || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > 1440) {
    throw invalid('The requested session time needs review.');
  }
  const startWallMs = Date.parse(localStart.replace(' ', 'T') + 'Z');
  const at = minutes => clientScheduleInstantToUtcMysql(dateToMysqlUtcDateTime(new Date(startWallMs + minutes * 60000)), timeZone);
  const startAt = at(from);
  const endAt = at(to);
  const blockStart = utcMysqlToIso(roomStart)?.slice(0, 19).replace('T', ' ');
  const blockEnd = utcMysqlToIso(roomEnd)?.slice(0, 19).replace('T', ' ');
  if (!startAt || !endAt || !blockStart || !blockEnd || startAt < blockStart || endAt > blockEnd || endAt <= startAt) {
    throw invalid('The approved room hours must cover the entire session.');
  }
  return { startAt, endAt };
}
