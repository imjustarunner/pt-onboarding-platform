import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import { callGeminiText } from './geminiText.service.js';
import { buildConversationContext } from './ticketEmailInboxAdapter.service.js';
import { hydrateChannelMessages } from './channelInboxAdapter.service.js';

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, max = 1200) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

async function loadThreadBundle(conversationId) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  let messages = await CommunicationConversation.listMessages(conversationId);
  const hydrated = await hydrateChannelMessages(conv);
  if (hydrated) messages = hydrated;
  const context = await buildConversationContext(conv);
  return { conv, messages, context };
}

function buildOrgFacts({ conv, context }) {
  const linked = context?.linkedTo || {};
  const lines = [
    `Channel: ${conv.channel || 'email'}`,
    `Status: ${conv.status || '—'}`,
    `Priority: ${conv.priority || 'normal'}`,
    `Subject: ${conv.subject || '(none)'}`,
    linked.client
      ? `Client: ${linked.client.name} (id ${linked.client.id}, status ${linked.client.status || '—'})`
      : 'Client: not linked',
    linked.guardian
      ? `Guardian: ${linked.guardian.name}${linked.guardian.email ? ` <${linked.guardian.email}>` : ''}`
      : null,
    linked.school
      ? `School: ${linked.school.name} (id ${linked.school.id}; active referrals ${linked.school.activeReferrals ?? '—'}; enrolled ${linked.school.enrolledClients ?? '—'})`
      : 'School: not linked',
    linked.ticket ? `Support ticket: #${linked.ticket.id} (${linked.ticket.status})` : null,
    context?.recognized
      ? `Recognized contact: ${context.recognized.label} (${context.recognized.kind})`
      : null
  ].filter(Boolean);
  return lines.join('\n');
}

function buildTranscript(messages, { limit = 12 } = {}) {
  const slice = (messages || []).slice(-limit);
  return slice
    .map((m) => {
      const when = m.sent_at || m.created_at || '';
      const who = m.is_internal_note
        ? 'Internal note'
        : m.direction === 'outbound'
          ? 'Staff'
          : m.from?.name || m.from?.email || 'External';
      const body = truncate(m.body_text || stripHtml(m.body_html), 900);
      return `[${when}] ${who}: ${body}`;
    })
    .join('\n\n');
}

/**
 * Draft a reply grounded in linked client/school/ticket context + thread history.
 */
export async function generateComposerAssist(conversationId, { instruction, tone } = {}) {
  const { conv, messages, context } = await loadThreadBundle(conversationId);
  const facts = buildOrgFacts({ conv, context });
  const transcript = buildTranscript(messages);
  const toneLine = tone ? `Tone: ${tone}.` : 'Tone: professional, warm, concise.';
  const extra = instruction ? `Staff instruction: ${instruction}` : '';

  const prompt = `You help school-based therapy / special education operations staff write email replies inside PlotTwistHQ.

Rules:
- Use only the org facts and thread below. Do not invent enrollment, IEP, schedule, or insurance details.
- If a fact is unknown, write a short clarifying question instead of guessing.
- Do not include PHI beyond what is already in the thread/facts.
- Prefer actionable next steps (documents needed, who will follow up, timing).
- Return plain email body text only (no subject line, no markdown fences, no "Here's a draft").

${toneLine}
${extra}

ORG FACTS:
${facts}

THREAD:
${transcript || '(no messages yet)'}`;

  const { text, modelName, provider, latencyMs } = await callGeminiText({
    prompt,
    temperature: 0.35,
    maxOutputTokens: 900
  });

  const draft = String(text || '').trim();
  if (!draft) throw new Error('AI returned an empty draft');
  return { draft, modelName, provider, latencyMs, grounded: true };
}

/**
 * Summarize the thread and suggest a next operational action + status.
 */
export async function generateThreadInsight(conversationId, { force = false } = {}) {
  const { conv, messages, context } = await loadThreadBundle(conversationId);

  if (
    !force &&
    conv.ai_summary &&
    conv.ai_summary_at &&
    conv.last_message_at &&
    new Date(conv.ai_summary_at) >= new Date(conv.last_message_at)
  ) {
    return {
      summary: conv.ai_summary,
      suggestedAction: conv.ai_suggested_action,
      suggestedStatus: null,
      cached: true
    };
  }

  const facts = buildOrgFacts({ conv, context });
  const transcript = buildTranscript(messages, { limit: 16 });

  const prompt = `You assist operations staff in a school therapy communications inbox.

Given ORG FACTS and THREAD, return ONLY valid JSON with keys:
- summary: 2-3 sentence plain-language summary of where things stand
- suggestedAction: one concrete next step the staff member should take (max 140 chars)
- suggestedStatus: one of new|needs_reply|waiting_on_them|follow_up|resolved

Do not invent facts. If unclear, say what is missing in suggestedAction.

ORG FACTS:
${facts}

THREAD:
${transcript || '(empty)'}`;

  const { text, modelName, provider, latencyMs } = await callGeminiText({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 500
  });

  const parsed = parseJsonObject(text) || {};
  const summary = String(parsed.summary || text || '').trim().slice(0, 2000);
  const suggestedAction = String(parsed.suggestedAction || '').trim().slice(0, 500) || null;
  const allowed = new Set(['new', 'needs_reply', 'waiting_on_them', 'follow_up', 'resolved']);
  const suggestedStatus = allowed.has(String(parsed.suggestedStatus || ''))
    ? String(parsed.suggestedStatus)
    : null;

  await pool.execute(
    `UPDATE communication_conversations
     SET ai_summary = ?, ai_suggested_action = ?, ai_summary_at = NOW()
     WHERE id = ?`,
    [summary || null, suggestedAction, conversationId]
  ).catch(() => {});

  return {
    summary,
    suggestedAction,
    suggestedStatus,
    cached: false,
    modelName,
    provider,
    latencyMs
  };
}

/**
 * Avg first-response time (hours) over the last N days for email conversations.
 * Measured as first inbound → first subsequent outbound (non-internal).
 */
export async function computeResponseTimeMetrics({ agencyId, days = 7 } = {}) {
  if (!agencyId) {
    return { days, sampleSize: 0, avgHours: null, medianHours: null, p90Hours: null };
  }
  const d = Math.min(Math.max(Number(days) || 7, 1), 90);

  const [rows] = await pool.execute(
    `SELECT
       TIMESTAMPDIFF(
         MINUTE,
         inbound.first_inbound,
         (
           SELECT MIN(m2.sent_at)
           FROM communication_messages m2
           WHERE m2.conversation_id = c.id
             AND m2.direction = 'outbound'
             AND COALESCE(m2.is_internal_note, 0) = 0
             AND (m2.send_status IS NULL OR m2.send_status = 'sent')
             AND m2.sent_at IS NOT NULL
             AND m2.sent_at >= inbound.first_inbound
         )
       ) AS response_minutes
     FROM communication_conversations c
     JOIN (
       SELECT conversation_id, MIN(sent_at) AS first_inbound
       FROM communication_messages
       WHERE direction = 'inbound'
         AND COALESCE(is_internal_note, 0) = 0
         AND sent_at IS NOT NULL
       GROUP BY conversation_id
     ) inbound ON inbound.conversation_id = c.id
     WHERE c.agency_id = ?
       AND c.channel = 'email'
       AND COALESCE(c.is_spam, 0) = 0
       AND inbound.first_inbound >= DATE_SUB(NOW(), INTERVAL ${d} DAY)
     HAVING response_minutes IS NOT NULL AND response_minutes >= 0`,
    [agencyId]
  ).catch(() => [[]]);

  const minutes = (rows || [])
    .map((r) => Number(r.response_minutes))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (!minutes.length) {
    return { days: d, sampleSize: 0, avgHours: null, medianHours: null, p90Hours: null };
  }

  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length;
  const mid = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2 === 0 ? (minutes[mid - 1] + minutes[mid]) / 2 : minutes[mid];
  const p90 = minutes[Math.min(minutes.length - 1, Math.floor(minutes.length * 0.9))];

  const toHours = (m) => Math.round((m / 60) * 10) / 10;
  return {
    days: d,
    sampleSize: minutes.length,
    avgHours: toHours(avg),
    medianHours: toHours(median),
    p90Hours: toHours(p90)
  };
}
