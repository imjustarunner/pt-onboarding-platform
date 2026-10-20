import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { withRecurringScheduleEdit } from './recurringScheduleCancellation.service.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { assertNoReviewTimeOverlap } from './supervisionReviewTime.service.js';
import { utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { assertMeetingBookingWindow, recurringWindowEnd } from '../utils/recurringWindow.js';

export function shiftedSupervisionWindow(occurrence, anchor, startAt, endAt, zone) {
  const original = utcToZonedMysqlWall(anchor.start_at, zone);
  const desired = utcToZonedMysqlWall(startAt, zone);
  const desiredEnd = utcToZonedMysqlWall(endAt, zone);
  const occurrenceWall = utcToZonedMysqlWall(occurrence.start_at, zone);
  if (![original,desired,desiredEnd,occurrenceWall].every(Boolean)) throw Object.assign(new Error('Invalid supervision dates.'), {status:400});
  const wallMs = value => Date.parse(`${value.replace(' ','T')}Z`);
  const dayDelta = wallMs(`${desired.slice(0,10)} 00:00:00`) - wallMs(`${original.slice(0,10)} 00:00:00`);
  const day = new Date(wallMs(`${occurrenceWall.slice(0,10)} 00:00:00`)+dayDelta).toISOString().slice(0,10);
  const startWall = `${day} ${desired.slice(11)}`;
  const endWall = new Date(wallMs(startWall)+wallMs(desiredEnd)-wallMs(desired)).toISOString().slice(0,19).replace('T',' ');
  return {startAt:wallMysqlToUtcMysql(startWall,zone),endAt:wallMysqlToUtcMysql(endWall,zone)};
}

// Validate the entire move before writing, and serialize with rolling renewal.
export async function rescheduleSupervisionOccurrences({id,startAt,endAt,timeZone,scope='single'}) {
 assertMeetingBookingWindow({startAt,eventTimezone:timeZone});
 return withRecurringScheduleEdit(async db => {
  const locks=[];
  await db.beginTransaction();
  try {
   const [[anchor]]=await db.execute('SELECT * FROM supervision_sessions WHERE id=? FOR UPDATE',[id]);
   if(!anchor || anchor.status==='CANCELLED') throw Object.assign(new Error('This session is no longer scheduled.'),{status:409});
   if(scope==='future' && !anchor.recurrence_series_id) throw Object.assign(new Error('This session is not recurring.'),{status:400});
   const [rows]=scope==='future' ? await db.execute(`SELECT * FROM supervision_sessions WHERE agency_id=? AND supervisor_user_id=? AND recurrence_series_id=? AND start_at>=? AND finalized_at IS NULL AND live_ended_at IS NULL ORDER BY start_at,id FOR UPDATE`,[anchor.agency_id,anchor.supervisor_user_id,anchor.recurrence_series_id,anchor.start_at]) : [[anchor]];
   if (!rows.length) throw Object.assign(new Error('There are no upcoming sessions to update.'),{status:400});
   const ids=rows.map(r=>Number(r.id));
   const [attendees]=await db.execute(`SELECT session_id,user_id FROM supervision_session_attendees WHERE session_id IN (${ids.map(()=>'?')}) AND is_required=1 AND status NOT IN ('REMOVED','CANCELLED','WITHDRAWN') UNION SELECT session_id,user_id FROM supervision_session_presenters WHERE session_id IN (${ids.map(()=>'?')})`,[...ids,...ids]);
   const planned=rows.map(row=>({...row,window:shiftedSupervisionWindow(row,anchor,startAt,endAt,timeZone),people:[...new Set([row.supervisor_user_id,row.co_facilitator_user_id,...(row.session_type==='individual'?[row.supervisee_user_id]:[]),...attendees.filter(a=>Number(a.session_id)===Number(row.id)).map(a=>a.user_id)].map(Number).filter(Boolean))]}));
   const boundary = recurringWindowEnd(new Date(), timeZone);
   for (const row of planned) {
    // Preserve the date and its presentation work, but do not activate a moved
    // occurrence beyond the rolling year. The existing renewal worker restores
    // it only when it enters the window and passes fresh conflict checks.
    if (row.status === 'SCHEDULED' && utcToZonedMysqlWall(row.window.startAt, timeZone).slice(0,10) >= boundary) {
     row.status = 'CANCELLED';
     row.recurrence_horizon_held = 1;
    }
   }
   const users=[...new Set(planned.flatMap(r=>r.people))].sort((a,b)=>a-b);
   for(const prefix of ['public-provider-selection:','supervision-time:']) for(const uid of users){
    const key=`${prefix}${uid}`;const [[lock]]=await db.execute('SELECT GET_LOCK(?,5) acquired',[key]);
    if(!Number(lock?.acquired)) throw Object.assign(new Error('A participant’s schedule is being updated. Please retry.'),{status:409});locks.push(key);
   }
   for(const row of planned){
    if(row.status==='CANCELLED') continue;
    for(const uid of row.people) await assertAppointmentWindowAvailable(db,{providerUserId:uid,...row.window,sourceTimezone:timeZone,excludeSupervisionIds:ids});
    await assertNoReviewTimeOverlap(db,row.people,row.window.startAt,row.window.endAt);
    for(const other of planned){
     if(other.id>=row.id || other.status==='CANCELLED') continue;
     if(row.window.startAt<other.window.endAt && row.window.endAt>other.window.startAt && row.people.some(uid=>other.people.includes(uid))) throw Object.assign(new Error('The moved sessions would overlap each other.'),{status:409});
    }
   }
   const renewalStart=planned[0].window.startAt;
   if(scope==='future') await db.execute(`UPDATE supervision_sessions SET meeting_settings_json=JSON_SET(COALESCE(meeting_settings_json,JSON_OBJECT()),'$.recurrenceContinuationFrom',?) WHERE agency_id=? AND supervisor_user_id=? AND recurrence_series_id=?`,[renewalStart,anchor.agency_id,anchor.supervisor_user_id,anchor.recurrence_series_id]);
   if(scope==='single' && anchor.recurrence_series_id){
    const settings=parseMeetingSettings(anchor.meeting_settings_json);
    await db.execute(`UPDATE supervision_sessions SET meeting_settings_json=JSON_SET(COALESCE(meeting_settings_json,JSON_OBJECT()),'$.recurrenceOriginalStartAt',?,'$.recurrenceOriginalEndAt',?) WHERE id=?`,[settings.recurrenceOriginalStartAt || utcToZonedMysqlWall(anchor.start_at,'UTC'),settings.recurrenceOriginalEndAt || utcToZonedMysqlWall(anchor.end_at,'UTC'),id]);
   }
   if(scope==='future') for(const row of planned) await db.execute(`UPDATE supervision_sessions SET meeting_settings_json=JSON_REMOVE(meeting_settings_json,'$.recurrenceOriginalStartAt','$.recurrenceOriginalEndAt') WHERE id=?`,[row.id]);
   for(const row of planned) await db.execute(`UPDATE supervision_sessions SET start_at=?,end_at=?,event_timezone=?,signup_closes_at=IF(enrollment_mode='signup_only',DATE_SUB(?,INTERVAL 1 HOUR),signup_closes_at),status=?,recurrence_horizon_held=?,recurrence_calendar_pending=1,recurrence_calendar_generation=recurrence_calendar_generation+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[row.window.startAt,row.window.endAt,timeZone,row.window.startAt,row.status,Number(row.recurrence_horizon_held || 0),row.id]);
   await db.commit();
   return {previous:rows,updated:planned.map(({window,people,...row})=>({...row,start_at:window.startAt,end_at:window.endAt,event_timezone:timeZone}))};
  }catch(error){await db.rollback();throw error;}
  finally{for(const key of locks.reverse())await db.execute('SELECT RELEASE_LOCK(?)',[key]).catch(()=>{});}
 });
}
