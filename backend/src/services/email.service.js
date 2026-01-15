import GoogleWorkspaceEmailService from './googleWorkspaceEmail.service.js';

class EmailService {
  static isConfigured() {
    return GoogleWorkspaceEmailService.isConfigured();
  }

  /**
   * Send an email.
   * Note: For Google Workspace group "From" addresses to work, the impersonated user must have
   * "Send mail as" permission for that group/address in Gmail settings.
   */
  static async sendEmail({ to, subject, text = null, html = null, fromName = null, fromAddress = null, replyTo = null }) {
    if (!this.isConfigured()) {
      throw new Error('EmailService is not configured (Google Workspace sender missing env vars)');
    }
    return await GoogleWorkspaceEmailService.sendEmail({ to, subject, text, html, fromName, fromAddress, replyTo });
  }
}

export default EmailService;

