import { getGmailClient, getImpersonatedUser } from './gmailClient.js';
import { base64UrlEncode, buildMimeMessage } from './mime.js';
import pool from '../../config/database.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import NotificationTrigger from '../../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../../models/AgencyNotificationTriggerSetting.model.js';
import UserCommunication from '../../models/UserCommunication.model.js';
import CommunicationLoggingService from '../communicationLogging.service.js';
import { logContactCommunicationIfApplicable } from '../contactCommsLogging.service.js';
import { getEmailSendingMode, isEmailNotificationsEnabled } from '../emailSettings.service.js';

async function canSendEmail({ source, agencyId } = {}) {
  const mode = await getEmailSendingMode();
  if (mode === 'manual_only' && String(source || '').trim().toLowerCase() !== 'manual') {
    return { allowed: false, reason: 'manual_only' };
  }
  const notificationsAllowed = await isEmailNotificationsEnabled({ agencyId, source });
  if (!notificationsAllowed) {
    return { allowed: false, reason: 'notifications_disabled' };
  }
  return { allowed: true };
}

function pickFromHeader({ displayName, fromEmail }) {
  const email = String(fromEmail || '').trim();
  if (!email) throw new Error('Missing fromEmail');
  const name = String(displayName || '').trim();
  return name ? `${name} <${email}>` : email;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAbsoluteSignatureImageUrl(identity) {
  const rawUrl = String(identity?.signature_image_url || '').trim();
  const rawPath = String(identity?.signature_image_path || '').trim();
  const backendBase = String(
    process.env.BACKEND_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    ''
  ).replace(/\/$/, '');

  if (rawUrl && /^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl && rawUrl.startsWith('/') && backendBase) return `${backendBase}${rawUrl}`;
  if (rawUrl && rawUrl.startsWith('uploads/') && backendBase) return `${backendBase}/${rawUrl}`;

  if (rawPath && /^https?:\/\//i.test(rawPath)) return rawPath;
  if (rawPath && rawPath.startsWith('/') && backendBase) return `${backendBase}${rawPath}`;
  if (rawPath && rawPath.startsWith('uploads/') && backendBase) return `${backendBase}/${rawPath}`;

  return '';
}

function applySenderSignatureBlock({ identity, text = null, html = null }) {
  const imageUrl = resolveAbsoluteSignatureImageUrl(identity);
  if (!imageUrl) return { text, html };

  const alt = String(identity?.signature_alt_text || identity?.display_name || 'Signature').trim() || 'Signature';
  const label = String(identity?.display_name || '').trim();
  const textOut = `${String(text || '').trim()}\n\n${label ? `${label}\n` : ''}[Signature image attached: ${imageUrl}]`.trim();

  const imageBlock = `
    <div style="margin-top: 14px;">
      <img
        src="${escapeHtml(imageUrl)}"
        alt="${escapeHtml(alt)}"
        style="max-width: 360px; width: auto; height: auto; display: block; border: 0;"
      />
    </div>
  `.trim();

  const htmlOut = html
    ? `${String(html)}\n${imageBlock}`
    : `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">${
      String(text || '')
        .split('\n')
        .map((line) => `<p>${escapeHtml(line || '').trim() || '&nbsp;'}</p>`)
        .join('')
    }${imageBlock}</div>`;

  return { text: textOut, html: htmlOut };
}

/**
 * Best-effort lookup for a `users.id` matching the recipient email, so anonymous
 * sends (e.g., notification emails not initiated by a specific admin) can still
 * be attributed to the recipient's profile and surface in their Communications tab.
 * Returns null when no match (e.g., emailing a non-user contact address).
 */
async function resolveRecipientUserIdByEmail(to) {
  const email = String(to || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  try {
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );
    const id = Number(rows?.[0]?.id || 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Inject a 1x1 transparent tracking pixel pointing at /api/email/track-open/:token
 * into the supplied HTML. Returns the (possibly unchanged) html.
 *
 * Notes:
 *   * If `html` is empty, we return null so the caller still sends a plain-text
 *     message — pixels can only be embedded in HTML.
 *   * The pixel is appended at the very end so it doesn't interfere with the
 *     visible body. It is `display:none` and 1x1 to avoid layout impact, but is
 *     still loaded by most clients (Gmail proxies images, which actually causes
 *     opens to register the moment the recipient first views the message).
 *   * If a public base URL is not configured we silently skip injection rather
 *     than embedding a broken/relative src.
 */
function injectTrackingPixel(html, token) {
  const safeToken = String(token || '').trim();
  if (!safeToken) return html;
  if (!html || !String(html).trim()) return html;
  const baseRaw = String(
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_URL ||
    ''
  ).trim().replace(/\/$/, '');
  if (!baseRaw) return html;
  const pixelUrl = `${baseRaw}/api/email/track-open/${encodeURIComponent(safeToken)}.gif`;
  const pixel = `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none !important; width:1px; height:1px; border:0; max-height:1px; max-width:1px; opacity:0; overflow:hidden;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

async function resolveSenderIdentityForTrigger({ agencyId, triggerKey }) {
  const a = Number(agencyId);
  const key = String(triggerKey || '').trim();
  if (!a) throw new Error('agencyId is required');
  if (!key) throw new Error('triggerKey is required');

  const trigger = await NotificationTrigger.findByKey(key);
  if (!trigger) return null;

  const settings = await AgencyNotificationTriggerSetting.listForAgency(a);
  const s = (settings || []).find((x) => x.triggerKey === key) || null;

  const senderIdentityId =
    s?.senderIdentityId !== null && s?.senderIdentityId !== undefined
      ? s.senderIdentityId
      : (trigger.defaultSenderIdentityId || null);

  if (!senderIdentityId) return null;
  return await EmailSenderIdentity.findById(senderIdentityId);
}

/**
 * Send a notification email using the trigger matrix to select the correct From/Reply-To.
 *
 * Logging behaviour: every send attempts to write a `user_communications` row so the
 * recipient (and, when supplied, the related client) gets a full audit trail in their
 * Communications tab — including a tracking pixel so we can record `opened_at` later.
 *
 * @param {Object} params
 * @param {number} params.agencyId
 * @param {string} params.triggerKey - notification trigger key
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string|null} params.text
 * @param {string|null} params.html
 * @param {number|null} params.generatedByUserId - admin/user who triggered the send (optional)
 * @param {number|null} params.userId - recipient userId; auto-resolved by email when omitted
 * @param {number|null} params.clientId - client this message concerns (e.g., guardian about client)
 * @param {string|null} params.templateType - user_communications.template_type (optional)
 * @param {number|null} params.templateId - user_communications.template_id (optional)
 */
export async function sendNotificationEmail({
  agencyId,
  triggerKey,
  to,
  subject,
  text = null,
  html = null,
  attachments = null,
  generatedByUserId = null,
  userId = null,
  clientId = null,
  templateType = null,
  templateId = null,
  source = 'auto'
}) {
  const gate = await canSendEmail({ source, agencyId });
  if (!gate.allowed) {
    return { skipped: true, reason: gate.reason };
  }
  const identity = await resolveSenderIdentityForTrigger({ agencyId, triggerKey });
  if (!identity) {
    throw new Error(`No sender identity configured for trigger "${triggerKey}" (agency ${agencyId})`);
  }

  const from = pickFromHeader({ displayName: identity.display_name, fromEmail: identity.from_email });
  const replyTo = identity.reply_to || null;
  const signedContent = applySenderSignatureBlock({ identity, text, html });

  // Auto-resolve recipient user when the caller didn't supply one (so the row
  // still attributes to the right profile / guardian-as-client tab).
  let resolvedUserId = userId;
  if (!resolvedUserId && to) {
    resolvedUserId = await resolveRecipientUserIdByEmail(to);
  }

  // Generate a tracking token + inject the open pixel BEFORE we hand the HTML
  // to Gmail. We only persist the token after the row is created.
  const trackingToken = signedContent.html ? UserCommunication.generateTrackingToken() : null;
  const htmlWithPixel = signedContent.html ? injectTrackingPixel(signedContent.html, trackingToken) : signedContent.html;

  // Best-effort pre-send log so we capture the body even if Gmail send fails.
  let comm = null;
  try {
    comm = await CommunicationLoggingService.logGeneratedCommunication({
      userId: resolvedUserId || null,
      clientId: clientId || null,
      agencyId,
      templateType: templateType || `trigger:${triggerKey}`,
      templateId: templateId || null,
      subject,
      body: htmlWithPixel || signedContent.text || '',
      generatedByUserId: generatedByUserId || null,
      channel: 'email',
      recipientAddress: to,
      trackingToken,
      metadata: {
        triggerKey,
        senderIdentityId: identity.id,
        fromEmail: identity.from_email,
        replyTo: identity.reply_to || null,
        source
      }
    });
  } catch (logErr) {
    console.error('[unifiedEmail] failed to pre-log notification email', logErr?.message || logErr);
    comm = null;
  }

  const gmail = await getGmailClient();
  const mime = buildMimeMessage({
    to,
    subject,
    text: signedContent.text,
    html: htmlWithPixel,
    from,
    replyTo,
    attachments
  });
  const raw = base64UrlEncode(mime);

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  const messageId = result.data?.id || null;
  const threadId = result.data?.threadId || null;

  if (comm?.id && messageId) {
    await CommunicationLoggingService.markAsSent(comm.id, messageId, {
      threadId,
      impersonatedUser: getImpersonatedUser(),
      senderIdentityId: identity.id,
      fromEmail: identity.from_email,
      replyTo: identity.reply_to || null
    }).catch(() => {});
  }

  if (agencyId && to) {
    await logContactCommunicationIfApplicable({
      agencyId,
      channel: 'email',
      direction: 'outbound',
      recipient: to,
      body: html || text || '',
      externalRefId: messageId,
      metadata: { subject, threadId }
    }).catch(() => {});
  }

  return { id: messageId, threadId, senderIdentityId: identity.id, communicationId: comm?.id || null };
}

/**
 * Send a reply using an explicit sender identity (used by the inbound agent).
 *
 * Logs the send to `user_communications` (best-effort) so it shows up in the
 * recipient's profile and the related client's Communications tab when `clientId`
 * is supplied. Open tracking pixel is injected into the HTML body.
 */
export async function sendEmailFromIdentity({
  senderIdentityId,
  to,
  subject,
  text = null,
  html = null,
  attachments = null,
  inReplyTo = null,
  references = null,
  threadId = null,
  source = 'auto',
  /** When set, replaces identity.display_name in the From header (and signature label) only. */
  fromDisplayNameOverride = null,
  generatedByUserId = null,
  userId = null,
  clientId = null,
  templateType = null,
  templateId = null
}) {
  const identity = await EmailSenderIdentity.findById(senderIdentityId);
  if (!identity) throw new Error('Sender identity not found');
  const gate = await canSendEmail({ source, agencyId: identity?.agency_id || null });
  if (!gate.allowed) {
    return { skipped: true, reason: gate.reason };
  }

  const overrideName = String(fromDisplayNameOverride || '').trim();
  const effectiveDisplayName = overrideName || identity.display_name;
  const from = pickFromHeader({ displayName: effectiveDisplayName, fromEmail: identity.from_email });
  const replyTo = identity.reply_to || null;
  const identityForSignature =
    overrideName ? { ...identity, display_name: effectiveDisplayName } : identity;
  const signedContent = applySenderSignatureBlock({ identity: identityForSignature, text, html });

  let resolvedUserId = userId;
  if (!resolvedUserId && to) {
    resolvedUserId = await resolveRecipientUserIdByEmail(to);
  }
  const trackingToken = signedContent.html ? UserCommunication.generateTrackingToken() : null;
  const htmlWithPixel = signedContent.html ? injectTrackingPixel(signedContent.html, trackingToken) : signedContent.html;

  let comm = null;
  try {
    comm = await CommunicationLoggingService.logGeneratedCommunication({
      userId: resolvedUserId || null,
      clientId: clientId || null,
      agencyId: identity?.agency_id || null,
      templateType: templateType || 'identity_send',
      templateId: templateId || null,
      subject,
      body: htmlWithPixel || signedContent.text || '',
      generatedByUserId: generatedByUserId || null,
      channel: 'email',
      recipientAddress: to,
      trackingToken,
      metadata: {
        senderIdentityId: identity.id,
        fromEmail: identity.from_email,
        replyTo: identity.reply_to || null,
        source,
        threadId
      }
    });
  } catch (logErr) {
    console.error('[unifiedEmail] failed to pre-log identity email', logErr?.message || logErr);
    comm = null;
  }

  const gmail = await getGmailClient();
  const mime = buildMimeMessage({
    to,
    subject,
    text: signedContent.text,
    html: htmlWithPixel,
    from,
    replyTo,
    inReplyTo,
    references,
    attachments
  });
  const raw = base64UrlEncode(mime);

  const requestBody = threadId ? { raw, threadId } : { raw };
  const result = await gmail.users.messages.send({ userId: 'me', requestBody });

  const messageId = result.data?.id || null;
  const finalThreadId = result.data?.threadId || threadId || null;
  const agencyId = identity?.agency_id || null;

  if (comm?.id && messageId) {
    await CommunicationLoggingService.markAsSent(comm.id, messageId, {
      threadId: finalThreadId,
      impersonatedUser: getImpersonatedUser(),
      senderIdentityId: identity.id,
      fromEmail: identity.from_email,
      replyTo: identity.reply_to || null
    }).catch(() => {});
  }

  if (agencyId && to) {
    await logContactCommunicationIfApplicable({
      agencyId,
      channel: 'email',
      direction: 'outbound',
      recipient: to,
      body: html || text || '',
      externalRefId: messageId,
      metadata: { subject, threadId: finalThreadId }
    }).catch(() => {});
  }

  return { id: messageId, threadId: finalThreadId, communicationId: comm?.id || null };
}

