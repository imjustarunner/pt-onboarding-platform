import GoogleWorkspaceEmailService from './googleWorkspaceEmail.service.js';
import { getEmailSendingMode, isEmailNotificationsEnabled } from './emailSettings.service.js';

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
   * Send an email.
   * Note: For Google Workspace group "From" addresses to work, the impersonated user must have
   * "Send mail as" permission for that group/address in Gmail settings.
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
    agencyId = null
  }) {
    const gate = await this.canSend({ source, agencyId });
    if (!gate.allowed) {
      return { skipped: true, reason: gate.reason };
    }
    if (!this.isConfigured()) {
      throw new Error('EmailService is not configured (Google Workspace sender missing env vars)');
    }
    return await GoogleWorkspaceEmailService.sendEmail({ to, subject, text, html, fromName, fromAddress, replyTo, attachments });
  }
}

export default EmailService;

