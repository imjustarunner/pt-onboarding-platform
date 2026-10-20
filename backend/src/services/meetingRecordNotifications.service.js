import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export async function queueMeetingRecordNotice(db,{type,id,kind,sourceId,actorUserId}) {
 await db.execute(`INSERT IGNORE INTO meeting_record_notification_jobs (meeting_type,meeting_id,notice_kind,source_id,actor_user_id) VALUES (?,?,?,?,?)`,[type,id,kind,sourceId,actorUserId]);
}
const json=value=>typeof value==='string'?JSON.parse(value):value || {};
export function correctionNoticeLines(correction,zone='America/Denver') {
 const before=json(correction.previous_record_json);
 const format=value=>{const d=parseUtcDate(value);return d?new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(d):'Not recorded';};
 return [
  `Attendance corrected for ${correction.person_name || 'participant'}.`,
  `Before: ${format(before.first_joined_at)} to ${format(before.last_left_at)}; ${Math.round(Number(before.total_seconds || 0)/60*100)/100} minutes.`,
  `After: ${format(correction.start_at)} to ${format(correction.end_at)}; ${Math.round(Number(correction.total_seconds)/60*100)/100} minutes.`,
  `Time zone: ${zone}.`, `Reason: ${correction.reason}`, `Meeting format: ${correction.modality}.`
 ];
}
export async function processMeetingRecordNotices(deliver) {
 const [jobs]=await pool.execute('SELECT * FROM meeting_record_notification_jobs WHERE completed_at IS NULL ORDER BY id LIMIT 50');
 for(const job of jobs) {
  try {
   let notice;
   if(job.notice_kind==='correction') {
    const [[c]]=await pool.execute(`SELECT c.*,CONCAT_WS(' ',COALESCE(NULLIF(u.preferred_name,''),u.first_name),u.last_name) person_name,s.supervisor_user_id,s.co_facilitator_user_id,s.event_timezone
      FROM supervision_time_corrections c JOIN supervision_sessions s ON s.id=c.session_id JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.session_id=?`,[job.source_id,job.meeting_id]);
    if(!c || c.status!=='approved' || c.sync_status!=='complete')continue;
    notice={heading:'Attendance time updated',lines:correctionNoticeLines(c,c.event_timezone || 'America/Denver'),userIds:[c.user_id,c.supervisor_user_id,c.co_facilitator_user_id].map(Number).filter(Boolean)};
   } else if(job.meeting_type==='supervision') {
    const [[entry]]=await pool.execute('SELECT * FROM supervision_manual_entries WHERE session_id=? AND approved_at IS NOT NULL',[job.meeting_id]);
    if(!entry)continue;
    notice={heading:'Manual supervision recorded',lines:[`Reason for manual entry: ${entry.reason}`,`Meeting format: ${entry.modality}.`],manual:true,userIds:[entry.supervisor_user_id,entry.supervisee_user_id]};
   } else {
    const [[entry]]=await pool.execute('SELECT * FROM manual_meeting_logs WHERE id=? AND event_id=?',[job.source_id,job.meeting_id]);
    if(!entry)continue;
    const [people]=await pool.execute('SELECT user_id FROM manual_meeting_log_attendees WHERE log_id=?',[entry.id]);
    notice={heading:'Manual meeting recorded',lines:[`Reason for manual entry: ${entry.reason}`,`Meeting format: ${entry.platform}.`],manual:true,userIds:people.map(p=>p.user_id)};
   }
   const done=await deliver(job.meeting_type,job.meeting_id,{deliveryKey:`record-${job.id}`,actorUserId:job.actor_user_id,recordNotice:notice});
   if(done)await pool.execute('UPDATE meeting_record_notification_jobs SET completed_at=UTC_TIMESTAMP() WHERE id=?',[job.id]);
  }catch(error){console.warn('[meetingRecordNotice] Pending notice will retry',job.id,error.code || 'error');}
 }
}
