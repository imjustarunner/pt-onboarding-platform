import {parseScheduleUtcInstant} from './scheduleEventInstants.js';

// Keep timezone conversion out of repeated calendar-cell renders. Cache numeric
// parts, not Date objects: callers adjust returned Dates for quarter-hour layout.
const wallFormatters = new Map();
const wallParts = new Map();
const remember = (cache, key, value, limit) => {
  if (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
};

/** A render-only wall-clock Date for local grid geometry. Never send this value to an API. */
export function calendarWallDate(raw, timeZone) {
  const instant = parseScheduleUtcInstant(raw);
  if (!instant) return null;
  const key = `${timeZone || ''}|${instant.getTime()}`;
  let parts = wallParts.get(key);
  if (!parts) {
    let formatter = wallFormatters.get(timeZone);
    if (!formatter) {
      formatter = remember(wallFormatters, timeZone, new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }), 32);
    }
    const values = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    parts = remember(wallParts, key, [Number(values.year), Number(values.month) - 1,
      Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)], 4096);
  }
  return new Date(...parts);
}
export function calendarSessionState(row){
 const status=String(row?.appointmentStatus||row?.status||'').toUpperCase();
 if(status==='VOIDED'||row?.isVoided)return 'Voided';
 if(/MISSED|NO[-_]?SHOW/.test(status)||row?.isMissed)return 'Missed';
 if(/^CANCEL|^LATE_CANCEL/.test(status)||row?.isCancelled)return 'Cancelled';
 return '';
}
