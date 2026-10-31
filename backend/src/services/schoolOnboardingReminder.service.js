import crypto from 'node:crypto';
import pool from '../config/database.js';
import EmailService from './email.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { onboardingReminderDue, onboardingEmailStatus } from '../utils/schoolOnboardingReminder.js';

// Claim before sending. An uncertain attempt stays visible for review and is never automatically resent.
export async function deliverOnboardingEmail({ invite, kind = 'invite', deliveryKey = crypto.randomUUID(), send, database = pool }) {
  const [claim] = await database.execute(`INSERT IGNORE INTO school_onboarding_email_deliveries
    (invite_id,kind,delivery_key,recipient,delivery_status) VALUES (?,?,?,?,'sending')`,
  [invite.id,kind,deliveryKey,invite.contact_email]);
  if (!claim.affectedRows) return { sent:false, reason:'already_attempted' };
  let status = 'review', result;
  try {
    result = await send();
    status = onboardingEmailStatus(result);
    await database.execute(`UPDATE school_onboarding_email_deliveries SET delivery_status=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL) WHERE id=?`,
      [status,result?.communicationId || null,status,claim.insertId]);
    if (status === 'sent' && kind === 'invite') await database.execute('UPDATE school_onboarding_invites SET invite_email_sent_at=UTC_TIMESTAMP() WHERE id=?', [invite.id]);
    return { sent:status==='sent', status, reason:status==='sent'?null:result?.reason || status };
  } catch (error) {
    await database.execute("UPDATE school_onboarding_email_deliveries SET delivery_status='review' WHERE id=?", [claim.insertId]);
    throw error;
  }
}

export async function runSchoolOnboardingReminders({ now = new Date(), dryRun = false, database = pool } = {}) {
  if (!dryRun) {
    await database.execute(`UPDATE school_onboarding_email_deliveries d JOIN user_communications c ON c.id=d.communication_id
      SET d.delivery_status=CASE WHEN c.delivery_status='sent' THEN 'sent' WHEN c.delivery_status IN ('failed','blocked','skipped') THEN 'failed' ELSE d.delivery_status END,
      d.sent_at=IF(c.delivery_status='sent',c.sent_at,d.sent_at) WHERE d.delivery_status='queued'`);
    await database.execute(`UPDATE school_onboarding_invites i JOIN
      (SELECT invite_id,MAX(sent_at) sent_at FROM school_onboarding_email_deliveries WHERE kind='invite' AND delivery_status='sent' GROUP BY invite_id) d ON d.invite_id=i.id
      SET i.invite_email_sent_at=d.sent_at WHERE i.invite_email_sent_at IS NULL OR i.invite_email_sent_at<d.sent_at`);
  }
  const [invites] = await database.execute(`SELECT i.*,a.name agency_name,a.slug agency_slug FROM school_onboarding_invites i
    JOIN agencies a ON a.id=i.agency_id AND a.is_active=1
    JOIN agencies s ON s.id=i.school_organization_id AND s.is_active=1
    JOIN users u ON u.id=i.primary_user_id AND COALESCE(u.is_demo,0)=0
    WHERE i.status IN ('invited','in_progress','expired') AND i.submitted_at IS NULL
      AND i.invite_email_sent_at<=DATE_SUB(?,INTERVAL 10 DAY)
      AND NOT EXISTS (SELECT 1 FROM school_onboarding_email_deliveries d WHERE d.invite_id=i.id AND d.kind='reminder')
    ORDER BY i.invite_email_sent_at LIMIT 25`, [now]);
  const results = [];
  for (const invite of invites) {
    if (!onboardingReminderDue(invite,now)) continue;
    if (dryRun) { results.push({inviteId:invite.id,status:'due'}); continue; }
    try {
      // Recheck completion just before claiming the email, including simultaneous staff edits.
      const [[fresh]] = await database.execute('SELECT * FROM school_onboarding_invites WHERE id=?', [invite.id]);
      if (!fresh || !onboardingReminderDue(fresh,now)) continue;
      const result = await deliverOnboardingEmail({invite:fresh,kind:'reminder',deliveryKey:'reminder',database,send:async()=>{
        const {buildOnboardingLink} = await import('./schoolOnboarding.service.js');
        const subject=`Reminder: complete ${invite.school_name} school onboarding`;
        const text=`Hi ${invite.contact_first_name || 'there'},\n\nYour school portal setup for ${invite.school_name} is still incomplete. Please finish the remaining onboarding steps when you have a moment. Your saved progress is waiting here:\n\n${buildOnboardingLink(fresh.token)}\n\nIf you need help, reply to this email and our team will help you finish.\n\nThank you,\n${invite.agency_name || 'The school support team'}`;
        const identity = await resolvePreferredSenderIdentityForAgency({agencyId:invite.agency_id,preferredKeys:['school_onboarding','schoolreply','system','default','notifications']});
        const message={to:invite.contact_email,subject,text,source:'auto',agencyId:invite.agency_id,userId:invite.primary_user_id,templateType:'school_onboarding_reminder'};
        return identity?.id ? sendEmailFromIdentity({senderIdentityId:identity.id,...message}) : EmailService.sendEmail(message);
      }});
      results.push({inviteId:invite.id,...result});
    } catch (error) { results.push({inviteId:invite.id,status:'review',code:error.code || 'delivery_needs_review'}); }
  }
  return results;
}
