import { resolveVacation, vacationDefaults, currentPlannedOut, claimVacationReply, releaseVacationReply } from './vacationResponder.service.js';
import { renderVacationTemplate, escapeReplyHtml } from './vacationResponderPolicy.js';
/**
 * Availability-aware client OOO auto-replies, SUPPORT keyword routing,
 * and cancellation/termination intent → support ticket review.
 */
import pool from '../config/database.js';
import { eligibleClientAfterHoursReply } from './afterHoursEmailPolicy.service.js';
import { handleSupportKeywordReply } from './emailSupportKeyword.service.js';
export { handleSupportKeywordReply };
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
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';

const DEFAULT_OOO = `Thank you for emailing {provider_name} at {agency_name}. I am currently outside my Availability Hours and will return {return_at}.

For immediate danger or a medical emergency, call 911. For a mental health crisis or emotional distress, call or text 988. Do not wait for an email reply.

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
  bodyText,
  recipientEmails = []
}) {
  const settings = await getAgencyEmailSettings(agencyId);
  if (!settings.clientOooAutoReplyEnabled) return { sent: false, reason: 'disabled' };
  if (!ownerUserId || !conversationId) return { sent: false, reason: 'missing_owner' };

  const [convRows] = await pool.execute(
    `SELECT id, auto_reply_sent_at, sender_trust, inbox_id FROM communication_conversations WHERE id = ? AND agency_id = ? LIMIT 1`,
    [conversationId, agencyId]
  );
  const conv = convRows?.[0];
  if (!conv) return { sent: false, reason: 'no_conversation' };
  if (conv.sender_trust === 'blocked') return { sent: false, reason: 'blocked' };
  if (/^(mailer-daemon|postmaster|no-?reply)@/i.test(String(fromEmail || '')) || /^(automatic reply|auto.?reply|out of office):/i.test(String(subject || ''))) return { sent: false, reason: 'automated_sender' };
  const now = new Date();
  const inbox = conv.inbox_id ? await CommunicationInbox.findById(conv.inbox_id) : null;
  if (!inbox?.sender_identity_id || Number(inbox.agency_id) !== Number(agencyId)) return { sent: false, reason: 'no_identity' };
  if (String(inbox.from_email || '').toLowerCase() === String(fromEmail || '').toLowerCase()) return { sent: false, reason: 'self' };
  // Personal vacation notices must never be emitted by a shared agency inbox.
  const personal = inbox.kind === 'personal' && Number(inbox.owner_user_id) === Number(ownerUserId);
  let vacation = null;
  if (personal) {
    try { vacation = await resolveVacation(agencyId, ownerUserId, now); }
    catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; }
  }
  const vacationActive = vacation?.state === 'active';
  if (!vacationActive && !['client', 'guardian'].includes(String(conv.sender_trust || ''))) return { sent: false, reason: 'not_client' };
  if (!vacationActive && conv.auto_reply_sent_at) return { sent: false, reason: 'already_sent' };
  const afterHoursReplyContext = { agencyId, ownerUserId, inbox, recipientEmails, senderTrust: conv.sender_trust, fromEmail };
  if (!vacationActive && !await eligibleClientAfterHoursReply(afterHoursReplyContext)) return { sent: false, reason: 'after_hours_reply_not_allowed' };
  const { available, schedule } = await isUserAvailable(ownerUserId, now, { agencyId });
  const plannedOut = !vacationActive ? await currentPlannedOut(agencyId, ownerUserId, now) : null;
  if (!vacationActive && !plannedOut && (available || !schedule?.enabled)) return { sent: false, reason: 'available' };
  const returnAt = vacationActive ? new Date(vacation.endsAt) : plannedOut ? null : nextAvailableAt(schedule, now);
  const provider = await User.findById(ownerUserId);
  const agency = await Agency.findById(agencyId);
  const providerName = [provider?.first_name, provider?.last_name].filter(Boolean).join(' ') || 'your provider';
  const agencyName = agency?.name || 'our team';
  const keyword = settings.clientOooSupportKeyword || 'SUPPORT';
  let text;
  if (vacationActive) {
    const defaults = await vacationDefaults(agency);
    text = renderVacationTemplate(vacation.messageTemplate || defaults.templates[vacation.templateKey], {
      provider_name: providerName, agency_name: agencyName,
      return_at: formatReturnAt(returnAt, vacation.timeZone), support_contact: defaults.supportContact
    });
  } else if (plannedOut) {
    text = `Thank you for contacting ${providerName} at ${agencyName}. I am currently unavailable. Your message will remain in my inbox for review when I return. To request support review, reply ${keyword}. Support response times depend on staff availability.\n\nFor immediate danger or a medical emergency, call 911. For emotional distress or a mental health crisis, call or text 988. Do not wait for an email reply.`;
  } else {
    text = renderOooTemplate(settings.clientOooTemplate || DEFAULT_OOO, {
      provider_name: providerName, agency_name: agencyName,
      return_at: formatReturnAt(returnAt, schedule.timezone), support_keyword: keyword
    });
  }
  const html = escapeReplyHtml(text);
  let claim = null;
  if (vacationActive) {
    claim = await claimVacationReply(agencyId, ownerUserId, fromEmail, now);
    if (!claim) return { sent: false, reason: 'vacation_cooldown' };
  }
  let delivered = false;
  try {
    const mailbox = await resolveMessagesSendMailbox(agencyId);
    const sendResult = await sendEmailFromIdentity({
      senderIdentityId: mailbox.identity.id,
      fromDisplayNameOverride: `${agencyName} Messages`,
      replyToOverride: inbox.from_email,
      to: fromEmail,
      subject: /^re:/i.test(subject || '') ? subject : `Re: ${subject || '(no subject)'}`,
      text,
      html,
      source: 'auto',
      generatedByUserId: ownerUserId,
      templateType: vacationActive ? 'vacation_auto_reply' : 'client_ooo_auto_reply',
      afterHoursReplyContext
    });

    if (sendResult?.skipped || sendResult?.blocked || sendResult?.queued || sendResult?.pendingApproval || !sendResult?.id) {
      if (claim) await releaseVacationReply(agencyId, ownerUserId, claim);
      return { sent: false, reason: sendResult?.reason || 'not_delivered' };
    }
    delivered = true;
    await CommunicationConversation.addMessage({
      conversationId,
      channel: 'email',
      direction: 'outbound',
      authorUserId: ownerUserId,
      from: { email: mailbox.fromEmail, name: mailbox.displayName },
      to: [{ email: fromEmail }],
      subject: /^re:/i.test(subject || '') ? subject : `Re: ${subject || '(no subject)'}`,
      bodyText: text,
      bodyHtml: html,
      sendStatus: 'sent',
      sentAt: now,
      isAutoReply: true,
      autoReplyKind: vacationActive ? 'vacation' : 'ooo',
      internetMessageId: sendResult?.internetMessageId || null
    }).catch(error => {
      // The send already happened. Never mark another outbound message as this reply.
      console.warn('[emailAutomation] Sent reply could not be added to conversation:', error.code || 'log_failed');
    });

    if (!vacationActive) await pool.execute(
      `UPDATE communication_conversations SET auto_reply_sent_at = ? WHERE id = ?`,
      [now, conversationId]
    );

    return { sent: true, returnAt };
  } catch (e) {
    if (claim && !delivered) await releaseVacationReply(agencyId, ownerUserId, claim);
    console.warn('[emailAutomation] OOO reply failed:', e?.message || e);
    return { sent: false, reason: e?.message || 'send_failed' };
  }
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
