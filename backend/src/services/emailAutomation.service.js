/**
 * Availability-aware client OOO auto-replies, SUPPORT keyword routing,
 * and cancellation/termination intent → support ticket review.
 */
import pool from '../config/database.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import {
  isUserAvailable,
  nextAvailableAt,
  formatReturnAt,
  addBusinessHours,
  resolveAvailabilitySchedule
} from './availabilityWindow.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

const DEFAULT_OOO = `Thank you for emailing {provider_name} at {agency_name}. I am currently outside my Availability Hours and will return {return_at}.

If this is an emergency, please dial 988 or 911.

If you would like this email sent to support, please reply with the word {support_keyword}.`;

function previewText(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function detectIntent(subject, body) {
  const text = `${subject || ''}\n${body || ''}`.toLowerCase();
  let kind = null;
  let confidence = 0;
  if (/\b(terminat(e|ion)|discharg(e|ing)|end (care|services)|withdraw from)\b/.test(text)) {
    kind = 'termination';
    confidence = 0.82;
  } else if (/\b(cancel(l?ation|ling)?|reschedule|can't make|cannot make|won't be able|no longer need)\b/.test(text)) {
    kind = 'cancellation';
    confidence = 0.8;
  }
  if (!kind) return null;
  return { kind, confidence, excerpt: previewText(text) };
}

function renderOooTemplate(template, vars) {
  let out = String(template || DEFAULT_OOO);
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), String(v ?? ''));
  }
  return out;
}

export async function maybeSendClientOooAutoReply({
  agencyId,
  conversationId,
  ownerUserId,
  messageId = null,
  fromEmail,
  subject,
  bodyText
}) {
  const settings = await getAgencyEmailSettings(agencyId);
  if (!settings.clientOooAutoReplyEnabled) return { sent: false, reason: 'disabled' };
  if (!ownerUserId || !conversationId) return { sent: false, reason: 'missing_owner' };

  const [convRows] = await pool.execute(
    `SELECT id, auto_reply_sent_at, sender_trust, inbox_id FROM communication_conversations WHERE id = ? LIMIT 1`,
    [conversationId]
  );
  const conv = convRows?.[0];
  if (!conv) return { sent: false, reason: 'no_conversation' };
  if (conv.auto_reply_sent_at) return { sent: false, reason: 'already_sent' };
  if (!['client', 'guardian'].includes(String(conv.sender_trust || ''))) {
    return { sent: false, reason: 'not_client' };
  }

  const now = new Date();
  const { available, schedule } = await isUserAvailable(ownerUserId, now, { agencyId });
  if (available || !schedule?.enabled) return { sent: false, reason: 'available' };

  const returnAt = nextAvailableAt(schedule, now);
  const provider = await User.findById(ownerUserId);
  const agency = await Agency.findById(agencyId);
  const providerName = [provider?.first_name, provider?.last_name].filter(Boolean).join(' ') || 'your provider';
  const agencyName = agency?.name || 'our team';
  const keyword = settings.clientOooSupportKeyword || 'SUPPORT';
  const text = renderOooTemplate(settings.clientOooTemplate || DEFAULT_OOO, {
    provider_name: providerName,
    agency_name: agencyName,
    return_at: formatReturnAt(returnAt, schedule.timezone),
    support_keyword: keyword
  });

  const inbox = conv.inbox_id ? await CommunicationInbox.findById(conv.inbox_id) : null;
  if (!inbox?.sender_identity_id) return { sent: false, reason: 'no_identity' };

  try {
    const sendResult = await sendEmailFromIdentity({
      senderIdentityId: inbox.sender_identity_id,
      to: fromEmail,
      subject: `Re: ${subject || '(no subject)'}`,
      text,
      html: `<p>${text.replace(/\n/g, '<br/>')}</p>`,
      source: 'auto',
      generatedByUserId: ownerUserId,
      templateType: 'client_ooo_auto_reply'
    });

    await CommunicationConversation.addMessage({
      conversationId,
      channel: 'email',
      direction: 'outbound',
      authorUserId: ownerUserId,
      from: { email: inbox.from_email, name: inbox.display_name },
      to: [{ email: fromEmail }],
      subject: `Re: ${subject || '(no subject)'}`,
      bodyText: text,
      bodyHtml: `<p>${text.replace(/\n/g, '<br/>')}</p>`,
      sendStatus: 'sent',
      sentAt: now,
      isAutoReply: true,
      autoReplyKind: 'ooo',
      internetMessageId: sendResult?.id || null
    }).catch(async () => {
      // Fallback if model doesn't yet accept isAutoReply kwargs — update after insert
      const [msgRows] = await pool.execute(
        `SELECT id FROM communication_messages
         WHERE conversation_id = ? AND direction = 'outbound'
         ORDER BY id DESC LIMIT 1`,
        [conversationId]
      );
      if (msgRows?.[0]?.id) {
        await pool.execute(
          `UPDATE communication_messages SET is_auto_reply = 1, auto_reply_kind = 'ooo' WHERE id = ?`,
          [msgRows[0].id]
        );
      }
    });

    await pool.execute(
      `UPDATE communication_conversations SET auto_reply_sent_at = ? WHERE id = ?`,
      [now, conversationId]
    );

    return { sent: true, returnAt };
  } catch (e) {
    console.warn('[emailAutomation] OOO reply failed:', e?.message || e);
    return { sent: false, reason: e?.message || 'send_failed' };
  }
}

export async function handleSupportKeywordReply({
  agencyId,
  conversationId,
  ownerUserId,
  bodyText,
  fromEmail
}) {
  const settings = await getAgencyEmailSettings(agencyId);
  const keyword = String(settings.clientOooSupportKeyword || 'SUPPORT').toUpperCase();
  const body = String(bodyText || '').trim().toUpperCase();
  if (!body.includes(keyword)) return { handled: false };

  // Create support ticket with thread context
  const [msgs] = await pool.execute(
    `SELECT subject, body_text, direction, sent_at, created_at, is_auto_reply
     FROM communication_messages
     WHERE conversation_id = ?
     ORDER BY COALESCE(sent_at, created_at) ASC
     LIMIT 40`,
    [conversationId]
  );
  const transcript = (msgs || [])
    .map((m) => `[${m.direction}${m.is_auto_reply ? '/auto' : ''}] ${previewText(m.body_text)}`)
    .join('\n');

  const subject = `Client requested SUPPORT forward (conversation #${conversationId})`;
  const [ins] = await pool.execute(
    `INSERT INTO support_tickets
      (agency_id, subject, status, priority, source_channel, created_by_user_id, metadata_json)
     VALUES (?, ?, 'open', 'normal', 'email', ?, ?)
     ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    [
      agencyId,
      subject,
      ownerUserId || null,
      JSON.stringify({
        conversationId,
        fromEmail,
        keyword,
        transcript: transcript.slice(0, 8000)
      })
    ]
  ).catch(async () => {
    // Minimal insert if columns differ
    const [r] = await pool.execute(
      `INSERT INTO support_tickets (agency_id, subject, status, created_by_user_id)
       VALUES (?, ?, 'open', ?)`,
      [agencyId, subject, ownerUserId || null]
    );
    return [r];
  });

  const ticketId = ins?.insertId || null;
  if (ticketId) {
    await pool.execute(
      `UPDATE communication_conversations SET support_ticket_id = COALESCE(support_ticket_id, ?) WHERE id = ?`,
      [ticketId, conversationId]
    ).catch(() => {});
  }
  return { handled: true, ticketId };
}

export async function maybeCreateIntentReview({
  agencyId,
  conversationId,
  messageId = null,
  subject,
  bodyText,
  linkedClientId = null
}) {
  const settings = await getAgencyEmailSettings(agencyId);
  if (!settings.intentReviewEnabled) return { created: false, reason: 'disabled' };

  const intent = detectIntent(subject, bodyText);
  if (!intent) return { created: false, reason: 'no_intent' };
  if (intent.confidence < Number(settings.intentConfidenceThreshold || 0.75)) {
    return { created: false, reason: 'low_confidence' };
  }

  const [existing] = await pool.execute(
    `SELECT id FROM communication_intent_reviews
     WHERE conversation_id = ? AND intent_kind = ? AND status IN ('pending','auto_ticketed')
     LIMIT 1`,
    [conversationId, intent.kind]
  );
  if (existing?.[0]) return { created: false, reason: 'already_open', id: existing[0].id };

  // Recommended action + support ticket for human review
  const recommended = intent.kind === 'termination'
    ? 'review_termination_forward_support'
    : 'review_cancellation_candidates';

  const schedule = await resolveAvailabilitySchedule(null);
  const autoAt = addBusinessHours(
    { enabled: true, timezone: 'America/New_York', blocks: [
      { dayOfWeek: 1, startMinutes: 360, endMinutes: 1140 },
      { dayOfWeek: 2, startMinutes: 360, endMinutes: 1140 },
      { dayOfWeek: 3, startMinutes: 360, endMinutes: 1140 },
      { dayOfWeek: 4, startMinutes: 360, endMinutes: 1140 },
      { dayOfWeek: 5, startMinutes: 360, endMinutes: 1140 }
    ] },
    new Date(),
    24
  );

  const ticketSubject = `Intent review: ${intent.kind} (conversation #${conversationId})`;
  const details = [
    `Detected intent: ${intent.kind} (confidence ${intent.confidence})`,
    `Recommended action: ${recommended}`,
    linkedClientId ? `Matched client id: ${linkedClientId}` : 'No client auto-matched',
    '',
    'Excerpt:',
    intent.excerpt,
    '',
    'Staff should confirm before changing sessions. If no engagement within 24 Availability Hours, this escalates as an auto-ticketed review.',
    'Note: Replies to appointment notifications still auto-cancel via the appointment-reply path (separate).'
  ].join('\n');

  let ticketId = null;
  try {
    const [ins] = await pool.execute(
      `INSERT INTO support_tickets (agency_id, subject, status, priority, source_channel, metadata_json)
       VALUES (?, ?, 'open', 'high', 'email', ?)`,
      [agencyId, ticketSubject, JSON.stringify({ conversationId, intent, details, linkedClientId })]
    );
    ticketId = ins.insertId;
  } catch (e) {
    try {
      const [ins] = await pool.execute(
        `INSERT INTO support_tickets (agency_id, subject, status)
         VALUES (?, ?, 'open')`,
        [agencyId, ticketSubject]
      );
      ticketId = ins.insertId;
    } catch (e2) {
      console.warn('[emailAutomation] intent ticket failed:', e2?.message || e2);
    }
  }

  const [rev] = await pool.execute(
    `INSERT INTO communication_intent_reviews
      (agency_id, conversation_id, message_id, intent_kind, confidence, status,
       recommended_action, excerpt, matched_client_id, support_ticket_id, auto_action_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      agencyId,
      conversationId,
      messageId,
      intent.kind,
      intent.confidence,
      recommended,
      intent.excerpt,
      linkedClientId,
      ticketId,
      autoAt
    ]
  );

  await pool.execute(
    `UPDATE communication_conversations
     SET intent_kind = ?, intent_ticket_id = COALESCE(?, intent_ticket_id)
     WHERE id = ?`,
    [intent.kind, ticketId, conversationId]
  ).catch(() => {});

  return { created: true, id: rev.insertId, ticketId, intent };
}

/**
 * After 24 Availability Hours without staff engagement, mark reviews auto_ticketed
 * (ticket already exists; this closes the review SLA).
 */
export async function runIntentReviewEscalationTick({ now = new Date() } = {}) {
  const [rows] = await pool.execute(
    `UPDATE communication_intent_reviews
     SET status = 'auto_ticketed', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending'
       AND auto_action_at IS NOT NULL
       AND auto_action_at <= ?`,
    [now]
  ).catch(() => [{ affectedRows: 0 }]);
  return { escalated: rows?.affectedRows || 0 };
}

export default {
  maybeSendClientOooAutoReply,
  handleSupportKeywordReply,
  maybeCreateIntentReview,
  runIntentReviewEscalationTick,
  detectIntent
};
