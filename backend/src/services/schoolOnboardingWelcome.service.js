import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import GoogleWorkspaceDirectoryService from './googleWorkspaceDirectory.service.js';
import { schoolEmailPortalUrl } from './schoolEmailPortal.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { getEmailSendingMode, isEmailNotificationsEnabled } from './emailSettings.service.js';
import { schoolOnboardingWelcomeEmail } from '../utils/schoolOnboardingWelcomeEmail.js';

export const WELCOME_TEMPLATE = 'school_onboarding_welcome';
const email = value => String(value || '').trim().toLowerCase();

/** Both setup entry points converge here. Unique school key prevents repeat welcomes. */
export async function queueSchoolOnboardingWelcome({ agencyId, schoolOrganizationId, sourceType, sourceId }, db = pool) {
  if (!agencyId || !schoolOrganizationId || !sourceId || !['onboarding', 'collaborative_update'].includes(sourceType)) return;
  await db.execute(`INSERT INTO school_onboarding_welcome_emails
    (agency_id, school_organization_id, source_type, source_id)
    SELECT ?, ?, ?, ? FROM agencies WHERE id=? AND LOWER(slug)='itsco'
    ON DUPLICATE KEY UPDATE id = school_onboarding_welcome_emails.id`, [agencyId, schoolOrganizationId, sourceType, sourceId, agencyId]);
}

export async function welcomeSchoolContext(job, db = pool) {
  const [agency, school] = await Promise.all([Agency.findById(job.agency_id), Agency.findById(job.school_organization_id)]);
  // This rollout is for ITSCO. Never CC ITSCO on another tenant's school email.
  if (email(agency?.slug || agency?.portal_url) !== 'itsco') return { waiting: 'unsupported_agency' };
  if (!school || school.organization_type !== 'school' || !school.is_active) return { waiting: 'school_inactive' };
  const [completion] = job.source_type === 'onboarding'
    ? await db.execute("SELECT i.id FROM school_onboarding_invites i JOIN users u ON u.id=i.primary_user_id WHERE i.id=? AND i.agency_id=? AND i.school_organization_id=? AND i.status='submitted' AND u.is_active=1", [job.source_id, job.agency_id, job.school_organization_id])
    : await db.execute("SELECT id FROM school_reinit_cycles WHERE id=? AND agency_id=? AND school_organization_id=? AND status='finalized'", [job.source_id, job.agency_id, job.school_organization_id]);
  if (!completion.length) return { waiting: 'setup_not_complete' };
  const [[profile]] = await db.execute('SELECT itsco_email FROM school_profiles WHERE school_organization_id=?', [job.school_organization_id]);
  const groupEmail = email(profile?.itsco_email);
  if (!/^[^\s@]+@itsco\.health$/.test(groupEmail)) return { waiting: 'school_group_not_established' };
  if (!GoogleWorkspaceDirectoryService.isConfigured()) return { waiting: 'directory_not_configured' };
  const group = await GoogleWorkspaceDirectoryService.getGroup({ groupEmail });
  if (!group?.id) return { waiting: 'school_group_not_established' };
  const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(job.agency_id, 'notifications');
  if (!identity?.id || email(identity.from_email) !== 'notifications@itsco.health') return { waiting: 'notifications_sender_missing' };
  const portalUrl = await schoolEmailPortalUrl({ schoolOrganizationId: job.school_organization_id, agencyId: job.agency_id });
  const [[activity]] = await db.execute('SELECT COUNT(*) AS count FROM clients WHERE agency_id=? AND organization_id=?', [job.agency_id, job.school_organization_id]);
  return { identity, groupEmail, portalUrl, content: schoolOnboardingWelcomeEmail({
    schoolName: school.name, agencyName: agency.name, groupEmail, portalUrl, supportEmail: 'support@itsco.health', alreadyStarted: Number(activity?.count) > 0
  }) };
}

/** Claims atomically across instances. Uncertain sends are held, never blindly repeated. */
export async function sendPendingSchoolOnboardingWelcomes({ db = pool, limit = 20 } = {}) {
  await reconcileSchoolWelcomeDeliveries(db);
  const [jobs] = await db.execute(`SELECT * FROM school_onboarding_welcome_emails
    WHERE delivery_status='pending' AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY id LIMIT ${Math.max(1, Math.min(100, Number(limit) || 20))}`);
  const results = [];
  for (const job of jobs) {
    let claimed = false;
    try {
      if ((await getEmailSendingMode()) !== 'all' || !(await isEmailNotificationsEnabled({ agencyId: job.agency_id }))) {
        results.push({ id: job.id, waiting: 'email_disabled' });
        continue;
      }
      const context = await welcomeSchoolContext(job, db);
      if (context.waiting) {
        await db.execute("UPDATE school_onboarding_welcome_emails SET last_error=?, next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=? AND delivery_status='pending'", [context.waiting, job.id]);
        results.push({ id: job.id, waiting: context.waiting });
        continue;
      }
      const [claim] = await db.execute("UPDATE school_onboarding_welcome_emails SET delivery_status='sending',recipient_email=?,attempts=attempts+1,last_error=NULL WHERE id=? AND delivery_status='pending'", [context.groupEmail, job.id]);
      if (!claim.affectedRows) continue;
      claimed = true;
      const result = await sendEmailFromIdentity({ senderIdentityId: context.identity.id,
        to: context.groupEmail, cc: 'schools@itsco.health', replyToOverride: 'support@itsco.health',
        ...context.content, source: 'auto', templateType: WELCOME_TEMPLATE, linkUrl: context.portalUrl,
        internetMessageIdOverride: `<school-welcome-${job.agency_id}-${job.school_organization_id}@itsco.health>` });
      const status = result.id && !result.redirected ? 'sent' : result.skipped ? 'pending' : 'held';
      await db.execute("UPDATE school_onboarding_welcome_emails SET delivery_status=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?", [status, result.communicationId || null, status, result.reason || (status === 'held' ? 'send_not_confirmed' : null), job.id]);
      results.push({ id: job.id, status });
    } catch (error) {
      await db.execute("UPDATE school_onboarding_welcome_emails SET delivery_status=?,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?", [claimed ? 'held' : 'pending', String(error?.message || error).slice(0, 500), job.id]);
      results.push({ id: job.id, status: claimed ? 'held' : 'pending' });
    }
  }
  return results;
}

/** Reconcile sent receipts after worker restarts; uncertain network outcomes stay held. */
export async function reconcileSchoolWelcomeDeliveries(db = pool) {
  const [rows] = await db.execute(`SELECT id,agency_id,school_organization_id FROM school_onboarding_welcome_emails
    WHERE delivery_status IN ('sending','held') AND updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) LIMIT 100`);
  for (const job of rows) {
    const messageId = `<school-welcome-${job.agency_id}-${job.school_organization_id}@itsco.health>`;
    const [[communication]] = await db.execute(`SELECT id,delivery_status,external_message_id FROM user_communications
      WHERE agency_id=? AND template_type='school_onboarding_welcome'
      AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.internetMessageIdOverride'))=? ORDER BY id DESC LIMIT 1`, [job.agency_id,messageId]);
    const sent = communication?.delivery_status === 'sent' && !!communication.external_message_id;
    await db.execute(`UPDATE school_onboarding_welcome_emails SET delivery_status=?,communication_id=COALESCE(?,communication_id),
      sent_at=IF(?,COALESCE(sent_at,UTC_TIMESTAMP()),sent_at),last_error=? WHERE id=? AND delivery_status IN ('sending','held')`,
      [sent ? 'sent' : 'held',communication?.id || null,!!sent,sent ? null : 'Delivery needs review before retrying',job.id]);
  }
}
