import {generateOccurrenceDates} from './officeSlotSeries.service.js';
import {normalizeWallMysqlDatetime,clientScheduleInstantToUtcMysql,utcDateToZonedParts} from '../utils/zonedWallTime.util.js';
const pad=n=>String(n).padStart(2,'0');
function wall(value,zone){
  if (value instanceof Date || /[zZ]|[+-]\d{2}:?\d{2}$/.test(String(value))){
    const p=utcDateToZonedParts(new Date(value),zone);if(!p)return null;
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  }
  return normalizeWallMysqlDatetime(value);
}
export function officeAvailabilityWindows(startAt,endAt,recurrence,occurrenceCount,timeZone){
  const start=wall(startAt,timeZone),end=wall(endAt,timeZone);
  if(!start||!end||end<=start||start.slice(0,10)!==end.slice(0,10))return [];
  const windows = generateOccurrenceDates({startDate:start.slice(0,10),recurrence,occurrenceCount}).map((date,index)=>({dateYmd:date,
    startAt:clientScheduleInstantToUtcMysql(index===0 ? startAt : `${date} ${start.slice(11)}`,timeZone),endAt:clientScheduleInstantToUtcMysql(index===0 ? endAt : `${date} ${end.slice(11)}`,timeZone)}));
  return windows.every(window=>window.startAt && window.endAt && window.endAt>window.startAt) ? windows : [];
}
