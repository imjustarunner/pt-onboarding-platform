import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { SUPPORT_TICKET_SOURCE_KEYS } from '../constants/supportTicketSources.js';

export async function createPasswordRecoverySupportTicket({ user, agency, requestedEmail, replyEmail, generatedByUserId = null }) {
  const subject = 'Password recovery request — manual review required';
  const question = [
    'A password recovery request requires manual account access review.',
    'No reset link was sent and no credentials or access were changed.',
    'Verify identity and whether access is still appropriate before restoring access or issuing a reset link. Close the ticket without restoring access if it is no longer needed.',
    '',
    `Account ID: ${user.id}`,
    `Name: ${[user.first_name, user.last_name].filter(Boolean).join(' ') || '(not provided)'}`,
    `Requested email: ${requestedEmail || '(not provided)'}`,
    `Login email: ${user.work_email || user.email || user.username || '(not provided)'}`,
    `Recovery email on file: ${user.personal_email || '(not provided)'}`,
    `Account status: ${user.status || '(not provided)'}`,
    `Active: ${user.is_active ?? '(not provided)'}`,
    `Archived: ${user.is_archived ?? 0}`,
    `Pending access locked: ${user.pending_access_locked ?? 0}`,
    generatedByUserId ? `Requested by staff user ID: ${generatedByUserId}` : 'Submitted through public password recovery; identity has not been verified.'
  ].join('\n');
  const enc = prepareEncryptedTicketText(question);
  // External source: an unauthenticated submission must not impersonate the account holder.
  const [result] = await pool.execute(
    `INSERT INTO support_tickets
      (school_organization_id, agency_id, created_by_user_id, created_by_source_key,
       subject, question, status, target_scope, topic, source_channel, source_email_from,
       question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
     VALUES (?, ?, NULL, ?, ?, ?, 'open', 'tenant', 'general', 'public_web', ?, ?, ?, ?, ?)`,
    [agency.id, agency.id, SUPPORT_TICKET_SOURCE_KEYS.PASSWORD_RECOVERY, subject,
      enc.plain, replyEmail || null, enc.ciphertext, enc.iv, enc.authTag, enc.keyId]
  );
  const ticketId = result.insertId;
  if (!ticketId) throw new Error('Password recovery support ticket was not saved');

  // The ticket is durable before notifications; notification failures must not invite duplicate submissions.
  try {
    const [recipients] = await pool.execute(
      `SELECT DISTINCT u.id FROM users u
       LEFT JOIN user_agencies ua ON ua.user_id = u.id
       WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND (u.is_active = TRUE OR u.is_active IS NULL)
         AND (LOWER(u.role) = 'super_admin'
           OR (ua.agency_id = ? AND LOWER(u.role) IN ('admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus')))`,
      [agency.id]
    );
    for (const recipient of recipients) {
      await Notification.create({
        type: 'support_ticket_created', severity: 'info', title: subject,
        message: `Password recovery request #${ticketId} is awaiting review.`,
        userId: recipient.id, agencyId: agency.id,
        relatedEntityType: 'support_ticket', relatedEntityId: ticketId,
        actorUserId: generatedByUserId
      }).catch((error) => console.error('[passwordRecovery] support notification failed', error?.message));
    }
  } catch (error) {
    console.error('[passwordRecovery] support notifications failed', error?.message);
  }
  return ticketId;
}
