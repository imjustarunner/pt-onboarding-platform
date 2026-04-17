import { google } from 'googleapis';
import { getWorkspaceClientsForEmployee, logGoogleUnauthorizedHint } from './googleWorkspaceAuth.service.js';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import { base64UrlEncode, buildMimeMessage } from './unifiedEmail/mime.js';

function parseServiceAccountJson() {
  const raw = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64;

  const jsonText = raw
    ? raw
    : (b64 ? Buffer.from(b64, 'base64').toString('utf8') : null);

  if (!jsonText) return null;
  try {
    return typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  } catch {
    return null;
  }
}

function getImpersonatedUser() {
  return (
    process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER ||
    process.env.GMAIL_IMPERSONATE_USER ||
    null
  );
}

class GoogleWorkspaceEmailService {
  static isConfigured() {
    const sa = parseServiceAccountJson();
    const impersonate = getImpersonatedUser();
    return !!(
      sa?.client_email &&
      sa?.private_key &&
      impersonate &&
      (process.env.GOOGLE_WORKSPACE_FROM_ADDRESS ||
        process.env.GOOGLE_WORKSPACE_DEFAULT_FROM ||
        impersonate.includes('@'))
    );
  }

  static async sendEmail({ to, subject, text = null, html = null, fromName = null, fromAddress = null, replyTo = null, attachments = null }) {
    const impersonate = getImpersonatedUser();
    if (!impersonate) {
      throw new Error('Missing GOOGLE_WORKSPACE_IMPERSONATE_USER or GMAIL_IMPERSONATE_USER');
    }

    const fromEmail =
      fromAddress ||
      process.env.GOOGLE_WORKSPACE_FROM_ADDRESS ||
      process.env.GOOGLE_WORKSPACE_DEFAULT_FROM ||
      impersonate;
    const fromDisplayName =
      fromName ||
      process.env.GOOGLE_WORKSPACE_FROM_NAME ||
      (fromEmail === impersonate ? SUMMIT_STATS_TEAM_CHALLENGE_NAME : null);
    const fromHeader = fromDisplayName ? `${fromDisplayName} <${fromEmail}>` : fromEmail;

    // Domain-wide delegation impersonation via JWT
    // Uses GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64 and the full scope list (calendar + gmail).
    let gmail;
    try {
      ({ gmail } = await getWorkspaceClientsForEmployee({ subjectEmail: impersonate }));
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleWorkspaceEmailService.sendEmail' });
      throw e;
    }

    const mime = buildMimeMessage({
      to,
      subject,
      text,
      html,
      from: fromHeader,
      replyTo,
      attachments
    });

    const raw = base64UrlEncode(mime);

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    return { id: result.data?.id || null, threadId: result.data?.threadId || null };
  }
}

export default GoogleWorkspaceEmailService;

