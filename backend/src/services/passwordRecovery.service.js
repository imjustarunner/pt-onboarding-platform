/**
 * Password recovery (Forgot Password) — first principles
 *
 * Rules:
 * 1. Eligible non-SSO users may request a reset/set-password link.
 * 2. Password state does not matter: never set, temporary (active or expired),
 *    or lasting password (active or expired).
 * 3. Restricted accounts require a support ticket and manual review, never a reset link.
 * 4. Always write a user_communications row for email delivery (sent or failed).
 * 5. Captcha is not part of this flow (public login / local often have none).
 * 6. Lookup accepts work/login email OR personal/recovery email (and aliases).
 * 7. Delivery prefers personal_email as recovery inbox when present; login
 *    username shown in the email is always the work / group login address.
 */

import pool from '../config/database.js';
import { getPasswordRecoverySsoState, passwordRecoveryRequiresSupport } from './passwordRecoveryPolicy.service.js';
import { createPasswordRecoverySupportTicket } from './passwordRecoverySupport.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import EmailTemplateService from './emailTemplate.service.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import ActivityLogService from './activityLog.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { userNeedsFirstPasswordSet } from '../utils/schoolStaffPasswordRecovery.js';
import {
  looksLikeTestInboxRedirectAddress,
  shouldRedirectHogwartsOutboundEmail
} from '../utils/hogwartsTestEmail.js';

const RESET_HOURS = 48;
const OPTIONAL_RECOVERY_NOTICE = 'You can ignore this email if you do not need to set or reset your password, including if a colleague requested it for you. Your current password and sign-in remain unchanged. Your password changes only after you open the link and save a new password.';
const JUNK_NOTICE =
  'Important: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.';

function normalizeOrgSlug(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function normEmail(value) {
  const v = String(value || '').trim().toLowerCase();
  return v.includes('@') ? v : '';
}

function isGroupLoginUser(user) {
  return (
    user?.login_is_group_email === 1 ||
    user?.login_is_group_email === true ||
    user?.login_is_group_email === '1' ||
    user?.sso_password_override === 1 ||
    user?.sso_password_override === true ||
    user?.sso_password_override === '1'
  );
}

/**
 * Username / login email shown after reset — always the work / group alias when present.
 */
export function resolveLoginEmail(user) {
  const work = normEmail(user?.work_email);
  if (work) return work;
  if (isGroupLoginUser(user)) {
    const email = normEmail(user?.email);
    if (email) return email;
    const username = normEmail(user?.username);
    if (username) return username;
  }
  const email = normEmail(user?.email);
  if (email) return email;
  const username = normEmail(user?.username);
  if (username) return username;
  return null;
}

function accountEmails(user) {
  return [
    normEmail(user?.email),
    normEmail(user?.username),
    normEmail(user?.work_email),
    normEmail(user?.personal_email)
  ].filter(Boolean);
}

/**
 * Where to deliver the reset link.
 * Prefer personal_email as recovery inbox when set (applicants + hire group accounts).
 * Otherwise deliver to the address they typed if it belongs to the account, else login email.
 */
export function pickRecipientEmail(user, requestedEmail = null) {
  const requested = normEmail(requestedEmail);
  const personal = normEmail(user?.personal_email);
  const login = resolveLoginEmail(user);
  const known = new Set(accountEmails(user));

  // Prefer personal as recovery inbox whenever it is on file.
  if (personal) return personal;

  if (requested && known.has(requested)) return requested;
  if (login) return login;
  return requested || null;
}

async function resolveAgencyFromOrgSlug(orgSlug) {
  const slug = normalizeOrgSlug(orgSlug);
  if (!slug) return null;
  return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug)) || null;
}

async function resolveContextAgency({ userId, orgSlug }) {
  const agencies = await User.getAgencies(userId, { includeInactive: true });
  const fromSlug = await resolveAgencyFromOrgSlug(orgSlug);
  const selected = agencies.find((a) => Number(a.id) === Number(fromSlug?.id)) || agencies[0];
  if (!selected) throw new Error('No tenant is configured for this account');
  if (['school', 'program', 'learning'].includes(String(selected.organization_type || '').toLowerCase())) {
    const parentId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(Number(selected.id)) ||
      await AgencySchool.getActiveAgencyIdForSchool(Number(selected.id));
    if (!parentId) throw new Error('No parent tenant is configured for this organization');
    return await Agency.findById(parentId);
  }
  return selected;
}

async function resolveRecoverySender(agencyId) {
  const identities = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: false, onlyActive: true });
  const identity = identities.find((i) => Number(i.agency_id) === Number(agencyId) &&
    /^app@[^@]+$/i.test(String(i.from_email || '').trim()));
  if (!identity) throw new Error('Configure an app@ sender identity for this tenant');
  const domain = identity.from_email.trim().split('@')[1].toLowerCase();
  return { identity, replyTo: `technology@${domain}` };
}

async function markCommFailed(commId, message) {
  if (!commId) return;
  await pool
    .execute(
      `UPDATE user_communications SET delivery_status = 'failed', error_message = ? WHERE id = ?`,
      [String(message || 'not sent').slice(0, 500), commId]
    )
    .catch(() => {});
}

function loginReminderLines(loginEmail) {
  if (!loginEmail) return { text: '', html: '' };
  return {
    text: [
      '',
      `Your login email / username is: ${loginEmail}`,
      'Use that address on the sign-in screen after you set or reset your password (not your personal recovery address, unless they are the same).'
    ].join('\n'),
    html: [
      `<p><strong>Your login email / username is:</strong> ${loginEmail}</p>`,
      '<p>Use that address on the sign-in screen after you set or reset your password (not your personal recovery address, unless they are the same).</p>'
    ].join('')
  };
}

async function buildMessage({ user, agency, orgSlug, token, loginEmail, expiresInHours = RESET_HOURS }) {
  const resetLink = EmailTemplateService.buildResetTokenLink(
    agency || { portal_url: orgSlug, slug: orgSlug },
    token
  );
  const firstSet = userNeedsFirstPasswordSet(user);
  const reminder = loginReminderLines(loginEmail);
  let subject = firstSet ? 'Set your password' : 'Reset your password';
  let body = [
    firstSet
      ? 'Use this link to set a password for your account so you can sign in.'
      : 'We received a request to reset your password.',
    '',
    `${firstSet ? 'Set your password' : 'Reset your password'} using this link (expires in ${expiresInHours} hours):`,
    resetLink,
    reminder.text,
    '',
    JUNK_NOTICE,
    '',
    OPTIONAL_RECOVERY_NOTICE
  ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
  let html = [
    `<p>${firstSet
      ? 'Use this link to set a password for your account so you can sign in.'
      : 'We received a request to reset your password.'}</p>`,
    `<p><a href="${resetLink}">${firstSet ? 'Set your password' : 'Reset your password'}</a> (expires in ${expiresInHours} hours)</p>`,
    reminder.html,
    `<p><strong>${JUNK_NOTICE}</strong></p>`,
    `<p>${OPTIONAL_RECOVERY_NOTICE}</p>`
  ].join('');

  try {
    const template = await EmailTemplateService.getTemplateForAgency(agency?.id || null, 'password_reset');
    if (template?.body) {
      const params = await EmailTemplateService.collectParameters(user, agency, {
        passwordlessToken: token,
        senderName: 'System',
        keepPortalLoginLink: true
      });
      // Always expose login username as work/login email for templates.
      if (loginEmail) {
        params.USERNAME = loginEmail;
        params.LOGIN_EMAIL = loginEmail;
        params.WORK_EMAIL = loginEmail;
      }
      const rendered = EmailTemplateService.renderTemplate(template, params);
      subject = rendered.subject || subject;
      body = rendered.body || body;
      if (loginEmail && !String(body).toLowerCase().includes(String(loginEmail).toLowerCase())) {
        body = `${body}\n\nYour login email / username is: ${loginEmail}`;
      }
      if (!String(body).includes(resetLink)) body = `${body}\n\n${firstSet ? 'Set' : 'Reset'} your password: ${resetLink}`;
      if (!String(body).includes(OPTIONAL_RECOVERY_NOTICE)) body = `${body}\n\n${OPTIONAL_RECOVERY_NOTICE}`;
      if (!String(body).includes('Junk')) body = `${body}\n\n${JUNK_NOTICE}`;
      html = `<pre style="font-family:inherit;white-space:pre-wrap;">${String(body)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre><p><a href="${resetLink}">${firstSet ? 'Set' : 'Reset'} your password</a></p>`;
    }
  } catch {
    /* keep defaults */
  }

  return { subject, body, html, resetLink, firstSet, loginEmail };
}

async function sendResetEmail({
  agencyId,
  logAgencyId,
  to,
  subject,
  text,
  html,
  userId,
  existingCommunicationId
}) {
  const { identity, replyTo } = await resolveRecoverySender(agencyId);
  const result = await sendEmailFromIdentity({
    senderIdentityId: identity.id,
    to, subject, text, html,
    replyToOverride: replyTo,
    source: 'manual',
    userId,
    existingCommunicationId,
    templateType: 'password_reset',
    usedFallbackSender: false
  });
  return { ...result, fromEmail: identity.from_email, replyTo };
}

/**
 * @returns {{
 *   ok: true,
 *   outcome: 'sent'|'failed'|'sso_required'|'unknown_user'|'no_recipient'|'support_requested',
 *   communicationId?: number|null,
 *   resetLink?: string|null,
 *   sendResult?: object|null,
 *   deliveryStatus?: string|null,
 *   error?: string|null
 * }}
 */
export async function requestPasswordRecoveryEmail({
  email,
  organizationSlug = null,
  req = null,
  includeDebug = false,
  targetUser = null,
  existingTokenResult = null,
  generatedByUserId = null
} = {}) {
  const requestedEmail = String(email || '').trim().toLowerCase();
  const orgSlug = normalizeOrgSlug(organizationSlug);

  if (!requestedEmail && !targetUser?.id) {
    return { ok: true, outcome: 'unknown_user' };
  }

  const found = targetUser || await User.findByEmail(requestedEmail);
  if (!found?.id) {
    return { ok: true, outcome: 'unknown_user' };
  }

  const user = targetUser || (await User.findById(found.id)) || found;
  if (passwordRecoveryRequiresSupport(user)) {
    const agency = await resolveContextAgency({ userId: user.id, orgSlug });
    const ticketId = await createPasswordRecoverySupportTicket({
      user, agency, requestedEmail, generatedByUserId, replyEmail: pickRecipientEmail(user, requestedEmail)
    });
    return { ok: true, outcome: 'support_requested', ticketId };
  }
  if ((await getPasswordRecoverySsoState(user)).ssoRequired) {
    return { ok: true, outcome: 'sso_required' };
  }
  const agency = await resolveContextAgency({ userId: user.id, orgSlug });
  const loginEmail = resolveLoginEmail(user);
  const to = pickRecipientEmail(user, requestedEmail);
  // Sender, branding, and communication history belong to the account tenant.
  const logAgencyId = agency.id;

  if (!to) {
    return { ok: true, outcome: 'no_recipient' };
  }

  const tokenResult = existingTokenResult || await User.generatePasswordlessToken(user.id, RESET_HOURS, 'reset');
  const { subject, body, html, resetLink, firstSet } = await buildMessage({
    user,
    agency,
    orgSlug,
    token: tokenResult.token,
    expiresInHours: tokenResult.expiresInHours || RESET_HOURS,
    loginEmail
  });

  const isDemoRedirect =
    looksLikeTestInboxRedirectAddress(to) ||
    (await shouldRedirectHogwartsOutboundEmail(to).catch(() => false));

  let comm = null;
  try {
    comm = await CommunicationLoggingService.logGeneratedCommunication({
      userId: user.id,
      agencyId: logAgencyId,
      templateType: 'password_reset',
      templateId: null,
      subject,
      body,
      generatedByUserId,
      channel: 'email',
      recipientAddress: to,
      metadata: {
        orgSlug: orgSlug || null,
        contextAgencyId: agency?.id || null,
        firstSet,
        loginEmail: loginEmail || null,
        requestedEmail,
        recoveryRecipient: to,
        ...(isDemoRedirect ? { demoOrFakeRecipient: true } : {})
      }
    });
  } catch (e) {
    console.error('[passwordRecovery] failed to log communication', e?.message || e);
  }

  const logRecoveryDelivery = (deliveryStatus, { sendResult = null, error = null } = {}) => {
    const actor = generatedByUserId && Number(req?.user?.id) === Number(generatedByUserId) ? req.user : null;
    ActivityLogService.logActivity({
      actionType: deliveryStatus === 'sent' ? 'password_reset_link_sent' : 'password_reset_email_failed',
      userId: user.id,
      agencyId: logAgencyId,
      metadata: {
        performedByUserId: generatedByUserId,
        performedByName: actor ? [actor.first_name, actor.last_name].filter(Boolean).join(' ') || null : null,
        performedByEmail: actor?.email || actor?.username || null,
        requestSource: generatedByUserId
          ? (String(req?.originalUrl || '').includes('/school-portal/') ? 'school_portal' : 'admin_profile')
          : 'public_forgot_password',
        email: to,
        loginEmail: loginEmail || null,
        requestedEmail,
        role: user.role || null,
        firstSet,
        orgSlug: orgSlug || null,
        communicationId: comm?.id || null,
        deliveryStatus,
        fromEmail: sendResult?.fromEmail || null,
        replyTo: sendResult?.replyTo || null,
        error: error ? String(error).replaceAll(tokenResult.token, '[redacted]').slice(0, 500) : null,
        ...(isDemoRedirect ? { demoRedirectedToTesting: true } : {})
      }
    }, req);
  };

  let sendResult = null;
  try {
    sendResult = await sendResetEmail({
      agencyId: agency?.id || logAgencyId,
      logAgencyId,
      to,
      subject,
      text: body,
      html,
      userId: user.id,
      existingCommunicationId: comm?.id || null
    });
  } catch (e) {
    await markCommFailed(comm?.id, e?.message || 'send failed');
    logRecoveryDelivery('failed', { error: e?.message || 'Send failed' });
    return {
      ok: true,
      outcome: 'failed',
      communicationId: comm?.id || null,
      resetLink: includeDebug ? resetLink : null,
      error: String(e?.message || e),
      deliveryStatus: 'failed'
    };
  }

  if (!sendResult?.id || sendResult?.skipped || sendResult?.blocked || sendResult?.queued) {
    const errMsg =
      (Array.isArray(sendResult.qualityFlags)
        ? sendResult.qualityFlags.map((f) => f.message || f.code).join('; ')
        : '') ||
      sendResult.reason ||
      (sendResult.queued ? 'pending approval' : 'not sent');
    await markCommFailed(comm?.id, errMsg);
    logRecoveryDelivery('failed', { sendResult, error: errMsg });
    return {
      ok: true,
      outcome: 'failed',
      communicationId: comm?.id || null,
      resetLink: includeDebug ? resetLink : null,
      sendResult: includeDebug ? sendResult : null,
      error: String(errMsg),
      deliveryStatus: 'failed'
    };
  }

  if (comm?.id && sendResult?.id) {
    await CommunicationLoggingService.markAsSent(comm.id, sendResult.id, {
      ...(isDemoRedirect
        ? {
            testInboxRedirect: true,
            originalTo: to,
            deliveredTo: 'testing@itsco.health',
            demoOrFakeRecipient: true
          }
        : {})
    }).catch(() => {});
  }

  logRecoveryDelivery('sent', { sendResult });

  return {
    ok: true,
    outcome: 'sent',
    communicationId: comm?.id || null,
    resetLink: includeDebug ? resetLink : null,
    sendResult: includeDebug ? sendResult : null,
    deliveryStatus: 'sent',
    redirected: !!isDemoRedirect,
    ...(includeDebug
      ? { loginEmail: loginEmail || null, recipientEmail: to, requestedEmail }
      : {})
  };
}
