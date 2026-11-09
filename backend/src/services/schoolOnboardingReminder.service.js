import crypto from 'node:crypto';
import pool from '../config/database.js';
import { sendSchoolOnboardingMessage } from './schoolOnboardingEmail.service.js';
import { onboardingReminderDue, onboardingReminderKey, onboardingEmailStatus } from '../utils/schoolOnboardingReminder.js';

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
    return { deliveryId:claim.insertId, communicationId:result?.communicationId || null, messageId:result?.id || null, sent:status==='sent', status, reason:status==='sent'?null:result?.reason || status };
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
  const select = `SELECT i.*,a.name agency_name,a.slug agency_slug,a.logo_url,a.logo_path,
    COALESCE((SELECT MAX(d.sent_at) FROM school_onboarding_email_deliveries d WHERE d.invite_id=i.id AND d.delivery_status='sent'),i.invite_email_sent_at,i.created_at) last_onboarding_email_sent_at,
    (SELECT COUNT(*) FROM school_onboarding_email_deliveries d WHERE d.invite_id=i.id
      AND (d.delivery_status IN ('sending','queued','review') OR (d.kind='reminder' AND d.delivery_status='failed'))
      AND d.created_at>=COALESCE((SELECT MAX(p.sent_at) FROM school_onboarding_email_deliveries p WHERE p.invite_id=i.id AND p.delivery_status='sent'),i.invite_email_sent_at,i.created_at)) unresolved_reminder_count
    FROM school_onboarding_invites i JOIN agencies a ON a.id=i.agency_id AND a.is_active=1
    JOIN agencies s ON s.id=i.school_organization_id AND COALESCE(s.is_archived,0)=0
      AND (s.is_active=1 OR JSON_UNQUOTE(JSON_EXTRACT(s.feature_flags,'$.schoolOnboardingDraft'))='true'
        OR JSON_UNQUOTE(JSON_EXTRACT(s.feature_flags,'$.schoolLifecycleState'))='onboarding')
    JOIN users u ON u.id=i.primary_user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
    WHERE i.status IN ('invited','in_progress','expired') AND i.submitted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM school_onboarding_invites newer WHERE newer.agency_id=i.agency_id
        AND newer.school_organization_id=i.school_organization_id AND newer.id>i.id AND newer.status<>'revoked')`;
  const [invites] = await database.execute(`${select} HAVING last_onboarding_email_sent_at<=DATE_SUB(?,INTERVAL 7 DAY)
    AND unresolved_reminder_count=0 ORDER BY last_onboarding_email_sent_at LIMIT 25`,[now]);
  const results = [];
  for (const invite of invites) {
    if (!onboardingReminderDue(invite,now)) continue;
    if (dryRun) { results.push({inviteId:invite.id,status:'due'}); continue; }
    try {
      // Recheck completion just before claiming the email, including simultaneous staff edits.
      const [[fresh]] = await database.execute(`${select} AND i.id=?`, [invite.id]);
      if (!fresh || !onboardingReminderDue(fresh,now)) continue;
      const result = await deliverOnboardingEmail({invite:fresh,kind:'reminder',deliveryKey:onboardingReminderKey(fresh),database,send:async()=>{
        const {buildOnboardingLink} = await import('./schoolOnboarding.service.js');
        const link=buildOnboardingLink(fresh.token);
        const subject=`Friendly reminder: complete ${fresh.school_name} onboarding on SchoolCareBridge`;
        const text=`Hi ${fresh.contact_first_name || 'there'},\n\nA friendly reminder from ${fresh.agency_name || 'our schools team'}: please complete your school onboarding on SchoolCareBridge for ${fresh.school_name}.\n\nWhether you have not started yet or have a few steps left, you can use the link below to continue. Any saved progress will be there:\n\n${link}\n\nIf you have questions or would like a hand, just reply to this email and our Schools Team will help.\n\nThank you,\n${fresh.agency_name || 'Your agency'} Schools Team`;
        return sendSchoolOnboardingMessage({invite:fresh,agency:{name:fresh.agency_name,slug:fresh.agency_slug,logo_url:fresh.logo_url,logo_path:fresh.logo_path},subject,text,link,kind:'reminder'});
      }});
      results.push({inviteId:invite.id,...result});
    } catch (error) { results.push({inviteId:invite.id,status:'review',code:error.code || 'delivery_needs_review'}); }
  }
  return results;
}
