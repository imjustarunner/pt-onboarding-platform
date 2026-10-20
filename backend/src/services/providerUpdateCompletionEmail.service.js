import pool from '../config/database.js';
import { resolveProviderUpdateSender } from './providerUpdateEmailSender.service.js';
import { resolveProviderUpdateRecipients } from './providerUpdateRecipient.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
export const completionEmailTemplate = 'provider_update_completion_receipt';

export function providerUpdateCompletionMessage(recipient) {
  const seconds = Number(recipient.active_seconds || 0);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
  const duration = [hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '',
    minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : '',
    `${remainder} second${remainder === 1 ? '' : 's'}`].filter(Boolean).join(', ');
  const linkUrl = buildPublicAppUrl({ slug: recipient.agency_slug, portal_url: recipient.portal_url,
    custom_domain: recipient.custom_domain }, 'dashboard?tab=my&my=payroll#payroll-section-time_claims');
  const claim = recipient.payroll_time_claim_id
    ? `A time claim has been submitted on your behalf for that recorded time (claim #${recipient.payroll_time_claim_id}). In your organization's portal, open My Payroll, then Time Claims. Look for “Provider Update review.”\n\nView your time claims: ${linkUrl}\n\nThe claim is submitted for payroll review. You do not need to submit a duplicate.`
    : 'Your update is complete. No time claim was created automatically for this update.';
  return {
    subject: 'Thank you — your Provider Update is complete',
    text: `Hi ${recipient.first_name},\n\nThank you for completing your Provider Update! Your update is marked complete. You do not need to repeat or resubmit it.\n\nYour recorded active review time was ${duration}.\n\n${claim}\n\nIf you need help or the recorded time does not reflect the time you worked, reply to this email to reach your Technology team.\n\nThank you!\n${recipient.agency_name || 'Your organization'}`,
    linkUrl
  };
}

export function createProviderUpdateCompletionEmails({
  db = pool, resolveSender = resolveProviderUpdateSender,
  resolveRecipients = resolveProviderUpdateRecipients, sendEmail = sendEmailFromIdentity
} = {}) {
  return async function sendCompletion(recipientId, { source = 'auto', actorUserId = null } = {}) {
    const connection = await db.getConnection();
    const lock = `provider-update-receipt:${Number(recipientId)}`;
    let locked = false;
    try {
      const [[acquired]] = await connection.execute('SELECT GET_LOCK(?,0) acquired', [lock]);
      if (!acquired?.acquired) return { skipped: true, reason: 'receipt_in_progress' };
      locked = true;
      const [[recipient]] = await connection.execute(`SELECT r.*,u.first_name,u.email,u.work_email,
        a.name agency_name,a.slug agency_slug,a.portal_url,a.custom_domain FROM provider_update_recipients r
        JOIN users u ON u.id=r.provider_user_id JOIN agencies a ON a.id=r.agency_id WHERE r.id=?`, [recipientId]);
      if (!recipient?.finalized_at || !recipient.locked_at || recipient.status !== 'finalized' || String(recipient.token).startsWith('preview_')) {
        return { skipped: true, reason: 'update_not_complete' };
      }
      // Existing one-time reconciliation receipts use this same event.
      // A durable "sending" event also prevents duplicates after an ambiguous transport failure.
      const [prior] = await connection.execute(`SELECT id FROM provider_update_view_events
        WHERE recipient_id=? AND event_type IN ('completion_receipt_sent','completion_receipt_sending','completion_receipt_pending') LIMIT 1`, [recipientId]);
      if (prior.length) return { skipped: true, reason: 'prior_receipt' };
      const required = parse(recipient.snapshot_json).enabledKeys;
      const [sections] = await connection.execute('SELECT section_key,completed FROM provider_update_section_progress WHERE recipient_id=?', [recipientId]);
      if (!required?.length || required.some(key => !sections.some(section => section.section_key === key && Number(section.completed) === 1))) {
        throw new Error('Completed update snapshot failed validation.');
      }
      if (recipient.payroll_time_claim_id) {
        const [[claim]] = await connection.execute('SELECT * FROM payroll_time_claims WHERE id=?', [recipient.payroll_time_claim_id]);
        if (!claim || claim.user_id !== recipient.provider_user_id || claim.agency_id !== recipient.agency_id ||
            !['submitted', 'approved', 'paid'].includes(claim.status) ||
            Number(parse(claim.payload_json).activeSeconds) !== Number(recipient.active_seconds)) throw new Error('Completion claim failed validation.');
      }
      const [resolved] = await resolveRecipients(recipient.agency_id, [recipient]);
      if (!resolved?.work_email) throw new Error('No saved agency work email for completion receipt.');
      const sender = await resolveSender(recipient.agency_id);
      const [event] = await connection.execute(`INSERT INTO provider_update_view_events(recipient_id,event_type,metadata_json)
        VALUES (?,'completion_receipt_sending',?)`, [recipientId, JSON.stringify({ actorUserId, claimId: recipient.payroll_time_claim_id })]);
      const sent = await sendEmail({
        senderIdentityId: sender.identity.id, replyToOverride: sender.replyTo,
        to: resolved.work_email, ...providerUpdateCompletionMessage(recipient),
        source, generatedByUserId: actorUserId, userId: recipient.provider_user_id,
        templateType: completionEmailTemplate
      });
      const eventType = sent?.id ? 'completion_receipt_sent'
        : sent?.queued ? 'completion_receipt_pending'
        : sent?.skipped || sent?.blocked ? 'completion_receipt_skipped' : 'completion_receipt_sending';
      await connection.execute('UPDATE provider_update_view_events SET event_type=?,metadata_json=? WHERE id=?',
        [eventType, JSON.stringify({ actorUserId, communicationId: sent?.communicationId || null,
          claimId: recipient.payroll_time_claim_id, activeSeconds: recipient.active_seconds, reason: sent?.reason || null }), event.insertId]);
      return sent;
    } finally {
      if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
      connection.release();
    }
  };
}

export const sendProviderUpdateCompletionEmail = createProviderUpdateCompletionEmails();

export async function ensureProviderUpdateCompletionEmail(recipientId, actorUserId) {
  try { return await sendProviderUpdateCompletionEmail(recipientId, { actorUserId }); }
  catch (error) {
    // Email trouble must not turn a successful, paid submission back into an error.
    console.warn('[Provider Update completion email]', recipientId, error.code || error.message);
    return { pending: true };
  }
}
