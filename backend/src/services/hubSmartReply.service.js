/**
 * One professional Gemini smart-reply suggestion for Hub threads.
 */
import { callGeminiText } from './geminiText.service.js';

function sanitizeSuggestion(text) {
  let s = String(text || '')
    .replace(/^```[\w]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
  // Prefer first paragraph / line for SMS-ish brevity when very long
  if (s.length > 600) s = s.slice(0, 597).trim() + '…';
  return s;
}

/**
 * @param {{ channel?: string, personName?: string, recentMessages?: Array<{direction:string,bodyPreview:string,channel?:string}> }} opts
 * @returns {Promise<string|null>}
 */
export async function generateHubSmartReply({
  channel = 'secure',
  personName = null,
  recentMessages = []
} = {}) {
  const history = (recentMessages || [])
    .slice(-12)
    .map((m) => {
      const who = m.direction === 'inbound' ? personName || 'Them' : 'Me';
      const body = String(m.bodyPreview || m.body || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280);
      return body ? `${who}: ${body}` : null;
    })
    .filter(Boolean);

  if (!history.length) return null;

  const channelHint =
    channel === 'email'
      ? 'Write a short professional email reply (2–4 sentences). No subject line. No signature block.'
      : channel === 'sms'
        ? 'Write one short SMS reply under 160 characters. Plain text only.'
        : 'Write one clear, warm, professional chat reply (1–3 short sentences). Plain text only.';

  const prompt = `You help behavioral-health / school mental-health staff reply in a messaging hub.
${channelHint}

Rules:
- One suggestion only — return ONLY the reply text, nothing else
- Be helpful, specific to the conversation, and human — not corporate fluff
- Never invent clinical advice, diagnoses, medications, or private facts not in the history
- Do not use placeholders like [Name] or {client}
- Match the tone of the latest inbound message when appropriate
- If the last message is a simple acknowledgment, keep the reply brief

Conversation (oldest → newest):
${history.join('\n')}

Reply:`;

  try {
    const { text } = await callGeminiText({
      prompt,
      temperature: 0.45,
      maxOutputTokens: channel === 'sms' ? 80 : 220
    });
    const suggestion = sanitizeSuggestion(text);
    if (!suggestion || suggestion.length < 2) return null;
    // Reject obviously broken model dumps
    if (/^\s*\{/.test(suggestion) || /as an ai/i.test(suggestion)) return null;
    return suggestion;
  } catch (e) {
    console.warn('[generateHubSmartReply]', e?.message || e);
    return null;
  }
}
