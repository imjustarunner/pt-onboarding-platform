import {interviewCalendarEventId} from '../utils/interviewCalendarLink.js';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import { hasActiveMeetingMembership,roomUnavailable } from './meetingJoinPolicy.service.js';
import Video from './vonageVideo.service.js';
import { resolveVideoProjectId } from './video.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const hash=token=>crypto.createHash('sha256').update(String(token||'')).digest('hex');
export async function calendarMeeting(type,ref,{host=false}={}){
 const calendarInterviewId=type==='team-meeting'?interviewCalendarEventId(ref):null;
 if(!['supervision','team-meeting'].includes(type)||(!host&&!calendarInterviewId&&!/^[\w-]{32}$/.test(String(ref||''))))throw fail(404,'Meeting not found.');
 const row=await (type==='supervision'?SupervisionSession:ProviderScheduleEvent).resolveByJoinRef(ref);
 if(!row||(!host&&calendarInterviewId!==Number(row.id)&&![row.join_token,row.participant_join_token].filter(Boolean).includes(ref)))throw fail(404,'Meeting not found.');
 if(type==='team-meeting'&&!['TEAM_MEETING','HUDDLE'].includes(row.kind))throw fail(404,'Meeting not found.');
 if(String(row.meeting_subtype||'').toLowerCase()==='interview'){const [interviews]=await pool.execute('SELECT status,guest_access_ended_at FROM hiring_interviews WHERE provider_schedule_event_id=?',[row.id]);if(!interviews[0]||interviews[0].guest_access_ended_at||['completed','cancelled'].includes(interviews[0].status))throw fail(410,'This interview has ended.');}
 const blocked=roomUnavailable(row,type==='supervision'?'supervision':'team');if(blocked)throw fail(blocked.status,blocked.error.message);
 const [org]=await pool.execute('SELECT id FROM agencies WHERE id=? AND is_active=1',[row.agency_id]);if(!org.length)throw fail(404,'Meeting unavailable.');
 return row;
}
export async function assertCalendarHost(type,row,userId){
 if(!await hasActiveMeetingMembership(row.agency_id,userId))throw fail(403,'Host access required.');
 if(type==='supervision'&&[row.supervisor_user_id,row.co_facilitator_user_id].some(x=>Number(x)===Number(userId)))return;
 if(type==='team-meeting'){
  if(Number(row.provider_id)===Number(userId))return;
  const [rows]=await pool.execute('SELECT 1 FROM meeting_participant_preferences WHERE event_id=? AND user_id=? AND is_cohost=1',[row.id,userId]);if(rows.length)return;
 }
 throw fail(403,'Host access required.');
}
export async function createCalendarGuest(type,ref,name){
 const row=await calendarMeeting(type,ref);
 if(String(row.meeting_subtype||'').toLowerCase()==='interview'&&!interviewCalendarEventId(ref))throw fail(403,'Use your personal interview invitation.');
 name=String(name||'').trim().slice(0,120);if(!name)throw fail(400,'Enter a display name.');
 const credential=crypto.randomBytes(32).toString('base64url');
 const [result]=await pool.execute(`INSERT INTO meeting_calendar_guests (meeting_type,meeting_id,credential_hash,display_name,expires_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 12 HOUR))`,[type,row.id,hash(credential),name]);
 return {id:result.insertId,credential,status:'waiting'};
}
export async function calendarGuestStatus(type,ref,id,credential,{leave=false,video=false}={}){
 const row=await calendarMeeting(type,ref);
 if(!/^[\w-]{43}$/.test(String(credential||'')))throw fail(403,'Request admission again.');
 const [rows]=await pool.execute(`SELECT * FROM meeting_calendar_guests WHERE id=? AND meeting_type=? AND meeting_id=? AND credential_hash=? AND expires_at>UTC_TIMESTAMP()`,[id,type,row.id,hash(credential)]);
 const guest=rows[0];if(!guest)throw fail(403,'Request admission again.');
 // Ordinary meeting rooms retain their open-room behavior. Private offices use a separate service and never take this path.
 if(!leave&&guest.status==='waiting'&&row.twilio_room_sid&&[0,false,'0','false'].includes(row.waiting_room_enabled)){
  await pool.execute("UPDATE meeting_calendar_guests SET status='admitted' WHERE id=? AND status='waiting'",[id]);
  guest.status='admitted';
  if(type==='supervision')await pool.execute("UPDATE meeting_transcription_controls SET paused=1,revision=revision+1 WHERE meeting_type='supervision' AND meeting_id=?",[row.id]);
 }

 await pool.execute(`UPDATE meeting_calendar_guests SET last_seen_at=UTC_TIMESTAMP(),status=? WHERE id=?`,[leave?'left':guest.status,id]);
 if(leave)return {status:'left'};
 if(!video)return {status:guest.status};
 if(guest.status!=='admitted')throw fail(403,'Wait for the host to admit you.');
 if(!row.twilio_room_sid)throw fail(409,'The host is opening the meeting.');
 if(!Video.isVideoConfigured())throw fail(503,'Video unavailable.');
 return {sessionId:row.twilio_room_sid,applicationId:resolveVideoProjectId(),localName:`${guest.display_name} (Guest)`,token:Video.generateToken(row.twilio_room_sid,{expireTime:Math.floor(Date.now()/1000)+60,data:JSON.stringify({identity:`calendar-guest-${id}`,displayName:`${guest.display_name} (Guest)`,role:'participant',roleLabel:'Guest'})})};
}
export async function listCalendarGuests(type,ref,userId){
 const row=await calendarMeeting(type,ref,{host:true});await assertCalendarHost(type,row,userId);
 const [rows]=await pool.execute(`SELECT id,display_name displayName FROM meeting_calendar_guests WHERE meeting_type=? AND meeting_id=? AND status='waiting' AND expires_at>UTC_TIMESTAMP() AND last_seen_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND) ORDER BY created_at`,[type,row.id]);return {guests:rows};
}
export async function admitCalendarGuest(type,ref,userId,id){
 const row=await calendarMeeting(type,ref,{host:true});await assertCalendarHost(type,row,userId);
 if(!row.twilio_room_sid)throw fail(409,'Open the meeting video before admitting guests.');
 const [result]=await pool.execute(`UPDATE meeting_calendar_guests SET status='admitted' WHERE id=? AND meeting_type=? AND meeting_id=? AND status='waiting' AND expires_at>UTC_TIMESTAMP()`,[id,type,row.id]);
 if(!result.affectedRows)throw fail(409,'Guest is no longer waiting.');
 if(type==='supervision')await pool.execute("UPDATE meeting_transcription_controls SET paused=1,revision=revision+1 WHERE meeting_type='supervision' AND meeting_id=?",[row.id]);
 return {ok:true};
}
