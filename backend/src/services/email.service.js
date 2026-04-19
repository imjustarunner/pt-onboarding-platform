import GoogleWorkspaceEmailService from './googleWorkspaceEmail.service.js';
import { getEmailSendingMode, isEmailNotificationsEnabled } from './emailSettings.service.js';

/**
 * Look up a user_id by email address, best-effort. Used when callers don't
 * pass a userId so the resulting user_communications row can still be tied
 * to the recipient's user account (and therefore appear on their profile).
 */
async function resolveUserIdByEmail(email) {
  try {
    if (!email) return null;
    const { default: pool } = await import('../config/database.js');
    const [rows] = await pool.execute(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [String(email).trim()]
    );
    return rows?.[0]?.id || null;
  } catch {
    return null;
  }
}

class EmailService {
  static isConfigured() {
    return GoogleWorkspaceEmailService.isConfigured();
  }

  static async getSendingMode() {
    return await getEmailSendingMode();
  }

  static async canSend({ source, agencyId } = {}) {
    const mode = await this.getSendingMode();
    if (mode === 'manual_only' && String(source || '').trim().toLowerCase() !== 'manual') {
      return { allowed: false, reason: 'manual_only' };
    }
    const notificationsAllowed = await isEmailNotificationsEnabled({ agencyId, source });
    if (!notificationsAllowed) {
      return { allowed: false, reason: 'notifications_disabled' };
    }
    return { allowed: true };
  }

  /**
   * Send an email AND auto-log the send to user_communications.
   *
   * Logging is best-effort: a logging failure must NEVER block the email
   * itself. Callers may pass clientId / userId / templateType to enrich the
   * log row so it surfaces on the right profile/Communications tab. If they
   * don't, we still resolve the recipient user_id by email when possible so
   * the email shows up on that user's profile.
   *
   * Note: For Google Workspace group "From" addresses to work, the impersonated
   * user must have "Send mail as" permission for that group/address.
   */
  static async sendEmail({
    to,
    subject,
    text = null,
    html = null,
    fromName = null,
    fromAddress = null,
    replyTo = null,
    attachments = null,
    source = 'auto',
    agencyId = null,
    // Logging hints (all optional — sane defaults if omitted):
    userId = null,
    clientId = null,
    templateType = null,
    templateId = null,
    generatedByUserId = null
  }) {
    const gate = await this.canSend({ source, agencyId });
    if (!gate.allowed) {
      return { skipped: true, reason: gate.reason };
    }
    if (!this.isConfigured()) {
      throw new Error('EmailService is not configured (Google Workspace sender missing env vars)');
    }

    // Pre-log as 'pending' so any failure during the actual send is still
    // visible on the Communications tab as a failed/pending row.
    let comm = null;
    try {
      const { default: CommunicationLoggingService } = await import('./communicationLogging.service.js');
      const resolvedUserId = userId || await resolveUserIdByEmail(to);
      comm = await CommunicationLoggingService.logGeneratedCommunication({
        userId: resolvedUserId || null,
        clientId: clientId ? Number(clientId) : null,
        agencyId: agencyId ? Number(agencyId) : null,
        templateType: templateType || 'transactional_email',
        templateId: templateId || null,
        subject: subject || null,
        body: html || text || '',
        generatedByUserId: generatedByUserId || null,
        channel: 'email',
        recipientAddress: to
      });
    } catch (logErr) {
      console.warn('[EmailService] pre-log to user_communications failed', logErr?.message || logErr);
    }

    let sendResult;
    try {
      sendResult = await GoogleWorkspaceEmailService.sendEmail({
        to, subject, text, html, fromName, fromAddress, replyTo, attachments
      });
    } catch (sendErr) {
      // Mark the comm row as failed so it shows up as such instead of stuck "pending".
      if (comm?.id) {
        try {
          const { default: CommunicationLoggingService } = await import('./communicationLogging.service.js');
          await CommunicationLoggingService.markAsFailed(
            comm.external_message_id || `comm-${comm.id}`,
            String(sendErr?.message || 'send failed').slice(0, 500),
            'failed'
          ).catch(() => {});
          // markAsFailed looks up by external_message_id; if not set yet, do a direct update.
          const { default: pool } = await import('../config/database.js');
          await pool.execute(
            `UPDATE user_communications SET delivery_status = 'failed', error_message = ? WHERE id = ?`,
            [String(sendErr?.message || 'send failed').slice(0, 500), comm.id]
          ).catch(() => {});
        } catch {
          /* best effort */
        }
      }
      throw sendErr;
    }

    if (comm?.id) {
      try {
        const { default: CommunicationLoggingService } = await import('./communicationLogging.service.js');
        await CommunicationLoggingService.markAsSent(
          comm.id,
          sendResult?.id || null,
          { threadId: sendResult?.threadId || null, source }
        );
      } catch (logErr) {
        console.warn('[EmailService] markAsSent failed', logErr?.message || logErr);
      }
    }

    return { ...sendResult, communicationId: comm?.id || null };
  }
}

export default EmailService;

