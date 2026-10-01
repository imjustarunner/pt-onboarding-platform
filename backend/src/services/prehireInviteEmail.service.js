/**
 * Pre-hire portal invite email — sent when a candidate is marked hired / pre-hire.
 * Uses the pre_hire_admin_review_access notification trigger so Email Settings
 * controls enable/disable and People Operations sender identity.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { HOGWARTS_TEST_INBOX } from '../utils/hogwartsTestEmail.js';

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
    .replace(/\{\{FIRST_NAME\}\}|\{first_name\}/gi, () => firstName)
    .replace(/\{\{PORTAL_LOGIN_LINK\}\}|\{link\}/gi, () => portalLink);
}

function parseObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

export function prehireInviteDelivery(result, recipientEmail) {
  const status = result?.pendingApproval || result?.queued ? 'pending'
    : result?.skipped || result?.blocked || result?.failed ? 'failed'
      : result?.id ? 'sent' : 'failed';
  return {
    ...result,
    status,
    recipientEmail,
    deliveredTo: status === 'sent' ? (result.redirected ? HOGWARTS_TEST_INBOX : recipientEmail) : null
  };
}

export function formatOfferDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }) : raw;
}

function buildDefaultInviteContent({ firstName, agencyName, jobTitle, portalLink, inviteDetails }) {
  const details = inviteDetails || {};
  const extraLines = [];
  if (details.startDate) extraLines.push(`Start date: ${formatOfferDate(details.startDate)}`);
  if (details.expirationDate) extraLines.push(`Offer / contract expiration: ${formatOfferDate(details.expirationDate)}`);
  if (details.minDays) extraLines.push(`Days per week: ${details.minDays}`);
  if (details.minHours) extraLines.push(`Minimum hours per week: ${details.minHours}`);
  const steps = Array.isArray(details.steps) ? details.steps.filter(Boolean) : [];
  const subject = `Your job offer — Complete your pre-hire forms — ${agencyName}`;
  const text = [
    `Hi ${firstName},`,
    '',
    `We are excited to extend a job offer${jobTitle ? ` for the ${jobTitle} position` : ''} with ${agencyName}.`,
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
    <p>We are excited to extend a job offer${jobTitle ? ` for the <strong>${escHtml(jobTitle)}</strong> position` : ''} with <strong>${escHtml(agencyName)}</strong>.</p>
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
  inviteDetails = null,
  source = 'auto'
}) {
  const user = await User.findById(candidateUserId);
  if (!user) return { skipped: true, reason: 'user_not_found' };

  const recipientEmail = String(user.personal_email || user.email || '').trim();
  if (!recipientEmail) {
    console.warn('[sendPrehirePortalInviteEmail] No email for user', candidateUserId);
    return { skipped: true, reason: 'no_recipient_email' };
  }

  const [agencyRows] = await pool.execute(
    `SELECT prehire_settings, name
     FROM agencies WHERE id = ? LIMIT 1`,
    [agencyId]
  );
  const agencyRow = agencyRows[0] || {};
  const rawSettings = agencyRow.prehire_settings;
  const settings = parseObject(rawSettings);
  const agencyName = agencyRow.name || 'People Operations';
  const firstName = user.first_name || 'there';
  const [profileRows] = await pool.execute(
    `SELECT hp.applied_role, jd.title AS job_title FROM hiring_profiles hp
     LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id AND jd.agency_id = ?
     WHERE hp.candidate_user_id = ? LIMIT 1`, [agencyId, candidateUserId]
  );
  const jobTitle = profileRows[0]?.job_title || profileRows[0]?.applied_role || settings.default_job_title || '';
  // Resends include the same saved offer details and checklist as the first invite.
  if (!inviteDetails) {
    const [generations] = await pool.execute(
      `SELECT g.token_values_json FROM contract_generations g JOIN tasks t ON t.id = g.task_id
       WHERE g.agency_id = ? AND g.candidate_user_id = ? AND t.status != 'overridden'
       ORDER BY g.id DESC LIMIT 1`, [agencyId, candidateUserId]
    );
    const [steps] = await pool.execute(
      'SELECT title FROM hiring_prehire_checklist_items WHERE agency_id = ? AND user_id = ? ORDER BY id',
      [agencyId, candidateUserId]
    );
    const tokens = parseObject(generations[0]?.token_values_json);
    inviteDetails = {
      startDate: tokens.START_DATE,
      expirationDate: tokens.EXPIRATION_DATE || tokens.CONTRACT_EXPIRATION,
      minDays: tokens.MIN_DAYS_PER_WEEK || tokens.MIN_DAYS,
      minHours: tokens.MIN_HOURS || tokens.MIN_HOURS_PER_WEEK,
      steps: steps.map(step => step.title)
    };
  }

  let subject;
  let text;
  let html;
  let templateId = null;

  const customSubjectTrim = String(customSubject || '').trim();
  const customBodyTrim = String(customBody || '').trim();

  if (customSubjectTrim || customBodyTrim) {
    subject = customSubjectTrim
      || settings.invite_email_subject
      || `Your job offer — Complete your pre-hire forms — ${agencyName}`;
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
      inviteDetails.startDate ? `Start date: ${formatOfferDate(inviteDetails.startDate)}` : '',
      inviteDetails.expirationDate ? `Offer / contract expiration: ${formatOfferDate(inviteDetails.expirationDate)}` : '',
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

  // A customized message must still include the candidate's usable portal link.
  if (!text.includes(portalLink)) {
    text += `\n\nYour private pre-hire portal: ${portalLink}`;
    html += `<p><a href="${escHtml(portalLink)}">Open your private pre-hire portal</a></p>`;
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
    source
  });
  // Keep one audited delivery path. A held/blocked send is never a successful send.
  return prehireInviteDelivery(result, recipientEmail);
}
