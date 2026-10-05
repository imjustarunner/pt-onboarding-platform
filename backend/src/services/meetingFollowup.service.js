import pool from '../config/database.js';
import { requireAttendedMeeting } from './myMeetings.service.js';
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
export async function deliverMeetingFollowup(type, id) {
  const source = sources[type];
  if (!source) throw new Error('Invalid meeting type');
  const [[meeting]] = await pool.execute(`SELECT * FROM ${source.table} WHERE id=?`, [id]);
  if (!meeting) return true;
  if (!(meeting.meeting_completed_at || meeting.live_ended_at || meeting.status === 'FINALIZED')) return false;
  if (meeting.status === 'CANCELLED' || Number(meeting.notify_participants ?? 1) === 0 || meeting.meeting_subtype === 'interview') return true;
  const artifact = type === 'team' ? await TeamArtifact.findByEventId(id) : await SupervisionArtifact.findBySessionId(id);
  if (!artifact?.summary_text) return false;
  const [people] = await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.email,u.work_email FROM users u
    WHERE EXISTS (SELECT 1 FROM ${source.rollup} ar WHERE ar.${source.key}=? AND ar.user_id=u.id AND ar.total_seconds>0)
    OR EXISTS (SELECT 1 FROM ${source.presence} jp WHERE jp.${source.key}=? AND jp.join_identity=CONCAT('user-',u.id))`, [id,id]);
  const base = await tenantMeetingBase(meeting.agency_id);
  const url = `${base}/my-meetings?type=${type}&meetingId=${id}&tab=Summary`;
  const mailboxes = await ensureTenantMessageMailboxes(meeting.agency_id);
  const content = meetingFollowupContent({ title:meeting.title || 'Supervision', summary:artifact.summary_text, generatedAt:artifact.summary_generated_at, url });
  for (const user of people) {
    // Match the authenticated library's attendance, admission and current membership rules.
    try { await requireAttendedMeeting(type,id,user.id); }
    catch (error) { if (error.status === 403) continue; throw error; }
    const recipient = await resolveMeetingRecipient({ agencyId:meeting.agency_id,user });
    if (!recipient.email) continue;
    const key = [type,id,user.id];
    const [claim] = await pool.execute(`INSERT IGNORE INTO meeting_followup_deliveries (meeting_type,meeting_id,user_id,delivery_status) VALUES (?,?,?,'sending')`, key);
    if (!claim.affectedRows) continue;
    // A unique recipient claim prevents duplicates on reruns or concurrent workers.
    // Ambiguous delivery errors stay in review, rather than risking duplicate email.
    try {
      const result = await sendEmailFromIdentity({ ...content,senderIdentityId:mailboxes.notifications.id,to:recipient.email,
        agencyId:meeting.agency_id,userId:user.id,source:'auto',templateType:'meeting_summary_ready',linkUrl:url });
      const status = result?.pendingApproval ? 'approval' : result?.id && !result.redirected && !result.skipped && !result.blocked ? 'sent' : 'held';
      await pool.execute('UPDATE meeting_followup_deliveries SET delivery_status=?,communication_id=? WHERE meeting_type=? AND meeting_id=? AND user_id=?', [status,result?.communicationId || null,...key]);
    } catch (error) {
      await pool.execute("UPDATE meeting_followup_deliveries SET delivery_status='review' WHERE meeting_type=? AND meeting_id=? AND user_id=?", key);
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
    // Ignore summaries generated while a meeting is still running, so they cannot
    // occupy the first page forever and starve completed meetings.
    const [jobs] = await pool.execute(`SELECT j.meeting_type,j.meeting_id FROM meeting_summary_jobs j
      LEFT JOIN provider_schedule_events t ON j.meeting_type='team' AND t.id=j.meeting_id
      LEFT JOIN supervision_sessions s ON j.meeting_type='supervision' AND s.id=j.meeting_id
      WHERE j.status='ready' AND j.followup_checked_at IS NULL
      AND (t.meeting_completed_at IS NOT NULL OR s.live_ended_at IS NOT NULL OR s.status='FINALIZED')
      ORDER BY j.updated_at LIMIT 50`);
    for (const job of jobs) {
      try {
        if (await deliverMeetingFollowup(job.meeting_type,job.meeting_id)) await pool.execute('UPDATE meeting_summary_jobs SET followup_checked_at=UTC_TIMESTAMP() WHERE meeting_type=? AND meeting_id=?', [job.meeting_type,job.meeting_id]);
      } catch { console.warn('[meetingFollowup] pending delivery will retry',job.meeting_type,job.meeting_id); }
    }
  } finally { running = false; }
}
