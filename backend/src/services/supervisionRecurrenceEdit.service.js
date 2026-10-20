import { randomUUID } from 'node:crypto';
import { withRecurringScheduleEdit } from './recurringScheduleCancellation.service.js';
import { appendOccurrence } from './recurringScheduleWindow.service.js';
import { withMeetingWindow } from './meetingWindowConflict.service.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { assertNoReviewTimeOverlap } from './supervisionReviewTime.service.js';
import { generateOccurrenceDates, RECURRING_FREQUENCIES, indefiniteOccurrenceCount, addDaysYmd } from '../utils/scheduleRecurrence.js';
import { utcToZonedMysqlWall, parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';

const invalid = message => Object.assign(new Error(message), { status: 400 });

export function supervisionRecurrencePlan(row, { frequency, policy = 'INDEFINITE', occurrenceCount, now = new Date() }) {
  if (!RECURRING_FREQUENCIES.includes(frequency)) throw invalid('Choose a supported supervision recurrence.');
  if (!['FINITE','INDEFINITE'].includes(policy)) throw invalid('Choose an ongoing series or a number of occurrences.');
  const count = policy === 'INDEFINITE' ? indefiniteOccurrenceCount(frequency) : Number(occurrenceCount);
  if (!Number.isInteger(count) || count < 2 || count > 53) throw invalid('Choose between 2 and 53 occurrences.');
  const zone = row.event_timezone || 'America/Denver';
  const start = utcToZonedMysqlWall(row.start_at, zone);
  const end = utcToZonedMysqlWall(row.end_at, zone);
  if (!start || !end || +parseUtcDate(row.end_at) <= +parseUtcDate(row.start_at)) throw invalid('Invalid supervision time.');
  const days = Math.round((Date.parse(`${end.slice(0,10)}T00:00:00Z`)-Date.parse(`${start.slice(0,10)}T00:00:00Z`))/86400000);
  return generateOccurrenceDates({startDate:start.slice(0,10),recurrence:frequency,occurrenceCount:count,now})
    .map((day,index)=>({index,startAt:wallMysqlToUtcMysql(`${day} ${start.slice(11)}`,zone),endAt:wallMysqlToUtcMysql(`${addDaysYmd(day,days)} ${end.slice(11)}`,zone)}))
    // The anchor is retained, including its attendance/notes. Never invent missed past sessions.
    .filter(window=>window.index>0 && +parseUtcDate(window.startAt)>+now);
}

/** Turn a saved one-time session into a series atomically. The shared series lock
 * and participant locks also protect this from renewal and competing bookings. */
export async function makeSupervisionRecurring({ id, frequency, policy, occurrenceCount, startAt, endAt, timeZone, actorUserId, details = {}, now = new Date() }) {
  return withRecurringScheduleEdit(async locked => {
    const [[initial]] = await locked.execute('SELECT * FROM supervision_sessions WHERE id=?',[id]);
    if (!initial) throw invalid('Supervision session not found.');
    if (initial.recurrence_series_id) {
      if (initial.recurrence_frequency===frequency) return {createdIds:[],alreadyRecurring:true};
      throw invalid('To change the repeat interval, cancel this and future sessions, then schedule a new series. You can change the time of this or future sessions here.');
    }
    if (initial.status==='CANCELLED') throw invalid('Cannot repeat a cancelled session.');
    const historical = !!initial.finalized_at || +parseUtcDate(initial.end_at)<=+now;
    if (historical && ((startAt && +parseUtcDate(startAt)!==+parseUtcDate(initial.start_at)) || (endAt && +parseUtcDate(endAt)!==+parseUtcDate(initial.end_at)))) {
      throw invalid('Keep the completed session’s time unchanged when making it recurring. Use Attendance & time for a past time correction.');
    }
    const allowedDetails = Object.fromEntries(Object.entries(details).filter(([key,value]) => value !== undefined && ['session_type','notes','modality','location_text','waiting_room_enabled','notify_participants','reminder_minutes','meeting_settings_json'].includes(key)));
    const template={...initial,...allowedDetails,start_at:startAt || initial.start_at,end_at:endAt || initial.end_at,event_timezone:timeZone || initial.event_timezone,recurrence_series_id:randomUUID(),recurrence_frequency:frequency,recurrence_policy:policy || 'INDEFINITE',created_by_user_id:actorUserId};
    const windows=supervisionRecurrencePlan(template,{frequency,policy:template.recurrence_policy,occurrenceCount,now});
    if (!windows.length) throw invalid('This repeat selection has no future dates. Choose more occurrences or a future starting date.');
    const [required]=await locked.execute("SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND is_required=1 AND status NOT IN ('REMOVED','CANCELLED','WITHDRAWN')",[id]);
    const userIds=[...new Set([initial.supervisor_user_id,initial.co_facilitator_user_id,...(initial.session_type==='group'?[]:[initial.supervisee_user_id]),...required.map(r=>r.user_id)].map(Number).filter(Boolean))];
    // Lock using the first future window; historical anchors need no conflict validation.
    return withMeetingWindow({userIds,...windows[0],timeZone:template.event_timezone,excludeSupervisionId:id},async db=>{
      await db.beginTransaction();
      try {
        const [[fresh]]=await db.execute('SELECT * FROM supervision_sessions WHERE id=? FOR UPDATE',[id]);
        if (fresh.recurrence_series_id || fresh.status==='CANCELLED') throw Object.assign(new Error('This session changed. Refresh before saving.'),{status:409});
        for (const window of [...(!historical?[{startAt:template.start_at,endAt:template.end_at}]:[]),...windows]) {
          for(const userId of userIds) await assertAppointmentWindowAvailable(db,{providerUserId:userId,startAt:window.startAt,endAt:window.endAt,sourceTimezone:template.event_timezone,supervisionSessionId:id});
          await assertNoReviewTimeOverlap(db,userIds,window.startAt,window.endAt);
        }
        await db.execute('UPDATE supervision_sessions SET recurrence_series_id=?,recurrence_frequency=?,recurrence_policy=?,recurrence_index=0,start_at=?,end_at=?,event_timezone=?,recurrence_calendar_pending=1 WHERE id=?',
          [template.recurrence_series_id,frequency,template.recurrence_policy,template.start_at,template.end_at,template.event_timezone,id]);
        const createdIds=[];
        for(const window of windows) createdIds.push(await appendOccurrence(db,'supervision',template,window,window.index));
        await db.commit();
        return {createdIds,seriesId:template.recurrence_series_id};
      } catch(error){await db.rollback();throw error;}
    });
  });
}
