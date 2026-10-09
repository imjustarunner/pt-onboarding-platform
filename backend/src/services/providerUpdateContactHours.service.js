import pool from '../config/database.js';
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import {resolveAvailabilitySchedule,DEFAULT_AVAILABILITY} from './availabilityWindow.service.js';
import {isValidTimeZone} from '../utils/zonedWallTime.util.js';
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export async function getContactHours(userId){
 const schedule=await resolveAvailabilitySchedule(userId);
 const prefs=await UserPreferences.findByUserId(userId);
 const saved=await UserWorkSchedule.getForUser(userId);
 const anytime=!schedule.enabled||[true,1,'1'].includes(prefs?.allow_notifications_outside_work_schedule);
 return {mode:anytime?'anytime':schedule.source==='default'?'default':'custom',timezone:saved?.timezone||schedule.timezone,
  blocks:schedule.blocks.length?schedule.blocks.map(b=>({dayOfWeek:b.dayOfWeek,startTime:time(b.startMinutes),endTime:time(b.endMinutes)})):(saved?.blocks||[]).map(b=>({dayOfWeek:Number(b.day_of_week),startTime:String(b.start_time).slice(0,5),endTime:String(b.end_time).slice(0,5)})),
  defaults:{days:DEFAULT_AVAILABILITY.days,startTime:time(DEFAULT_AVAILABILITY.startMinutes),endTime:time(DEFAULT_AVAILABILITY.endMinutes)},
  legacyQuietHours:!!prefs?.quiet_hours_enabled};
}
export function validateContactHours(input){
 const mode=input?.mode;if(!['follow','default','custom','anytime'].includes(mode)||!isValidTimeZone(input?.timezone))throw Object.assign(new Error('Choose contact hours and a valid time zone.'),{status:400});
 const blocks=mode==='default'?DEFAULT_AVAILABILITY.days.map(dayOfWeek=>({dayOfWeek,startTime:time(DEFAULT_AVAILABILITY.startMinutes),endTime:time(DEFAULT_AVAILABILITY.endMinutes)})):mode==='anytime'?[]:input.blocks;
 if(!Array.isArray(blocks)||blocks.length>28||mode==='custom'&&!blocks.length)throw Object.assign(new Error('Add at least one contact window, or choose Anytime.'),{status:400});
 const seen=[];
 for(const b of blocks){if(!Number.isInteger(b.dayOfWeek)||b.dayOfWeek<0||b.dayOfWeek>6||![b.startTime,b.endTime].every(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(t)))||b.startTime>=b.endTime||seen.some(s=>s.dayOfWeek===b.dayOfWeek&&s.startTime<b.endTime&&b.startTime<s.endTime))throw Object.assign(new Error('Use valid, non-overlapping start and end times for each day.'),{status:400});seen.push(b);}
 return {mode,timezone:input.timezone,blocks};
}
export async function saveContactHours(userId,input){
 if(input?.mode==='follow'){
  await pool.execute('UPDATE user_work_schedules SET is_active=1 WHERE user_id=? AND agency_id IS NULL',[userId]);
  await UserPreferences.update(userId,{quiet_hours_enabled:false,allow_notifications_outside_work_schedule:false});
  await pool.execute(`INSERT INTO user_communication_prefs(user_id,availability_hours_enabled) VALUES(?,1) ON DUPLICATE KEY UPDATE availability_hours_enabled=1`,[userId]);
  return getContactHours(userId);
 }
 const data=validateContactHours(input);
 if(data.mode!=='anytime')await UserWorkSchedule.upsertForUser(userId,{timezone:data.timezone,isActive:data.mode!=='anytime',blocks:data.mode==='default'?[]:data.blocks});
 // This form replaces older quiet-window rules, without changing channel consent.
 await UserPreferences.update(userId,{quiet_hours_enabled:false,allow_notifications_outside_work_schedule:data.mode==='anytime'});
 await pool.execute(`INSERT INTO user_communication_prefs(user_id,availability_hours_enabled) VALUES(?,?) ON DUPLICATE KEY UPDATE availability_hours_enabled=VALUES(availability_hours_enabled)`,[userId,data.mode==='anytime'?0:1]);
 return getContactHours(userId);
}
