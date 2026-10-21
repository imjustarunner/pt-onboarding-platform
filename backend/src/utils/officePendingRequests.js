import { utcToZonedMysqlWall } from './officeEventDateTime.util.js';
import { generateOccurrenceDates } from './scheduleRecurrence.js';

export function pendingBookingOccurrences(requests, days, fallbackTimeZone = 'America/Denver') {
  return requests.flatMap(request => {
    const tz = request.timeZone || fallbackTimeZone;
    const start = utcToZonedMysqlWall(request.startAt, tz);
    const end = utcToZonedMysqlWall(request.endAt, tz);
    if (!start || !end) return [];
    const dates = generateOccurrenceDates({ startDate: start.slice(0,10), recurrence: request.frequency,
      occurrenceCount: request.occurrenceCount || 52 });
    const startHour = Number(start.slice(11,13)) + Number(start.slice(14,16))/60;
    const endHour = Number(end.slice(11,13)) + Number(end.slice(14,16))/60 + (end.slice(0,10)>start.slice(0,10)?24:0);
    return dates.filter(date => days.includes(date)).map(date => ({ ...request, id: `booking-${request.id}`,
      date, startHour, endHour, key: `booking:${request.id}`, source: 'booking', preferredRooms: request.roomId ? [{id:request.roomId,label:request.roomNumber ? `Office #${request.roomNumber}` : request.roomLabel}] : [] }));
  });
}

// A building-wide request needs ONE room. Do not turn it into a soft hold on
// every room; keep it in the building queue until staff chooses a room.
export function indexPendingRoomRequest(pendingBySlot, unassigned, request) {
  if (!request.roomId) {
    unassigned.set(`${request.id}:${request.date}:${request.startHour}:${request.endHour}`,request);
    return;
  }
  for(let hour=Math.floor(request.startHour);hour<request.endHour;hour++) {
    const key=`${request.date}:${hour}:${request.roomId}`;
    if(!pendingBySlot.has(key))pendingBySlot.set(key,[]);
    pendingBySlot.get(key).push(request);
  }
}
