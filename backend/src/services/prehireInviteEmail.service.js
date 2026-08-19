/**
 * Pre-hire portal invite email — sent when a candidate is marked hired / pre-hire.
 * Uses the pre_hire_admin_review_access notification trigger so Email Settings
 * controls enable/disable and People Operations sender identity.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import EmailTemplateService from './emailTemplate.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

export const PREHIRE_PORTAL_ACCESS_TRIGGER = 'pre_hire_admin_review_access';

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(text) {
  return String(text || '')
    .split('\n')
    .map((line) => `<p style="margin:0 0 12px;">${escHtml(line) || '&nbsp;'}</p>`)
    .join('');
}

function applyCustomTokens(text, { firstName, portalLink }) {
  return String(text || '')
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{link\}/gi, portalLink)
    .replace(/\{\{FIRST_NAME\}\}/g, firstName)
    .replace(/\{\{PORTAL_LOGIN_LINK\}\}/g, portalLink);
}

function buildDefaultInviteContent({ firstName, agencyName, jobTitle, portalLink }) {
  const subject = `Welcome to ${agencyName} — complete your pre-hire documents`;
  const text = [
    `Hi ${firstName},`,
    '',
    `We're thrilled to welcome you to the ${agencyName} team${jobTitle ? ` as ${jobTitle}` : ''}!`,
    '',
    'To complete your pre-hire process, please click the link below to access your secure pre-hire portal. You\'ll find documents to review and sign, as well as any other items required before your start date.',
    '',
    `Your pre-hire portal: ${portalLink}`,
    '',
    'This link is valid for 7 days. If it expires, please contact your HR coordinator for a new one.',
    '',
    'Once all items are completed, a member of our People Operations team will review and reach out with next steps.',
    '',
    'We look forward to having you on the team!',
    '',
    `— ${agencyName} People Operations`
  ].join('\n');

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;">
    <p>Hi ${escHtml(firstName)},</p>
    <p>We're thrilled to welcome you to the <strong>${escHtml(agencyName)}</strong> team${jobTitle ? ` as <strong>${escHtml(jobTitle)}</strong>` : ''}!</p>
    <p>To complete your pre-hire process, please click the button below to access your secure pre-hire portal. You'll find documents to review and sign, as well as any other items required before your start date.</p>
    <p style="margin:24px 0;">
      <a href="${escHtml(portalLink)}" style="background:#1a5c38;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Access Your Pre-Hire Portal →</a>
    </p>
    <p style="color:#555;font-size:13px;">Or copy this link: <a href="${escHtml(portalLink)}" style="color:#1a5c38;">${escHtml(portalLink)}</a></p>
    <p style="color:#555;font-size:13px;">This link is valid for 7 days. If it expires, please contact your HR coordinator for a new one.</p>
    <p>Once all items are completed, a member of our People Operations team will review and reach out with next steps.</p>
    <p>We look forward to having you on the team!</p>
    <p style="color:#6b7280;font-size:13px;">— ${escHtml(agencyName)} People Operations</p>
  </div>`;

  return { subject, text, html };
}

/**
 * @param {Object} params
 * @param {number} params.agencyId
 * @param {number} params.candidateUserId
 * @param {string} params.portalLink - full pre-hire portal URL
 * @param {string|null} [params.customSubject]
 * @param {string|null} [params.customBody]
 * @param {number|null} [params.generatedByUserId]
 */
export async function sendPrehirePortalInviteEmail({
  agencyId,
  candidateUserId,
  portalLink,
  customSubject = null,
  customBody = null,
  generatedByUserId = null
}) {
  const user = await User.findById(candidateUserId);
  if (!user) return { skipped: true, reason: 'user_not_found' };

  const recipientEmail = String(user.personal_email || user.email || '').trim();
  if (!recipientEmail) {
    console.warn('[sendPrehirePortalInviteEmail] No email for user', candidateUserId);
    return { skipped: true, reason: 'no_recipient_email' };
  }

  const [agencyRows] = await pool.execute(
    `SELECT prehire_settings, name, onboarding_team_email, people_ops_email, portal_url, slug
     FROM agencies WHERE id = ? LIMIT 1`,
    [agencyId]
  );
  const agencyRow = agencyRows[0] || {};
  const rawSettings = agencyRow.prehire_settings;
  const settings = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : (rawSettings || {});
  const agencyName = agencyRow.name || 'People Operations';
  const firstName = user.first_name || 'there';
  const jobTitle = user.applied_role || settings.default_job_title || '';

  let subject;
  let text;
  let html;
  let templateId = null;

  const customSubjectTrim = String(customSubject || '').trim();
  const customBodyTrim = String(customBody || '').trim();

  if (customSubjectTrim || customBodyTrim) {
    subject = customSubjectTrim
      || settings.invite_email_subject
      || `Welcome to ${agencyName} — complete your pre-hire documents`;
    const bodySource = customBodyTrim || settings.invite_email_body || '';
    text = applyCustomTokens(bodySource, { firstName, portalLink });
    html = textToHtml(text);
  } else {
    try {
      const template = await EmailTemplateService.getTemplateForAgency(agencyId, PREHIRE_PORTAL_ACCESS_TRIGGER);
      if (template?.body) {
        const parameters = await EmailTemplateService.collectParameters(user, agencyRow, {
          keepPortalLoginLink: true
        });
        parameters.PORTAL_LOGIN_LINK = portalLink;
        parameters.PEOPLE_OPS_EMAIL = agencyRow.people_ops_email
          || agencyRow.onboarding_team_email
          || parameters.PEOPLE_OPS_EMAIL
          || '';
        const rendered = EmailTemplateService.renderTemplate(template, parameters);
        subject = rendered.subject;
        text = rendered.body;
        html = textToHtml(text);
        templateId = template.id || null;
      }
    } catch (templateErr) {
      console.warn('[sendPrehirePortalInviteEmail] template render failed, using default:', templateErr?.message);
    }
  }

  if (!text) {
    const fallback = buildDefaultInviteContent({ firstName, agencyName, jobTitle, portalLink });
    subject = subject || fallback.subject;
    text = fallback.text;
    html = fallback.html;
  }

  const result = await sendNotificationEmail({
    agencyId,
    triggerKey: PREHIRE_PORTAL_ACCESS_TRIGGER,
    to: recipientEmail,
    subject,
    text,
    html,
    userId: candidateUserId,
    generatedByUserId,
    templateType: PREHIRE_PORTAL_ACCESS_TRIGGER,
    templateId,
    source: 'auto'
  });

  if (result?.skipped) {
    console.warn('[sendPrehirePortalInviteEmail] skipped for user', candidateUserId, ':', result.reason);
  }

  return result;
}
