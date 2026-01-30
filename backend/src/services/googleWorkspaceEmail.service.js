import { google } from 'googleapis';
import { getWorkspaceClientsForEmployee, logGoogleUnauthorizedHint } from './googleWorkspaceAuth.service.js';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

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

function buildMimeMessage({ to, subject, text, html, from, replyTo }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `From: ${from}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    'MIME-Version: 1.0'
  ];

  // Prefer multipart/alternative when both are present
  if (text && html) {
    const boundary = `alt_${Math.random().toString(16).slice(2)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      html,
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

  if (html) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    return [...headers, '', html, ''].join('\r\n');
  }

  headers.push('Content-Type: text/plain; charset="UTF-8"');
  return [...headers, '', (text || ''), ''].join('\r\n');
}

class GoogleWorkspaceEmailService {
  static isConfigured() {
    const sa = parseServiceAccountJson();
    return !!(
      sa?.client_email &&
      sa?.private_key &&
      process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER &&
      (process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM)
    );
  }

  static async sendEmail({ to, subject, text = null, html = null, fromName = null, fromAddress = null, replyTo = null }) {
    const impersonate = process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER;
    if (!impersonate) {
      throw new Error('Missing GOOGLE_WORKSPACE_IMPERSONATE_USER');
    }

    const fromEmail = fromAddress || process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM;
    if (!fromEmail) {
      throw new Error('Missing GOOGLE_WORKSPACE_FROM_ADDRESS (or GOOGLE_WORKSPACE_DEFAULT_FROM)');
    }

    const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

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
      replyTo
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

