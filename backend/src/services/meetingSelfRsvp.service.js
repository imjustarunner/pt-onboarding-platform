import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export async function saveMeetingSelfRsvp(event,userId,response,{database=pool,now=()=>new Date(),training=async(...args)=>(await import('./scheduledTrainingRsvp.service.js')).saveTrainingRsvp(...args)}={}) {
  const fail = (message,status=403)=>{throw Object.assign(new Error(message),{status});};
  if (!['accepted','declined'].includes(response)) fail('Choose attending or not attending.',400);
  if (!event || !['TEAM_MEETING','HUDDLE'].includes(event.kind) || event.status === 'CANCELLED' || event.meeting_completed_at || !parseUtcDate(event.start_at) || +parseUtcDate(event.start_at) <= +now()) fail('This meeting is no longer open for RSVP changes.',409);
  const [[linked]] = await database.execute('SELECT 1 AS linked FROM provider_schedule_event_attendees WHERE event_id=? AND user_id=?',[event.id,userId]);
  if (!linked && Number(event.provider_id) !== Number(userId)) fail('Only an invited participant can change their own RSVP.');
  if (event.meeting_subtype === 'training') return training(event,userId,response);
  await database.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at)
    VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=UTC_TIMESTAMP()`,[event.id,userId,response]);
  return {ok:true,response};
}
