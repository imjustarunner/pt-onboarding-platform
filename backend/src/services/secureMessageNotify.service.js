/**
 * Secure client/guardian message notifications.
 * Email from securemessage@tenant with noreply reply-to; deep link to thread after login/setup.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import { sendEmailFromIdentity, sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function safeRedirectPath(path) {
  const p = String(path || '').trim();
  if (!p.startsWith('/')) return null;
  if (p.startsWith('//') || p.includes('://')) return null;
  return p.slice(0, 500);
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
  const email = String(recipientEmail || '').trim().toLowerCase();
  if (!email) return { sent: false, reason: 'no_email' };

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
      clientId,
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

  const subject = `You have received a secure message from your provider`;
  const html = `
    <p>You have received a secure message from <strong>${senderName}</strong> at ${tenant}.</p>
    <p><a href="${claimUrl}">Open your secure message</a></p>
    <p style="color:#64748b;font-size:12px">
      This notification was sent from a secure-message address. Replies to this email go to an unmonitored inbox
      (noreply) and will not be read. Please use the link above to view and reply securely in the app.
    </p>
  `;

  let sendResult = null;
  if (settings.secureMessageSenderIdentityId) {
    sendResult = await sendEmailFromIdentity({
      senderIdentityId: settings.secureMessageSenderIdentityId,
      to: email,
      subject,
      html,
      text: `You have received a secure message from ${senderName}. Open: ${claimUrl}`,
      replyTo: settings.noreplySenderIdentityId ? undefined : `noreply@${String(email.split('@')[1] || 'plottwisthq.com')}`,
      source: 'auto',
      generatedByUserId: senderUserId,
      templateType: 'secure_message_notification',
      userId: recipientUserId,
      clientId
    });
  } else {
    sendResult = await sendNotificationEmail({
      to: email,
      subject,
      html,
      text: `You have received a secure message from ${senderName}. Open: ${claimUrl}`,
      agencyId,
      userId: recipientUserId,
      clientId,
      templateType: 'secure_message_notification',
      source: 'auto',
      generatedByUserId: senderUserId
    });
  }

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
  sendSecureMessageNotification,
  resolveSecureMessageClaim,
  markSecureMessageRead,
  buildSecureClaimRedirect
};
