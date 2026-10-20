import pool from '../config/database.js';
import { withRecurringScheduleEdit } from './recurringScheduleCancellation.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { sendMeetingScheduleChange } from './meetingInvitations.service.js';

const fail = (message,status=409) => Object.assign(new Error(message),{status});
export const CANCELLATION_ATTRIBUTIONS = ['supervisor','supervisee','organization','other'];

export async function recordSupervisionScheduleAction(db,{sessionId,actorUserId,kind,reason,attribution=null,details=null,dedupeKey=null,pending=false}) {
  await db.execute(`INSERT IGNORE INTO supervision_schedule_actions
    (session_id,actor_user_id,action_kind,reason,attribution,details_json,dedupe_key,delivery_state)
    VALUES (?,?,?,?,?,?,?,?)`,[sessionId,actorUserId,kind,String(reason).trim().slice(0,500),attribution,details?JSON.stringify(details):null,dedupeKey,pending?'pending':'none']);
}

// This changes a single calendar occurrence only. Retain all attendance, credit,
// recurrence and notification history; completed attendance uses the correction flow.
export async function applySupervisionOutcome({sessionId,actorUserId,action,reason,now=new Date()}) {
  if (!['missed','deleted'].includes(action)) throw fail('Invalid supervision action.',400);
  if (!String(reason || '').trim()) throw fail('Enter a reason before saving.',400);
  return withRecurringScheduleEdit(async db => {
    await db.beginTransaction();
    try {
      const [[row]]=await db.execute('SELECT * FROM supervision_sessions WHERE id=? FOR UPDATE',[sessionId]);
      if (!row) throw fail('Session not found.',404);
      if (Number(row.supervisor_user_id)!==Number(actorUserId)) throw fail('Only the assigned supervisor can record this action.',403);
      const [[membership]]=await db.execute('SELECT 1 AS active FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[actorUserId,row.agency_id]);
      if (!membership) throw fail('Active agency access is required.',403);
      const status=String(row.status || 'SCHEDULED').toUpperCase();
      if (row.calendar_deleted_at) { await db.commit(); return {ok:true,alreadyRecorded:true}; }
      if (action==='deleted') {
        if (!['CANCELLED','MISSED'].includes(status)) throw fail('Cancel the session or record it as missed before deleting it from the calendar.');
        await db.execute('UPDATE supervision_sessions SET calendar_deleted_at=UTC_TIMESTAMP(),updated_at=CURRENT_TIMESTAMP WHERE id=?',[sessionId]);
      } else {
        if (!['SCHEDULED','MISSED'].includes(status) || (row.finalized_at && status!=='MISSED')) throw fail('Recorded attendance must be reviewed in Attendance & time. It cannot be replaced with Missed.');
        const end=parseUtcDate(row.end_at);
        if (!end || +end>+now) throw fail('A session can only be marked missed after its scheduled end.');
        const [[existing]]=await db.execute("SELECT id FROM supervision_schedule_actions WHERE dedupe_key=?",[`missed-${sessionId}`]);
        if (existing) {await db.commit(); return {ok:true,alreadyRecorded:true};}
        const [[attendance]]=await db.execute(`SELECT
          EXISTS(SELECT 1 FROM supervision_session_attendance_rollups WHERE session_id=? AND user_id NOT IN (?,?) AND total_seconds>0) AS attended,
          EXISTS(SELECT 1 FROM supervision_session_hour_credits WHERE session_id=? AND (individual_hours>0 OR group_hours>0)) AS credited,
          EXISTS(SELECT 1 FROM supervision_session_join_presence WHERE session_id=? AND left_at IS NULL AND last_seen_at>UTC_TIMESTAMP()-INTERVAL 2 MINUTE) AS live`,
          [sessionId,row.supervisor_user_id,row.co_facilitator_user_id || row.supervisor_user_id,sessionId,sessionId]);
        if (Number(attendance?.attended) || Number(attendance?.credited) || Number(attendance?.live)) throw fail('This session has attendance, credited hours, or an active participant. Review Attendance & time before changing its outcome.');
        await db.execute("UPDATE supervision_sessions SET status='MISSED',recurrence_calendar_pending=1,recurrence_calendar_generation=recurrence_calendar_generation+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",[sessionId]);
      }
      await recordSupervisionScheduleAction(db,{sessionId,actorUserId,kind:action,reason,details:{previousStatus:status,startAt:row.start_at,endAt:row.end_at},dedupeKey:`${action}-${sessionId}`,pending:action==='missed'});
      await db.commit();
      return {ok:true,notificationQueued:action==='missed'};
    } catch(error) {await db.rollback();throw error;}
  });
}

export async function processSupervisionMissedNotices() {
  const [jobs]=await pool.execute("SELECT * FROM supervision_schedule_actions WHERE action_kind='missed' AND delivery_state='pending' ORDER BY id LIMIT 50");
  for (const job of jobs) {
    try {
      const [[session]]=await pool.execute('SELECT * FROM supervision_sessions WHERE id=?',[job.session_id]);
      if (!session || session.status!=='MISSED') {
        await pool.execute("UPDATE supervision_schedule_actions SET delivery_state='superseded' WHERE id=?",[job.id]);
        continue;
      }
      const [attendees]=await pool.execute("SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND is_required=1 AND participant_role='supervisee' AND status NOT IN ('DECLINED','REMOVED','WITHDRAWN','CANCELLED')",[session.id]);
      const userIds=[session.supervisor_user_id,session.co_facilitator_user_id,...(session.session_type==='individual'?[session.supervisee_user_id]:[]),...attendees.map(a=>a.user_id)].map(Number).filter(Boolean);
      const delivery=await sendMeetingScheduleChange([session],'missed',{changeReason:job.reason,recipientUserIds:userIds,actorUserId:job.actor_user_id});
      // Per-recipient claims hold ambiguous transport failures for review, not blind resend.
      await pool.execute('UPDATE supervision_schedule_actions SET delivery_state=? WHERE id=?',[delivery.failed?'review':'processed',job.id]);
    } catch(error) {console.warn('[supervision missed] Pending notice will retry',job.id,error.code || 'error');}
  }
}
