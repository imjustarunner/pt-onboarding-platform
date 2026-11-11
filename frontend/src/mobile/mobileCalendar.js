import {parseScheduleInstant} from '../utils/parseScheduleInstant.js';
export function localCalendarDay(date=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver'){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function shiftCalendarDay(day,amount){const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+amount);return value.toISOString().slice(0,10);}
export function calendarMinute(value,timeZone){const date=parseScheduleInstant(value);if(!date)return null;const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));return {day:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute)};}
export function calendarInitialMinute(items,day,timeZone,now=new Date()){const first=layoutMobileCalendar(items,day,timeZone)[0]?.start;if(day!==localCalendarDay(now,timeZone))return first??420;const current=calendarMinute(now.toISOString(),timeZone);return Math.max(Math.min(420,first??420),Math.floor(current.minute/60)*60);}
export function calendarTimeInput(minute){const clamped=Math.max(0,Math.min(1439,minute));return `${String(Math.floor(clamped/60)).padStart(2,'0')}:${String(clamped%60).padStart(2,'0')}`;}
export function layoutMobileCalendar(items,day,timeZone){const rows=items.filter(item=>!item.allDay).map(item=>{const start=calendarMinute(item.startAt,timeZone),end=calendarMinute(item.endAt,timeZone);if(!start||!end||start.day>day||end.day<day)return null;return {item,start:start.day<day?0:start.minute,end:end.day>day?1440:end.minute};}).filter(row=>row && row.end>row.start).sort((a,b)=>a.start-b.start||b.end-a.end);let cluster=[],until=0;
 const finish=()=>{if(!cluster.length)return;const cols=[];for(const row of cluster){let column=cols.findIndex(end=>end<=row.start);if(column<0)column=cols.length;cols[column]=row.end;row.column=column;}for(const row of cluster)row.columns=cols.length;cluster=[];};
 for(const row of rows){if(cluster.length&&row.start>=until)finish();cluster.push(row);until=Math.max(cluster.length===1?0:until,row.end);}finish();return rows;}

export function calendarClock(value,timeZone){const date=parseScheduleInstant(value);return date?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone}).format(date):'';}

export const MOBILE_SCHEDULE_ACTIONS=new Set(['individual_session','agency_meeting','supervision','huddle','personal_event','schedule_hold','portal_intake','office_request_only']);
/** UI/native forwarding allowlist; the main-app handoff independently validates again. */
export function mobileScheduleHandoffFields(target={}){
 const {scheduleAction:action,scheduleDate:date,scheduleStart:start,scheduleEnd:end,scheduleTimeZone:timeZone}=target;
 if(!MOBILE_SCHEDULE_ACTIONS.has(action)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof start!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||typeof end!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start||typeof timeZone!=='string'||timeZone.length>80)return {};
 const parsed=new Date(`${date}T12:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return {};
 try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{return {};}
 return {scheduleAction:action,scheduleDate:date,scheduleStart:start,scheduleEnd:end,scheduleTimeZone:timeZone};
}
