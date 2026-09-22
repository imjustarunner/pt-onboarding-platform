import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { meetingReplyTo, meetingParticipantRows, meetingEmailDetails } from './meetingParticipants.service.js';
import pool from '../config/database.js';
import { meetingReminderSchedule } from './meetingReminderPolicy.js';
import { meetingInvitationContent } from './meetingInvitationPolicy.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { sendHiringInterviewReminder } from './hiringInterviewReminder.service.js';
export async function sendConfiguredMeetingReminders(now=new Date()) {
  const [events]=await pool.execute(`SELECT * FROM provider_schedule_events WHERE kind IN ('TEAM_MEETING','HUDDLE') AND status='ACTIVE'
    AND meeting_completed_at IS NULL AND notify_participants=1 AND (meeting_settings_json IS NOT NULL OR meeting_subtype='interview')
    AND start_at>UTC_TIMESTAMP() AND start_at<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 DAY)`);
  for(const event of events)for(const reminder of meetingReminderSchedule(event)) {
    if(reminder.at>now || now-reminder.at>180000)continue;
    const [users]=await pool.execute(`SELECT DISTINCT u.id,u.email,u.work_email,u.first_name,u.last_name,hi.guest_join_token FROM users u LEFT JOIN hiring_interviews hi ON hi.candidate_user_id=u.id AND hi.provider_schedule_event_id=? WHERE u.id=? OR u.id IN (SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?) OR hi.id IS NOT NULL`,[event.id,event.provider_id,event.id]);
    const host=users.find(u=>Number(u.id)===Number(event.provider_id));
    for(const user of users) {
      if(!user.email || (!event.meeting_settings_json && !user.guest_join_token))continue;const db=await pool.getConnection();const lock=`meeting-reminder:${event.id}:${user.id}:${reminder.key}`;let acquired=false;
      try {
        const [locks]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);acquired=!!locks[0]?.acquired;if(!acquired)continue;
        const params=[event.id,user.id,reminder.key,event.start_at];const [sent]=await db.execute('SELECT 1 FROM meeting_reminder_deliveries WHERE event_id=? AND user_id=? AND reminder_key=? AND start_at=?',params);if(sent.length)continue;
        const invite=user.guest_join_token ? {url:`${await tenantMeetingBase(event.agency_id)}/join/team-meeting/${user.guest_join_token}`} : await personalMeetingInvitation(event,user.id);const content=meetingInvitationContent({events:[event],joinUrl:invite.url,guest:!!user.guest_join_token,hostName:[host?.first_name,host?.last_name].filter(Boolean).join(' '),participants:await meetingParticipantRows(event),details:await meetingEmailDetails(event)});
        const recipientIdentity=await resolveMeetingRecipient({agencyId:event.agency_id,user,guest:!!user.guest_join_token});
        const result=user.guest_join_token
          ? await sendHiringInterviewReminder(event,user)
          : event.kind==='HUDDLE' ? await (await import('./supervisionEmail.service.js')).sendSupervisionEmail({session:event,user,joinUrl:invite.url,kind:`reminder:${reminder.key}`})
          : await sendNotificationEmail({agencyId:event.agency_id,triggerKey:'meeting_join_reminder',to:recipientIdentity.email,replyToOverride:await meetingReplyTo(event),...content,subject:`Meeting reminder: ${event.title}`,userId:user.id,templateType:'meeting_join_reminder',source:'auto'});
        if(!result?.skipped)await db.execute('INSERT IGNORE INTO meeting_reminder_deliveries (event_id,user_id,reminder_key,start_at,delivery_status,communication_id) VALUES (?,?,?,?,?,?)',[...params,result?.pendingApproval?'pending_approval':'sent',result?.communicationId || null]);
      } catch(error){console.warn('[Meeting reminder]',event.id,user.id,error.code||error.message);} finally{if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
    }
  }
}
