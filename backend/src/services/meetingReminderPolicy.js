import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { utcDateToZonedParts, zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';
export function meetingReminderSchedule(event) {
  const start=parseUtcDate(event.start_at);if(!start)return [];
  const settings=parseMeetingSettings(event.meeting_settings_json);
  const keys=settings.reminders || (event.reminder_minutes===null?[]:[event.reminder_minutes??5]);
  return keys.map(key=>{
    if(key!=='business_days_3')return {key:String(key),at:new Date(start.getTime()-Number(key)*60000),label:`${key} minutes before`};
    const timeZone=event.event_timezone||'America/Denver';const p=utcDateToZonedParts(start,timeZone);
    const day=new Date(Date.UTC(p.year,p.month-1,p.day));let count=0;
    while(count<3){day.setUTCDate(day.getUTCDate()-1);if(day.getUTCDay()!==0&&day.getUTCDay()!==6)count++;}
    return {key,at:zonedWallTimeToUtc({...p,year:day.getUTCFullYear(),month:day.getUTCMonth()+1,day:day.getUTCDate(),timeZone}),label:'3 business days before'};
  });
}
