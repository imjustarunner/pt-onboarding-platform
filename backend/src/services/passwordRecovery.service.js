/**
 * Password recovery (Forgot Password) — first principles
 *
 * Rules:
 * 1. Any non-archived user may request a reset/set-password link.
 * 2. Password state does not matter: never set, temporary (active or expired),
 *    or lasting password (active or expired).
 * 3. Archived users do not receive email; the attempt is logged as failed so
 *    ops can see “archived person tried to recover.”
 * 4. Always write a user_communications row (sent or failed) — never silent.
 * 5. Captcha is not part of this flow (public login / local often have none).
 */

import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import EmailTemplateService from './emailTemplate.service.js';
import CommunicationLoggingService from './communicationLogging.service.js';
import ActivityLogService from './activityLog.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';
import EmailService from './email.service.js';
import { userNeedsFirstPasswordSet } from '../utils/schoolStaffPasswordRecovery.js';
import {
  looksLikeTestInboxRedirectAddress,
  shouldRedirectHogwartsOutboundEmail
} from '../utils/hogwartsTestEmail.js';

const RESET_HOURS = 48;
const JUNK_NOTICE =
  'Important: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.';

const ITSCO_AGENCY_ID = Number(
  process.env.SCHOOL_INTAKE_REVIEW_AGENCY_ID || process.env.ITSCO_AGENCY_ID || 2
);

function normalizeOrgSlug(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function pickRecipientEmail(user, requestedEmail = null) {
  const requested = String(requestedEmail || '').trim().toLowerCase();
  const candidates = [
    requested || null,
    user?.email || null,
    user?.username || null,
    user?.work_email || null,
    user?.personal_email || null
  ]
    .map((v) => (v ? String(v).trim().toLowerCase() : null))
    .filter(Boolean);
  return candidates.find((v) => v.includes('@')) || null;
}

function isArchivedUser(user) {
  if (!user) return false;
  if (user.is_archived === true || user.is_archived === 1) return true;
  return String(user.status || '').trim().toUpperCase() === 'ARCHIVED';
}

async function resolveAgencyFromOrgSlug(orgSlug) {
  const slug = normalizeOrgSlug(orgSlug);
  if (!slug) return null;
  return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug)) || null;
}

async function resolveContextAgency({ userId, orgSlug }) {
  const fromSlug = await resolveAgencyFromOrgSlug(orgSlug);
  if (fromSlug?.id) return fromSlug;
  try {
    const agencies = await User.getAgencies(userId);
    return agencies?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Prefer Technology@ / login_recovery on ITSCO (or parent), then user agency.
 */
async function resolveRecoverySender(agencyId, userId = null) {
  const candidates = [];
  const add = (id) => {
    const n = Number(id || 0);
    if (Number.isFinite(n) && n > 0 && !candidates.includes(n)) candidates.push(n);
  };

  add(ITSCO_AGENCY_ID);
  add(agencyId);
  if (agencyId) {
    try {
      const OrganizationAffiliation = (await import('../models/OrganizationAffiliation.model.js')).default;
      add(await OrganizationAffiliation.getActiveAgencyIdForOrganization(Number(agencyId)));
    } catch {
      /* best effort */
    }
  }
  if (userId) {
    try {
      const agencies = await User.getAgencies(userId);
      for (const a of agencies || []) add(a?.id);
    } catch {
      /* best effort */
    }
  }

  for (const aid of candidates) {
    const resolved = await resolveSenderIdentityForSend({
      agencyId: aid,
      templateType: 'password_reset',
      preferredKeys: ['technology', 'login_recovery', 'notifications']
    });
    if (resolved?.identity?.id) {
      return { ...resolved, resolvedAgencyId: aid };
    }
  }
  return { identity: null, usedFallback: true, resolution: 'none', resolvedAgencyId: agencyId || ITSCO_AGENCY_ID };
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

async function logDeniedArchived({ user, agencyId, to, requestedEmail, orgSlug, req }) {
  ActivityLogService.logActivity(
    {
      actionType: 'password_reset_link_sent',
      userId: user.id,
      metadata: {
        denied: true,
        reason: 'archived',
        email: requestedEmail,
        role: user.role || null,
        orgSlug: orgSlug || null
      }
    },
    req
  );

  const comm = await CommunicationLoggingService.logGeneratedCommunication({
    userId: user.id,
    agencyId: agencyId || ITSCO_AGENCY_ID,
    templateType: 'password_reset',
    templateId: null,
    subject: 'Password reset denied — archived account',
    body: `Forgot-password requested for archived account ${requestedEmail}. No email sent.`,
    generatedByUserId: null,
    channel: 'email',
    recipientAddress: to || requestedEmail,
    metadata: { denied: true, reason: 'archived' }
  }).catch(() => null);

  await markCommFailed(comm?.id, 'Archived account — password reset email not sent');
  return { outcome: 'archived', communicationId: comm?.id || null };
}

async function buildMessage({ user, agency, orgSlug, token }) {
  const resetLink = EmailTemplateService.buildResetTokenLink(
    agency || { portal_url: orgSlug, slug: orgSlug },
    token
  );
  const firstSet = userNeedsFirstPasswordSet(user);
  let subject = firstSet ? 'Set your password' : 'Reset your password';
  let body = [
    firstSet
      ? 'Use this link to set a password for your account so you can sign in.'
      : 'We received a request to reset your password.',
    '',
    `${firstSet ? 'Set your password' : 'Reset your password'} using this link (expires in ${RESET_HOURS} hours):`,
    resetLink,
    '',
    JUNK_NOTICE,
    '',
    'If you did not request this, you can ignore this email.'
  ].join('\n');
  let html = [
    `<p>${firstSet
      ? 'Use this link to set a password for your account so you can sign in.'
      : 'We received a request to reset your password.'}</p>`,
    `<p><a href="${resetLink}">${firstSet ? 'Set your password' : 'Reset your password'}</a> (expires in ${RESET_HOURS} hours)</p>`,
    `<p><strong>${JUNK_NOTICE}</strong></p>`,
    '<p>If you did not request this, you can ignore this email.</p>'
  ].join('');

  try {
    const template = await EmailTemplateService.getTemplateForAgency(agency?.id || null, 'password_reset');
    if (template?.body) {
      const params = await EmailTemplateService.collectParameters(user, agency, {
        passwordlessToken: token,
        senderName: 'System',
        keepPortalLoginLink: true
      });
      const rendered = EmailTemplateService.renderTemplate(template, params);
      subject = rendered.subject || subject;
      body = rendered.body || body;
      if (!String(body).includes('Junk')) body = `${body}\n\n${JUNK_NOTICE}`;
      html = `<pre style="font-family:inherit;white-space:pre-wrap;">${String(body)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>`;
    }
  } catch {
    /* keep defaults */
  }

  return { subject, body, html, resetLink, firstSet };
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
  const resolved = await resolveRecoverySender(agencyId, userId);
  if (resolved?.identity?.id) {
    return sendEmailFromIdentity({
      senderIdentityId: resolved.identity.id,
      to,
      subject,
      text,
      html,
      source: 'manual',
      agencyId: logAgencyId || resolved.resolvedAgencyId || agencyId,
      userId,
      existingCommunicationId,
      templateType: 'password_reset',
      usedFallbackSender: false
    });
  }

  return EmailService.sendEmail({
    to,
    subject,
    text,
    html,
    fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
    fromAddress:
      process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
    replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
    source: 'manual',
    agencyId: logAgencyId || agencyId || ITSCO_AGENCY_ID,
    userId,
    existingCommunicationId,
    templateType: 'password_reset',
    usedFallbackSender: !(await shouldRedirectHogwartsOutboundEmail(to))
  });
}

/**
 * @returns {{
 *   ok: true,
 *   outcome: 'sent'|'failed'|'archived'|'unknown_user'|'no_recipient',
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
  includeDebug = false
} = {}) {
  const requestedEmail = String(email || '').trim().toLowerCase();
  const orgSlug = normalizeOrgSlug(organizationSlug);

  if (!requestedEmail) {
    return { ok: true, outcome: 'unknown_user' };
  }

  const found = await User.findByEmail(requestedEmail).catch(() => null);
  if (!found?.id) {
    return { ok: true, outcome: 'unknown_user' };
  }

  const user = (await User.findById(found.id).catch(() => null)) || found;
  const agency = await resolveContextAgency({ userId: user.id, orgSlug });
  const to = pickRecipientEmail(user, requestedEmail);
  // Attribute Automations row to ITSCO when possible so tenant ops always see it.
  const logAgencyId = ITSCO_AGENCY_ID || agency?.id || null;

  if (isArchivedUser(user)) {
    const denied = await logDeniedArchived({
      user,
      agencyId: logAgencyId,
      to,
      requestedEmail,
      orgSlug,
      req
    });
    return { ok: true, ...denied };
  }

  if (!to) {
    return { ok: true, outcome: 'no_recipient' };
  }

  const tokenResult = await User.generatePasswordlessToken(user.id, RESET_HOURS, 'reset');
  const { subject, body, html, resetLink, firstSet } = await buildMessage({
    user,
    agency,
    orgSlug,
    token: tokenResult.token
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
      generatedByUserId: null,
      channel: 'email',
      recipientAddress: to,
      metadata: {
        orgSlug: orgSlug || null,
        contextAgencyId: agency?.id || null,
        firstSet,
        ...(isDemoRedirect ? { demoOrFakeRecipient: true } : {})
      }
    });
  } catch (e) {
    console.error('[passwordRecovery] failed to log communication', e?.message || e);
  }

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
    return {
      ok: true,
      outcome: 'failed',
      communicationId: comm?.id || null,
      resetLink: includeDebug ? resetLink : null,
      error: String(e?.message || e),
      deliveryStatus: 'failed'
    };
  }

  if (sendResult?.skipped || sendResult?.blocked || sendResult?.queued) {
    const errMsg =
      (Array.isArray(sendResult.qualityFlags)
        ? sendResult.qualityFlags.map((f) => f.message || f.code).join('; ')
        : '') ||
      sendResult.reason ||
      (sendResult.queued ? 'pending approval' : 'not sent');
    await markCommFailed(comm?.id, errMsg);
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
      fromEmail: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || null,
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

  ActivityLogService.logActivity(
    {
      actionType: 'password_reset_link_sent',
      userId: user.id,
      metadata: {
        email: to,
        role: user.role || null,
        firstSet,
        orgSlug: orgSlug || null,
        communicationId: comm?.id || null,
        ...(isDemoRedirect ? { demoRedirectedToTesting: true } : {})
      }
    },
    req
  );

  return {
    ok: true,
    outcome: 'sent',
    communicationId: comm?.id || null,
    resetLink: includeDebug ? resetLink : null,
    sendResult: includeDebug ? sendResult : null,
    deliveryStatus: 'sent',
    redirected: !!isDemoRedirect
  };
}
