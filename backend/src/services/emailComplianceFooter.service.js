/**
 * Global outbound email compliance: confidentiality disclaimer + opt-out link.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import { isEmailOptedOut } from './emailOptOut.service.js';
import { lookupSchoolStaffGroupContext } from './schoolGroupSubscription.service.js';

export const CONFIDENTIALITY_DISCLAIMER = [
  'CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!',
  'The information enclosed in this email may contain privileged and confidential materials intended solely for the individual indicated. If you are not the intended recipient, any review, dissemination, distribution, or duplication of this email is strictly prohibited. If you are not the intended recipient, please contact the sender by reply email and destroy all copies of the original message.'
].join('\n');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicAppBaseUrl() {
  return String(
    process.env.APP_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    'https://plottwisthq.com'
  ).replace(/\/$/, '');
}

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Create a one-time opt-out token for this recipient and return the public URL.
 */
export async function createEmailOptOutLink({ email, agencyId = null, userId = null } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return null;

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90); // 90 days

  try {
    await pool.execute(
      `INSERT INTO email_opt_out_tokens
        (token_hash, email, agency_id, user_id, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [tokenHash, normalized, agencyId ? Number(agencyId) : null, userId ? Number(userId) : null, expiresAt]
    );
  } catch (e) {
    console.warn('[emailCompliance] opt-out token insert failed:', e?.message || e);
    return null;
  }

  return `${publicAppBaseUrl()}/email-opt-out/${encodeURIComponent(rawToken)}`;
}

/**
 * Append confidentiality disclaimer + opt-out link under the signature.
 */
export async function appendComplianceFooter({
  text = null,
  html = null,
  to = null,
  agencyId = null,
  userId = null,
  skipOptOutLink = false
} = {}) {
  let optOutUrl = null;
  let schoolStaffFooter = false;
  let schoolGroupEmail = null;
  if (!skipOptOutLink && to) {
    optOutUrl = await createEmailOptOutLink({ email: to, agencyId, userId });
    try {
      const staffCtx = await lookupSchoolStaffGroupContext(to);
      schoolStaffFooter = !!staffCtx?.isSchoolStaff;
      schoolGroupEmail = staffCtx?.groupEmail || null;
    } catch {
      schoolStaffFooter = false;
    }
  }

  const disclaimerAlreadyPresent =
    (html && /data-pt-signature-confidential\s*=\s*["']?1["']?/i.test(String(html))) ||
    (html && /CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION/i.test(String(html)));

  const textParts = [String(text || '').trim()];
  if (!disclaimerAlreadyPresent) {
    textParts.push('', '---', CONFIDENTIALITY_DISCLAIMER);
  }
  if (optOutUrl) {
    if (schoolStaffFooter) {
      const groupBit = schoolGroupEmail ? ` (${schoolGroupEmail})` : '';
      textParts.push(
        '',
        `Don't want emails from your school group${groupBit}? Change your subscription to No email here (you stay on the portal and in the group):`,
        optOutUrl
      );
    } else {
      textParts.push('', 'Prefer fewer emails? Opt out of emails from us here:', optOutUrl);
    }
  }
  const textOut = textParts.join('\n').trim();

  const optOutHtml = !optOutUrl
    ? ''
    : schoolStaffFooter
      ? `<p style="margin:12px 0 0;">Don't want emails from your school group${
          schoolGroupEmail ? ` (${escapeHtml(schoolGroupEmail)})` : ''
        }?
          <a href="${escapeHtml(optOutUrl)}" style="color:#1d4ed8;">Change your subscription to No email</a>
          (you stay on the portal and in the group).
        </p>`
      : `<p style="margin:12px 0 0;">Prefer fewer emails?
          <a href="${escapeHtml(optOutUrl)}" style="color:#1d4ed8;">Opt out of emails from us</a>.
        </p>`;

  const disclaimerBodyHtml = disclaimerAlreadyPresent
    ? ''
    : `
      <p style="margin:0 0 8px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.02em;">
        CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!
      </p>
      <p style="margin:0;">
        The information enclosed in this email may contain privileged and confidential materials intended solely for the individual indicated.
        If you are not the intended recipient, any review, dissemination, distribution, or duplication of this email is strictly prohibited.
        If you are not the intended recipient, please contact the sender by reply email and destroy all copies of the original message.
      </p>`;

  const footerBlock =
    disclaimerBodyHtml || optOutHtml
      ? `
    <div style="margin-top:${disclaimerAlreadyPresent ? '12' : '24'}px;padding-top:16px;border-top:1px solid #d1d5db;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:#4b5563;">
      ${disclaimerBodyHtml}
      ${optOutHtml}
    </div>`.trim()
      : '';

  let htmlOut = html;
  if (htmlOut) {
    htmlOut = footerBlock ? `${String(htmlOut)}\n${footerBlock}` : String(htmlOut);
  } else if (text) {
    htmlOut = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">${
      String(text)
        .split('\n')
        .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line) || '&nbsp;'}</p>`)
        .join('')
    }${footerBlock}</div>`;
  }

  return { text: textOut, html: htmlOut, optOutUrl };
}

/**
 * Gate: skip send when recipient has opted out.
 */
export async function assertRecipientAllowsEmail({ to, agencyId = null } = {}) {
  const optedOut = await isEmailOptedOut({ email: to, agencyId });
  if (optedOut) {
    return { allowed: false, reason: 'recipient_opted_out' };
  }
  return { allowed: true };
}
