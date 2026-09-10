/**
 * Pre-hire portal invite email — sent when a candidate is marked hired / pre-hire.
 * Uses the pre_hire_admin_review_access notification trigger so Email Settings
 * controls enable/disable and People Operations sender identity.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
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

function buildDefaultInviteContent({ firstName, agencyName, jobTitle, portalLink, inviteDetails }) {
  const details = inviteDetails || {};
  const extraLines = [];
  if (details.startDate) extraLines.push(`Start date: ${details.startDate}`);
  if (details.expirationDate) extraLines.push(`Offer / contract expiration: ${details.expirationDate}`);
  if (details.minDays) extraLines.push(`Days per week: ${details.minDays}`);
  if (details.minHours) extraLines.push(`Minimum hours per week: ${details.minHours}`);
  const steps = Array.isArray(details.steps) ? details.steps.filter(Boolean) : [];
  const subject = `You are hired! Complete your pre-hire forms — ${agencyName}`;
  const text = [
    `Hi ${firstName},`,
    '',
    `You are hired! We're thrilled to welcome you to the ${agencyName} team${jobTitle ? ` as ${jobTitle}` : ''}.`,
    '',
    extraLines.length ? extraLines.join('\n') : '',
    extraLines.length ? '' : '',
    'Please fill out your pre-hire forms in the private portal linked below. Save this link — it is your private link. Do not share it.',
    '',
    'Once you complete the pre-hire process, you will continue onboarding at this same link. If we add additional documents later that are not yet available, we will email you again.',
    '',
    steps.length ? `Your pre-hire steps:\n${steps.map((s) => `• ${s}`).join('\n')}` : '',
    steps.length ? '' : '',
    `Your private pre-hire portal: ${portalLink}`,
    '',
    'This link is valid for 7 days. If it expires, please contact People Operations for a new one.',
    '',
    `— ${agencyName} People Operations`
  ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');

  const extraHtml = extraLines.length
    ? `<ul>${extraLines.map((l) => `<li>${escHtml(l)}</li>`).join('')}</ul>`
    : '';
  const stepsHtml = steps.length
    ? `<p><strong>Your pre-hire steps:</strong></p><ul>${steps.map((s) => `<li>${escHtml(s)}</li>`).join('')}</ul>`
    : '';

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;">
    <p>Hi ${escHtml(firstName)},</p>
    <p><strong>You are hired!</strong> We're thrilled to welcome you to the <strong>${escHtml(agencyName)}</strong> team${jobTitle ? ` as <strong>${escHtml(jobTitle)}</strong>` : ''}.</p>
    ${extraHtml}
    <p>Please fill out your pre-hire forms using the private portal below. <strong>Save this link — it is your private link. Do not share it.</strong></p>
    <p>Once you complete the pre-hire process, you will continue onboarding at this same link. If we add additional documents later that are not yet available, we will email you again.</p>
    ${stepsHtml}
    <p style="margin:24px 0;">
      <a href="${escHtml(portalLink)}" style="background:#1a5c38;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open your pre-hire portal →</a>
    </p>
    <p style="color:#555;font-size:13px;">Or copy this private link: <a href="${escHtml(portalLink)}" style="color:#1a5c38;">${escHtml(portalLink)}</a></p>
    <p style="color:#555;font-size:13px;">This link is valid for 7 days. If it expires, please contact People Operations for a new one.</p>
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
  generatedByUserId = null,
  inviteDetails = null
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
      || `You are hired! Complete your pre-hire forms — ${agencyName}`;
    const bodySource = customBodyTrim || settings.invite_email_body || '';
    text = applyCustomTokens(bodySource, { firstName, portalLink });
    html = textToHtml(text);
  }

  if (!text) {
    const fallback = buildDefaultInviteContent({ firstName, agencyName, jobTitle, portalLink, inviteDetails });
    subject = subject || fallback.subject;
    text = fallback.text;
    html = fallback.html;
  } else if (inviteDetails) {
    const extraLines = [
      inviteDetails.startDate ? `Start date: ${inviteDetails.startDate}` : '',
      inviteDetails.expirationDate ? `Offer / contract expiration: ${inviteDetails.expirationDate}` : '',
      inviteDetails.minDays ? `Days per week: ${inviteDetails.minDays}` : '',
      inviteDetails.minHours ? `Minimum hours per week: ${inviteDetails.minHours}` : ''
    ].filter(Boolean);
    const steps = Array.isArray(inviteDetails.steps) ? inviteDetails.steps.filter(Boolean) : [];
    if (extraLines.length || steps.length) {
      const extraText = [
        extraLines.join('\n'),
        steps.length ? `Pre-hire steps:\n${steps.map((s) => `• ${s}`).join('\n')}` : ''
      ].filter(Boolean).join('\n');
      text = `${text}\n\n${extraText}`;
      const extraHtmlBits = [
        extraLines.length ? `<ul>${extraLines.map((l) => `<li>${escHtml(l)}</li>`).join('')}</ul>` : '',
        steps.length ? `<p><strong>Pre-hire steps:</strong></p><ul>${steps.map((s) => `<li>${escHtml(s)}</li>`).join('')}</ul>` : ''
      ].join('');
      html = `${html}<div style="margin-top:16px;font-size:14px;color:#111;">${extraHtmlBits}</div>`;
    }
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
    console.warn('[sendPrehirePortalInviteEmail] notification skipped for user', candidateUserId, ':', result.reason, '— sending hire email directly');
    try {
      const { resolveJobApplicationSenderIdentity } = await import('./hiringReferenceIdentity.service.js');
      const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
      const identity = await resolveJobApplicationSenderIdentity(agencyId);
      if (identity?.id) {
        await sendEmailFromIdentity({
          senderIdentityId: identity.id,
          to: recipientEmail,
          subject,
          text,
          html,
          userId: candidateUserId,
          agencyId,
          source: 'auto'
        });
        return { ok: true, fallback: true };
      }
    } catch (fallbackErr) {
      console.warn('[sendPrehirePortalInviteEmail] identity send failed:', fallbackErr?.message);
    }
    try {
      const { default: EmailService } = await import('./email.service.js');
      await EmailService.sendEmail({
        to: recipientEmail,
        subject,
        text,
        html,
        userId: candidateUserId,
        agencyId,
        source: 'auto'
      });
      return { ok: true, fallback: true };
    } catch (emailErr) {
      console.error('[sendPrehirePortalInviteEmail] direct send failed:', emailErr?.message);
      return result;
    }
  }

  return result;
}
