import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { meetingReplyTo } from './meetingParticipants.service.js';
import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { escapeMeetingHtml } from './meetingInvitationPolicy.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
const calendarDate = raw => raw instanceof Date ? raw.toISOString().slice(0,10) : String(raw || '').slice(0,10);
function meetingEnded(event) {
  if(event.meeting_completed_at)return true;
  if(Number(event.all_day)===1) {
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:event.event_timezone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return calendarDate(event.end_date || event.start_date)<today;
  }
  return !event.end_at || parseUtcDate(event.end_at)<=new Date();
}
export function meetingChangeSnapshot(event, attendeeIds) {
  const instant = raw => parseUtcDate(raw)?.toISOString() || null;
  return { title:event.title || '',start:instant(event.start_at),end:instant(event.end_at),
    startDate:Number(event.all_day)===1 ? calendarDate(event.start_date) : null,
    endDate:Number(event.all_day)===1 ? calendarDate(event.end_date) : null,
    location:event.location_text || '',hostId:Number(event.provider_id),
    attendees:[...new Set(attendeeIds.map(Number))].sort((a,b)=>a-b) };
}
export const hasMeetingChange = (before,after) => !isDeepStrictEqual(before,after);
export function meetingChangeDeliveryHash(event,before,after) {
  const delta=(a,b)=>a&&b?new Date(b).getTime()-new Date(a).getTime():null;
  const shape=event.recurrence_series_id ? {
    series:event.recurrence_series_id,title:[before.title,after.title],location:[before.location,after.location],host:[before.hostId,after.hostId],
    attendees:[before.attendees,after.attendees],startShift:delta(before.start,after.start),endShift:delta(before.end,after.end),
    startDateShift:delta(before.startDate,after.startDate),endDateShift:delta(before.endDate,after.endDate)
  } : after;
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}
export async function captureMeetingChange(event) {
  const [rows]=await pool.execute('SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=? UNION SELECT candidate_user_id AS user_id FROM hiring_interviews WHERE provider_schedule_event_id=?',[event.id,event.id]);
  return meetingChangeSnapshot(event,rows.map(r=>r.user_id));
}
export async function queueMeetingChange(event,before,notify,batchKey=randomUUID()) {
  const after=await captureMeetingChange(event);
  if (!notify || meetingEnded(event)) {
    await pool.execute('DELETE FROM meeting_schedule_change_queue WHERE event_id=?',[event.id]);return;
  }
  if (!hasMeetingChange(before,after)) return;
  await pool.execute(`INSERT INTO meeting_schedule_change_queue (event_id,batch_key,baseline_json,current_json,ready_at)
    VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))
    ON DUPLICATE KEY UPDATE current_json=VALUES(current_json),ready_at=VALUES(ready_at),notify_enabled=1`,[event.id,batchKey,JSON.stringify(before),JSON.stringify(after)]);
}
export async function sendDueMeetingChanges() {
  const [rows]=await pool.execute('SELECT event_id,batch_key FROM meeting_schedule_change_queue WHERE ready_at<=UTC_TIMESTAMP() LIMIT 100');
  for (const row of rows) {
    const db=await pool.getConnection(); const lock=`meeting-change:${row.batch_key}`;let acquired=false;
    try {
      const [locks]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);acquired=!!locks[0]?.acquired;if(!acquired)continue;
      const [queued]=await db.execute('SELECT * FROM meeting_schedule_change_queue WHERE event_id=? AND ready_at<=UTC_TIMESTAMP()',[row.event_id]);if(!queued.length)continue;
      const q=queued[0];const decode=v=>typeof v==='string'?JSON.parse(v):v;const before=decode(q.baseline_json);
      const [events]=await db.execute('SELECT * FROM provider_schedule_events WHERE id=?',[row.event_id]);const event=events[0];
      if(!event || event.status!=='ACTIVE' || meetingEnded(event)){await db.execute('DELETE FROM meeting_schedule_change_queue WHERE event_id=? AND ready_at=?',[row.event_id,q.ready_at]);continue;}
      const after=await captureMeetingChange(event);
      // An edit may have committed while this worker was obtaining the queue row.
      if(hasMeetingChange(decode(q.current_json),after)) continue;
      const snapshotHash=meetingChangeDeliveryHash(event,before,after);
      if(hasMeetingChange(before,after)) {
        const ids=[...new Set([before.hostId,after.hostId,...before.attendees,...after.attendees])];
        const [users]=await db.query('SELECT u.id,u.email,u.first_name,u.last_name,hi.guest_join_token FROM users u LEFT JOIN hiring_interviews hi ON hi.candidate_user_id=u.id AND hi.provider_schedule_event_id=? WHERE u.id IN (?)',[event.id,ids]);
        const name=id=>{const u=users.find(u=>Number(u.id)===id);return u?[u.first_name,u.last_name].filter(Boolean).join(' '):`Participant ${id}`;};
        const format=raw=>raw?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:event.event_timezone||'America/Denver'}).format(new Date(raw)):'All day';
        const changes=[];
        if(before.location!==after.location)changes.push(`Location: ${before.location || 'Online'} → ${after.location || 'Online'}`);
        if(before.hostId!==after.hostId)changes.push(`Host: ${name(before.hostId)} → ${name(after.hostId)}`);
        if(before.title!==after.title)changes.push(`Title: ${before.title} → ${after.title}`);
        if(before.start!==after.start || before.end!==after.end)changes.push(`Time: ${format(before.start)} – ${format(before.end)} → ${format(after.start)} – ${format(after.end)}`);
        if(before.startDate!==after.startDate || before.endDate!==after.endDate)changes.push(`Dates: ${before.startDate} – ${before.endDate} → ${after.startDate} – ${after.endDate}`);
        const added=after.attendees.filter(id=>!before.attendees.includes(id)),removed=before.attendees.filter(id=>!after.attendees.includes(id));
        if(added.length)changes.push(`Added: ${added.map(name).join(', ')}`);if(removed.length)changes.push(`Removed: ${removed.map(name).join(', ')}`);
        const host=users.find(u=>Number(u.id)===after.hostId);
        for(const user of users) {
          if(!user.email)continue;
          const [currentQueue]=await db.execute('SELECT current_json,ready_at FROM meeting_schedule_change_queue WHERE event_id=? AND ready_at<=UTC_TIMESTAMP()',[row.event_id]);
          if(!currentQueue[0] || hasMeetingChange(decode(currentQueue[0].current_json),after))break;
          const deliveryParams=[q.batch_key,snapshotHash,user.id];
          const [delivered]=await db.execute('SELECT 1 FROM meeting_change_deliveries WHERE batch_key=? AND snapshot_hash=? AND user_id=?',deliveryParams);
          if(delivered.length)continue;
          const stillInvited=Number(user.id)===after.hostId||after.attendees.includes(Number(user.id));
          const url=stillInvited?(user.guest_join_token ? `${await tenantMeetingBase(event.agency_id)}/join/team-meeting/${user.guest_join_token}` : (await personalMeetingInvitation(event,user.id)).url):null;
          const text=`${event.title} was updated.${event.recurrence_series_id ? ' This update applies to the affected dates in your recurring series; review your schedule for each date.' : ''}\n\n${changes.join('\n')}\n\n${url?`Your meeting: ${url}`:'You have been removed from this meeting.'}`;
          const result=await sendNotificationEmail({agencyId:event.agency_id,triggerKey:'meeting_rescheduled',to:user.email,replyToOverride:await meetingReplyTo(event),subject:`Meeting updated: ${event.title}`,text,html:`<p>${escapeMeetingHtml(text).replace(/\n/g,'<br>')}</p>`,userId:user.id,templateType:'meeting_rescheduled',source:'auto'});
          if(result?.skipped)throw new Error('Meeting change email held by delivery settings');
          await db.execute('INSERT IGNORE INTO meeting_change_deliveries (batch_key,snapshot_hash,user_id) VALUES (?,?,?)',deliveryParams);
        }
      }
      await db.execute('DELETE FROM meeting_schedule_change_queue WHERE event_id=? AND ready_at=?',[row.event_id,q.ready_at]);
    } catch(error){console.warn('[Meeting changes]',row.event_id,error.code||error.message);await db.execute('UPDATE meeting_schedule_change_queue SET ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) WHERE event_id=? AND ready_at<=UTC_TIMESTAMP()',[row.event_id]);}
    finally{if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
  }
}
