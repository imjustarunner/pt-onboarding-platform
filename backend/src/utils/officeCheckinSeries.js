import { parseUtcDate, resolveOfficeTimeZone } from './officeEventDateTime.util.js';

export function checkinSeries(row) {
  const timezone=resolveOfficeTimeZone(row.timezone);
  const date=parseUtcDate(row.scheduled_start_at);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const time=`${values.hour}:${values.minute}`;
  const label=`${values.weekday} · ${date.toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'})}`;
  return {key:[row.provider_id,row.agency_id,row.office_location_id,timezone,values.weekday,time].join('|'),label,weekday:values.weekday,time,timezone};
}
