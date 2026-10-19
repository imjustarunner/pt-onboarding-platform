import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { utcDateToZonedParts, zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';
export function trainingReminderDescription(event, { isRequired = true } = {}) {
  const settings = parseMeetingSettings(event.meeting_settings_json);
  if (settings.trainingReminderMode === 'configured_only') {
    const reminders = (settings.reminders || []).map(minutes => minutes === 'business_days_3' ? '3 business days' : minutes % 1440 === 0 ? `${minutes / 1440} day${minutes === 1440 ? '' : 's'}` : minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`);
    return reminders.length ? `This event uses a special reminder schedule: ${reminders.join(', ')} before each date, including confirmed attendees. Declining stops these reminders.` : 'Reminders are turned off for this event.';
  }
  return `${isRequired ? 'Please RSVP. Registration reminders stop when you respond.' : 'This training is optional. RSVP only if you plan to attend; no decline is required. Unanswered invitations receive a reminder one week before and one final reminder three days before, then no further reminders.'} Confirmed attendees receive one 24-hour reminder and a join link 5 minutes before each date. Declining stops all reminders.`;
}

export function meetingReminderSchedule(event, { rsvp = 'pending', isRequired = true } = {}) {
  const start=parseUtcDate(event.start_at);if(!start)return [];
  const settings=parseMeetingSettings(event.meeting_settings_json);
  if (event.meeting_subtype==='training' && rsvp==='declined') return [];
  const configured=settings.reminders || (event.reminder_minutes===null?[]:[event.reminder_minutes??5]);
  const keys=event.meeting_subtype==='training' && settings.trainingReminderMode!=='configured_only'
    ? rsvp==='accepted' ? [1440,5] : !isRequired ? [10080,4320] : configured
    : configured;
  return keys.map(key=>{
    if(key!=='business_days_3')return {key:String(key),at:new Date(start.getTime()-Number(key)*60000),label:`${key} minutes before`};
    const timeZone=event.event_timezone||'America/Denver';const p=utcDateToZonedParts(start,timeZone);
    const day=new Date(Date.UTC(p.year,p.month-1,p.day));let count=0;
    while(count<3){day.setUTCDate(day.getUTCDate()-1);if(day.getUTCDay()!==0&&day.getUTCDay()!==6)count++;}
    return {key,at:zonedWallTimeToUtc({...p,year:day.getUTCFullYear(),month:day.getUTCMonth()+1,day:day.getUTCDate(),timeZone}),label:'3 business days before'};
  });
}
