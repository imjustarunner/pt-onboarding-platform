import { isoToZonedDatetimeLocal, zonedDatetimeLocalToIso } from './timezones';
export const SNAP_MINUTES = 15;
export function shiftCalendarDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function calendarWeekDays(day, weekStartsOn = 1, showWeekends = true) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const first = shiftCalendarDay(day, -((weekday - weekStartsOn + 7) % 7));
  return Array.from({length:7}, (_,i)=>shiftCalendarDay(first,i)).filter(d=>showWeekends || ![0,6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
}
export function calendarSlotIso(day, minute, timezone) {
  const normalizedDay = shiftCalendarDay(day, Math.floor(minute / 1440));
  const m = ((minute % 1440) + 1440) % 1440;
  const wall = `${normalizedDay}T${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  const iso = zonedDatetimeLocalToIso(wall, timezone);
  // Reject a nonexistent spring-forward wall time instead of silently moving it.
  if (!iso || isoToZonedDatetimeLocal(iso,timezone) !== wall) throw new Error('That time does not exist because the clocks change. Choose another time.');
  return iso;
}
export function calendarSelection(anchor, target, timezone, dragged = true) {
  const a = calendarSlotIso(anchor.day,anchor.minute,timezone), b = calendarSlotIso(target.day,target.minute,timezone);
  const start = new Date(Math.min(+new Date(a),+new Date(b)));
  const end = dragged ? new Date(Math.max(+new Date(a),+new Date(b))+SNAP_MINUTES*60000) : new Date(+start+60*60000);
  return {start:start.toISOString(),end:end.toISOString()};
}
export function movedCalendarTime(event, originalSlot, targetSlot, timezone, resize = false) {
  const target = calendarSlotIso(targetSlot.day,targetSlot.minute,timezone);
  if (resize) return {start:event.start,end:new Date(Math.max(+new Date(event.start)+SNAP_MINUTES*60000,+new Date(target))).toISOString()};
  // Preserve the grab offset and elapsed duration, including across midnight / DST.
  const delta = +new Date(target)-+new Date(calendarSlotIso(originalSlot.day,originalSlot.minute,timezone));
  return {start:new Date(+new Date(event.start)+delta).toISOString(),end:new Date(+new Date(event.end)+delta).toISOString()};
}
