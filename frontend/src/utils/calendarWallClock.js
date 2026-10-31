import {parseScheduleUtcInstant} from './scheduleEventInstants.js';

/** A render-only wall-clock Date for local grid geometry. Never send this value to an API. */
export function calendarWallDate(raw,timeZone){
 const instant=parseScheduleUtcInstant(raw);if(!instant)return null;
 const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
 return new Date(Number(values.year),Number(values.month)-1,Number(values.day),Number(values.hour),Number(values.minute),Number(values.second));
}
export function calendarSessionState(row){
 const status=String(row?.appointmentStatus||row?.status||'').toUpperCase();
 if(status==='VOIDED'||row?.isVoided)return 'Voided';
 if(/MISSED|NO[-_]?SHOW/.test(status)||row?.isMissed)return 'Missed';
 if(/^CANCEL|^LATE_CANCEL/.test(status)||row?.isCancelled)return 'Cancelled';
 return '';
}
