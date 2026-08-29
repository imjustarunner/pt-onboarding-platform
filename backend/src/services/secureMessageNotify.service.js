/**
 * Secure client/guardian message notifications.
 * Email from securemessage@tenant with noreply reply-to; deep link to thread after login/setup.
 *
 * Secure notify is only for clinical + school clients/guardians.
 * Learning clients get a regular (non-claim-link) email instead.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import { sendEmailFromIdentity, sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

const SECURE_MESSAGE_CLIENT_TYPES = new Set(['clinical', 'school']);

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function safeRedirectPath(path) {
  const p = String(path || '').trim();
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//') || p.includes('://')) return null;
  return p.slice(0, 500);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Secure portal notify emails: clinical + school only. */
export function isSecureMessageEligibleClientType(clientType) {
  return SECURE_MESSAGE_CLIENT_TYPES.has(String(clientType || '').toLowerCase());
}

/**
 * Resolve client id + type for a notify recipient (guardian or client user).
 * Prefer an explicit clientId; otherwise look up guardianship / clients.user_id.
 * When multiple clients exist, prefer clinical/school over learning.
 */
export async function resolveClientContextForMessageNotify({
  agencyId,
  recipientUserId = null,
  clientId = null
} = {}) {
  const aid = Number(agencyId);
  if (!aid) return { clientId: null, clientType: null };

  if (clientId) {
    const [rows] = await pool.execute(
      `SELECT id, LOWER(COALESCE(client_type, '')) AS client_type
       FROM clients
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [Number(clientId), aid]
    );
    if (rows?.[0]) {
      return { clientId: Number(rows[0].id), clientType: rows[0].client_type || null };
    }
  }

  const uid = Number(recipientUserId);
  if (!uid) return { clientId: null, clientType: null };

  const [rows] = await pool.execute(
    `SELECT c.id, LOWER(COALESCE(c.client_type, '')) AS client_type
     FROM clients c
     LEFT JOIN client_guardians cg ON cg.client_id = c.id AND cg.guardian_user_id = ?
     WHERE c.agency_id = ?
       AND (c.user_id = ? OR cg.guardian_user_id = ?)
     ORDER BY
       CASE LOWER(COALESCE(c.client_type, ''))
         WHEN 'clinical' THEN 0
         WHEN 'school' THEN 1
         WHEN 'learning' THEN 2
         ELSE 3
       END,
       c.id ASC
     LIMIT 1`,
    [uid, aid, uid, uid]
  );
  if (!rows?.[0]) return { clientId: null, clientType: null };
  return { clientId: Number(rows[0].id), clientType: rows[0].client_type || null };
}

/**
 * Regular email for learning clients/guardians when staff messages them.
 * Includes message text (not a secure-message claim link).
 */
export async function sendLearningClientMessageEmail({
  agencyId,
  senderUserId,
  recipientUserId = null,
  recipientEmail,
  clientId = null,
  chatThreadId = null,
  messageBody = ''
} = {}) {
  const email = String(recipientEmail || '').trim().toLowerCase();
  if (!email) return { sent: false, reason: 'no_email' };

  const agency = await Agency.findById(agencyId);
  const sender = await User.findById(senderUserId);
  const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(' ') || 'Your team';
  const tenant = agency?.name || 'your learning team';
  const slug = agency?.slug || '';
  const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(
    /\/$/,
    ''
  );
  const messagesUrl = chatThreadId
    ? `${baseUrl}/${slug}/messages?view=workspace&threadId=${chatThreadId}`
    : `${baseUrl}/${slug}/messages`;

  const plainBody = String(messageBody || '').trim() || '(attachment or empty message)';
  const subject = `New message from ${senderName}`;
  const html = `
    <p><strong>${escapeHtml(senderName)}</strong> at ${escapeHtml(tenant)} sent you a message:</p>
    <blockquote style="margin:1em 0;padding:0.75em 1em;border-left:3px solid #cbd5e1;background:#f8fafc;white-space:pre-wrap;">${escapeHtml(plainBody)}</blockquote>
    <p><a href="${escapeHtml(messagesUrl)}">Open in Messages</a></p>
  `;
  const text = `${senderName} at ${tenant} sent you a message:\n\n${plainBody}\n\nOpen: ${messagesUrl}`;

  const sendResult = await sendNotificationEmail({
    to: email,
    subject,
    html,
    text,
    agencyId,
    userId: recipientUserId,
    clientId,
    templateType: 'learning_client_message',
    source: 'auto',
    generatedByUserId: senderUserId
  });

  return {
    sent: true,
    channel: 'email',
    communicationId: sendResult?.communicationId || null
  };
}

function domainFromEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return null;
  const domain = e.slice(at + 1).replace(/[^a-z0-9.-]/g, '');
  return domain || null;
}

async function inferAgencyMailDomain(agencyId) {
  const { default: EmailSenderIdentity } = await import('../models/EmailSenderIdentity.model.js');
  const list = await EmailSenderIdentity.list({
    agencyId,
    includePlatformDefaults: false,
    onlyActive: true
  });
  const preferKeys = ['support', 'notifications', 'forms', 'people_operations', 'technology'];
  for (const key of preferKeys) {
    const hit = (list || []).find((i) => String(i.identity_key || '').toLowerCase() === key);
    const domain = domainFromEmail(hit?.from_email);
    if (domain && !domain.includes('plottwisthq.com') && !domain.includes('gmail.com')) return domain;
  }
  for (const i of list || []) {
    if (String(i.identity_key || '').toLowerCase().startsWith('personal_')) continue;
    const domain = domainFromEmail(i.from_email);
    if (domain && !domain.includes('plottwisthq.com') && !domain.includes('gmail.com')) return domain;
  }
  const agency = await Agency.findById(agencyId);
  const slug = String(agency?.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (slug === 'itsco') return 'itsco.health';
  return null;
}

/**
 * Resolve From = securemessage@tenant and Reply-To = noreply@tenant.
 * Creates identities on first use when the tenant mail domain is known.
 */
async function ensureSecureMessageMailboxes(agencyId) {
  const { default: EmailSenderIdentity } = await import('../models/EmailSenderIdentity.model.js');
  const { default: AgencyEmailSettings } = await import('../models/AgencyEmailSettings.model.js');
  const settings = await getAgencyEmailSettings(agencyId);

  let fromIdentity = settings.secureMessageSenderIdentityId
    ? await EmailSenderIdentity.findById(settings.secureMessageSenderIdentityId)
    : null;
  if (!fromIdentity) {
    fromIdentity =
      (await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'secure_message')) ||
      (await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'securemessage'));
  }

  let noreplyIdentity = settings.noreplySenderIdentityId
    ? await EmailSenderIdentity.findById(settings.noreplySenderIdentityId)
    : null;
  if (!noreplyIdentity) {
    noreplyIdentity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'noreply');
  }

  const domain = await inferAgencyMailDomain(agencyId);
  if (!fromIdentity && domain) {
    fromIdentity = await EmailSenderIdentity.create({
      agencyId,
      identityKey: 'secure_message',
      displayName: 'Secure Messages',
      fromEmail: `securemessage@${domain}`,
      replyTo: `noreply@${domain}`,
      isActive: true
    });
  }
  if (!noreplyIdentity && domain) {
    noreplyIdentity = await EmailSenderIdentity.create({
      agencyId,
      identityKey: 'noreply',
      displayName: 'No Reply',
      fromEmail: `noreply@${domain}`,
      replyTo: `noreply@${domain}`,
      isActive: true
    });
  }

  const noreplyEmail =
    String(noreplyIdentity?.from_email || '').trim() ||
    (domain ? `noreply@${domain}` : null);

  // Persist linked identities when we auto-created / discovered them
  const nextSecureId = fromIdentity?.id || null;
  const nextNoreplyId = noreplyIdentity?.id || null;
  if (
    (nextSecureId && Number(settings.secureMessageSenderIdentityId) !== Number(nextSecureId)) ||
    (nextNoreplyId && Number(settings.noreplySenderIdentityId) !== Number(nextNoreplyId))
  ) {
    try {
      await AgencyEmailSettings.update({
        agencyId,
        secureMessageSenderIdentityId: nextSecureId || settings.secureMessageSenderIdentityId,
        noreplySenderIdentityId: nextNoreplyId || settings.noreplySenderIdentityId
      });
    } catch (e) {
      console.warn('[secureMessageNotify] could not persist mailbox ids:', e?.message || e);
    }
  }

  return { fromIdentity, noreplyIdentity, noreplyEmail, domain };
}

export async function sendSecureMessageNotification({
  agencyId,
  senderUserId,
  recipientUserId = null,
  recipientEmail,
  clientId = null,
  chatThreadId = null,
  conversationId = null,
  messageId = null,
  messageSource = 'chat'
}) {
  const settings = await getAgencyEmailSettings(agencyId);
  if (!settings.secureClientMessageEmailEnabled) {
    return { sent: false, reason: 'disabled' };
  }

  const ctx = await resolveClientContextForMessageNotify({
    agencyId,
    recipientUserId,
    clientId
  });
  const resolvedClientId = ctx.clientId || clientId || null;
  const clientType = ctx.clientType;
  // Unknown type: do not send secure (avoids learning/basic getting secure by accident).
  // Callers that know clinical/school should pass clientId.
  if (!isSecureMessageEligibleClientType(clientType)) {
    return {
      sent: false,
      reason: clientType === 'learning' ? 'learning_uses_regular_email' : 'client_type_not_eligible',
      clientType: clientType || null,
      clientId: resolvedClientId
    };
  }

  const email = String(recipientEmail || '').trim().toLowerCase();
  if (!email) return { sent: false, reason: 'no_email' };

  const mailboxes = await ensureSecureMessageMailboxes(agencyId);
  if (!mailboxes.fromIdentity?.id) {
    return { sent: false, reason: 'secure_message_identity_missing' };
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = sha256(rawToken);
  const [ins] = await pool.execute(
    `INSERT INTO secure_message_notifications
      (agency_id, conversation_id, chat_thread_id, message_id, message_source,
       sender_user_id, recipient_user_id, recipient_email, client_id, notification_token_hash, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      agencyId,
      conversationId,
      chatThreadId,
      messageId,
      messageSource,
      senderUserId,
      recipientUserId,
      email,
      resolvedClientId,
      tokenHash
    ]
  );

  const agency = await Agency.findById(agencyId);
  const sender = await User.findById(senderUserId);
  const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(' ') || 'Your provider';
  const tenant = agency?.name || 'your care team';
  const slug = agency?.slug || '';
  const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(/\/$/, '');
  const deepPath = safeRedirectPath(
    chatThreadId
      ? `/${slug}/messages?view=workspace&threadId=${chatThreadId}`
      : (conversationId ? `/${slug}/admin/communications?mode=home&conversationId=${conversationId}` : `/${slug}/messages`)
  ) || '/messages';
  // Public claim URL that routes to setup or login then redirects to message
  const claimUrl = `${baseUrl}/secure-message/${encodeURIComponent(rawToken)}`;

  const subject = `You have a secure message from your provider`;
  const html = `
    <p>You have a secure message from your provider on our portal.</p>
    <p><strong>${escapeHtml(senderName)}</strong> at ${escapeHtml(tenant)} sent you a message.</p>
    <p><a href="${claimUrl}">Click this link to sign in and access your message</a></p>
    <p style="color:#64748b;font-size:12px">
      If you have not set a password yet, you will create one and then sign in to read the message.
      Replies to this email go to an unmonitored address (noreply) and will not be read —
      please use the link above to view and reply securely in the portal.
    </p>
  `;
  const text =
    `You have a secure message from your provider on our portal.\n\n` +
    `${senderName} at ${tenant} sent you a message.\n\n` +
    `Click this link to sign in and access your message:\n${claimUrl}\n\n` +
    `If you have not set a password yet, you will create one and then sign in to read the message.`;

  const sendResult = await sendEmailFromIdentity({
    senderIdentityId: mailboxes.fromIdentity.id,
    to: email,
    subject,
    html,
    text,
    replyToOverride: mailboxes.noreplyEmail || undefined,
    source: 'auto',
    generatedByUserId: senderUserId,
    templateType: 'secure_message_notification',
    userId: recipientUserId,
    clientId: resolvedClientId
  });

  if (sendResult?.communicationId) {
    await pool.execute(
      `UPDATE secure_message_notifications SET user_communication_id = ? WHERE id = ?`,
      [sendResult.communicationId, ins.insertId]
    );
  }

  return {
    sent: true,
    id: ins.insertId,
    claimUrl,
    deepPath,
    fromEmail: mailboxes.fromIdentity.from_email,
    replyTo: mailboxes.noreplyEmail,
    tokenShownOnce: rawToken
  };
}

export async function resolveSecureMessageClaim(rawToken) {
  const hash = sha256(rawToken);
  const [rows] = await pool.execute(
    `SELECT * FROM secure_message_notifications WHERE notification_token_hash = ? LIMIT 1`,
    [hash]
  );
  const row = rows?.[0];
  if (!row) return null;
  return row;
}

export async function markSecureMessageRead({
  notificationId,
  userId = null,
  via = 'secure_portal',
  userAgent = null,
  ip = null
}) {
  const ipHash = ip ? sha256(ip) : null;
  await pool.execute(
    `UPDATE secure_message_notifications
     SET first_read_at = COALESCE(first_read_at, NOW()),
         first_read_via = COALESCE(first_read_via, ?),
         first_read_user_agent = COALESCE(first_read_user_agent, ?),
         first_read_ip_hash = COALESCE(first_read_ip_hash, ?)
     WHERE id = ?`,
    [via, userAgent ? String(userAgent).slice(0, 512) : null, ipHash, notificationId]
  );
  return { ok: true, approximateContextOnly: true };
}

export async function buildSecureClaimRedirect(row) {
  const agency = await Agency.findById(row.agency_id);
  const slug = agency?.slug || '';
  const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(/\/$/, '');
  let recipient = null;
  if (row.recipient_user_id) {
    recipient = await User.findById(row.recipient_user_id);
  } else if (row.recipient_email) {
    const [u] = await pool.execute(
      `SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(personal_email) = ? LIMIT 1`,
      [String(row.recipient_email).toLowerCase(), String(row.recipient_email).toLowerCase()]
    );
    recipient = u?.[0] || null;
  }

  const targetPath = row.chat_thread_id
    ? `/${slug}/messages?view=workspace&threadId=${row.chat_thread_id}&secure=1`
    : `/${slug}/messages?secure=1`;

  const needsSetup = !recipient?.password_hash;
  if (!recipient) {
    return {
      mode: 'unknown',
      loginUrl: `${baseUrl}/${slug}/login?redirect=${encodeURIComponent(targetPath)}`,
      targetPath
    };
  }
  if (needsSetup) {
    // Issue setup token
    const token = await User.generatePasswordlessToken(recipient.id, 48, 'setup');
    return {
      mode: 'setup',
      setupUrl: `${baseUrl}/${slug}/passwordless-login/${encodeURIComponent(token)}?redirect=${encodeURIComponent(targetPath)}`,
      targetPath,
      userId: recipient.id
    };
  }
  return {
    mode: 'login',
    loginUrl: `${baseUrl}/${slug}/login?redirect=${encodeURIComponent(targetPath)}`,
    targetPath,
    userId: recipient.id
  };
}

export default {
  isSecureMessageEligibleClientType,
  resolveClientContextForMessageNotify,
  sendLearningClientMessageEmail,
  sendSecureMessageNotification,
  resolveSecureMessageClaim,
  markSecureMessageRead,
  buildSecureClaimRedirect
};
