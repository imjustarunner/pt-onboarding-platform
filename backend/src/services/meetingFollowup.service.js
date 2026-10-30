import { processSupervisionMissedNotices } from './supervisionScheduleActions.service.js';
import { processMeetingRecordNotices } from './meetingRecordNotifications.service.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { meetingAttendanceReceipt } from './meetingAttendanceReceipt.service.js';
import { supervisionDisplayTitle } from '../utils/supervisionDisplayTitle.js';
import Notification from '../models/Notification.model.js';
import pool from '../config/database.js';
import { meetingParticipantNames, requireAttendedMeeting } from './myMeetings.service.js';
import TeamArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import SupervisionArtifact from '../models/SupervisionSessionArtifact.model.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { ensureTenantMessageMailboxes } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { meetingFollowupContent } from './meetingFollowupContent.service.js';

const sources = {
  team: { table: 'provider_schedule_events', rollup: 'agency_meeting_attendance_rollups', presence: 'provider_schedule_event_join_presence', key: 'event_id' },
  supervision: { table: 'supervision_sessions', rollup: 'supervision_session_attendance_rollups', presence: 'supervision_session_join_presence', key: 'session_id' }
};
export async function deliverMeetingFollowup(type, id, { deliveryKey='initial', actorUserId=null, bcc=null, backfill=false, report=null, maxRecipients=Infinity, recordNotice=null } = {}) {
  if (!/^[a-z0-9-]{1,80}$/.test(deliveryKey)) throw new Error('Invalid delivery key');
  if ((bcc || backfill || deliveryKey !== 'initial') && !actorUserId) throw new Error('A named sender is required for a requested follow-up batch');
  const source = sources[type];
  if (!source) throw new Error('Invalid meeting type');
  const [[meeting]] = await pool.execute(`SELECT * FROM ${source.table} WHERE id=?`, [id]);
  if (!meeting) return true;
  if (!(meeting.meeting_completed_at || meeting.live_ended_at || meeting.status === 'FINALIZED')) return false;
  if (meeting.status === 'CANCELLED' || (!recordNotice && Number(meeting.notify_participants ?? 1) === 0) || meeting.meeting_subtype === 'interview') return true;
  const artifact = type === 'team' ? await TeamArtifact.findByEventId(id) : await SupervisionArtifact.findBySessionId(id);
  if (!recordNotice && !artifact?.summary_text && artifact?.transcript_text?.trim()) return false;
  const summary = artifact?.summary_text || 'No transcript was captured for this meeting, so an automated summary is unavailable. Your attendance is recorded below; shared notes and documents may be added to the meeting record.';
  const [people] = await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.email,u.work_email FROM users u
    WHERE EXISTS (SELECT 1 FROM ${source.rollup} ar WHERE ar.${source.key}=? AND ar.user_id=u.id AND ar.total_seconds>0)
    OR EXISTS (SELECT 1 FROM ${source.presence} jp WHERE jp.${source.key}=? AND jp.join_identity=CONCAT('user-',u.id))`, [id,id]);
  if(recordNotice) {
    const missing=recordNotice.userIds.filter(uid=>!people.some(p=>Number(p.id)===Number(uid)));
    if(missing.length) {const [extra]=await pool.execute(`SELECT id,first_name,last_name,email,work_email FROM users WHERE id IN (${missing.map(()=>'?').join(',')})`,missing);people.push(...extra);}
  }
  const [[supervisee]] = type === 'supervision' && meeting.supervisee_user_id ? await pool.execute("SELECT COALESCE(NULLIF(preferred_name,''),first_name) first_name FROM users WHERE id=?",[meeting.supervisee_user_id]) : [[]];
  const title=meeting.title || supervisionDisplayTitle(meeting,supervisee?.first_name);
  const attendeeNames = type === 'team' && meeting.meeting_subtype === 'supervisors_meeting'
    ? await meetingParticipantNames(type, id)
    : [];
  const base = await tenantMeetingBase(meeting.agency_id);
  const url = `${base}/my-meetings?type=${type}&meetingId=${id}&tab=Summary`;
  const mailboxes = await ensureTenantMessageMailboxes(meeting.agency_id);

  let sentCount=0;
  for (const user of people) {
    if(recordNotice && !recordNotice.userIds.map(Number).includes(Number(user.id)))continue;
    // Match the authenticated library's attendance, admission and current membership rules.
    try { await requireAttendedMeeting(type,id,user.id); }
    catch (error) {
      const host=recordNotice && [meeting.supervisor_user_id,meeting.co_facilitator_user_id,meeting.provider_id].map(Number).includes(Number(user.id));
      if(error.status!==403)throw error;
      if(!host || !await hasActiveMeetingMembership(meeting.agency_id,user.id))continue;
    }
    const recipient = await resolveMeetingRecipient({ agencyId:meeting.agency_id,user });
    if (!recipient.email) continue;
    const receipt = await meetingAttendanceReceipt(type,id,user.id,meeting);
    const content = meetingFollowupContent({ title, summary, generatedAt:artifact?.summary_generated_at, url, receipt, attendeeNames, backfill, recordNotice, training:meeting.meeting_subtype === 'training' });
    const key = [type,id,user.id,deliveryKey];
    if (sentCount>=maxRecipients) return false;
    const [claim] = await pool.execute(`INSERT IGNORE INTO meeting_followup_deliveries (meeting_type,meeting_id,user_id,delivery_key,delivery_status) VALUES (?,?,?,?,'sending')`, key);
    if (!claim.affectedRows) { report?.push({userId:user.id,status:'already_recorded'}); continue; }
    // A unique recipient claim prevents duplicates on reruns or concurrent workers.
    // Ambiguous delivery errors stay in review, rather than risking duplicate email.
    try {
      if (receipt.minutes != null) {
        const note=await Notification.create({type:'meeting_attendance_recorded',severity:'info',title:'Meeting attendance recorded',message:`${meeting.title || 'Supervision'}: ${receipt.minutes} minutes recorded. ${receipt.compensation || (receipt.balance ? `${receipt.balance.earned} supervision hours credited.` : 'Your meeting record is available.')}`,userId:user.id,agencyId:meeting.agency_id,relatedEntityType:type==='team'?'provider_schedule_events':'supervision_sessions',relatedEntityId:id});
        await pool.execute('UPDATE meeting_followup_deliveries SET notification_id=? WHERE meeting_type=? AND meeting_id=? AND user_id=? AND delivery_key=?',[note?.id || null,...key]);
      }
      const result = await sendEmailFromIdentity({ ...content,senderIdentityId:mailboxes.notifications.id,to:recipient.email,
        agencyId:meeting.agency_id,userId:user.id,source:'auto',templateType:'meeting_summary_ready',linkUrl:url,generatedByUserId:actorUserId,bcc,replyToOverride:mailboxes.noreply?.from_email || `noreply@${mailboxes.domain}` });
      const status = result?.pendingApproval ? 'approval' : result?.id && !result.redirected && !result.skipped && !result.blocked ? 'sent' : 'held';
      sentCount++;
      report?.push({userId:user.id,status,communicationId:result?.communicationId || null});
      await pool.execute('UPDATE meeting_followup_deliveries SET delivery_status=?,communication_id=? WHERE meeting_type=? AND meeting_id=? AND user_id=? AND delivery_key=?', [status,result?.communicationId || null,...key]);
    } catch (error) {
      report?.push({userId:user.id,status:'review',code:error.code || 'delivery_error'});
      await pool.execute("UPDATE meeting_followup_deliveries SET delivery_status='review' WHERE meeting_type=? AND meeting_id=? AND user_id=? AND delivery_key=?", key);
      console.warn('[meetingFollowup] delivery requires review',type,id,user.id);
    }
  }
  return true;
}
let running = false;
export async function processMeetingFollowups() {
  if (running) return;
  running = true;
  try {
    const { completeEmptyPastMeetings } = await import('./meetingAutoCompletion.service.js');
    await completeEmptyPastMeetings();
    await processMeetingRecordNotices(deliverMeetingFollowup);
    await processSupervisionMissedNotices();
    // Ignore summaries generated while a meeting is still running, so they cannot
    // occupy the first page forever and starve completed meetings.
    const [jobs] = await pool.execute(`SELECT j.meeting_type,j.meeting_id FROM meeting_summary_jobs j
      LEFT JOIN provider_schedule_events t ON j.meeting_type='team' AND t.id=j.meeting_id
      LEFT JOIN supervision_sessions s ON j.meeting_type='supervision' AND s.id=j.meeting_id
      WHERE j.status='ready' AND j.followup_checked_at IS NULL
      AND (t.meeting_completed_at IS NOT NULL OR s.live_ended_at IS NOT NULL OR s.status='FINALIZED')
      ORDER BY j.updated_at LIMIT 50`);
    // Meetings without a captured transcript still need attendance receipts.
    const [withoutJobs] = await pool.execute(`SELECT 'team' meeting_type,e.id meeting_id FROM provider_schedule_events e
      WHERE e.meeting_completed_at>UTC_TIMESTAMP()-INTERVAL 2 DAY AND e.status='ACTIVE'
      AND e.kind IN ('TEAM_MEETING','HUDDLE') AND COALESCE(e.meeting_subtype,'')<>'interview'
      AND NOT EXISTS(SELECT 1 FROM meeting_summary_jobs j WHERE j.meeting_type='team' AND j.meeting_id=e.id)
      UNION ALL SELECT 'supervision',s.id FROM supervision_sessions s
      WHERE s.status='FINALIZED' AND s.end_at>UTC_TIMESTAMP()-INTERVAL 2 DAY
      AND NOT EXISTS(SELECT 1 FROM meeting_summary_jobs j WHERE j.meeting_type='supervision' AND j.meeting_id=s.id) LIMIT 50`);
    for (const job of [...jobs,...withoutJobs]) {
      try {
        if (await deliverMeetingFollowup(job.meeting_type,job.meeting_id)) await pool.execute('UPDATE meeting_summary_jobs SET followup_checked_at=UTC_TIMESTAMP() WHERE meeting_type=? AND meeting_id=?', [job.meeting_type,job.meeting_id]);
      } catch { console.warn('[meetingFollowup] pending delivery will retry',job.meeting_type,job.meeting_id); }
    }
  } finally { running = false; }
}
