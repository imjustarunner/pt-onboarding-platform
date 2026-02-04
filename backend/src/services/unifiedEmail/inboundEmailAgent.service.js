import { getGmailClient, getImpersonatedUser } from './gmailClient.js';
import { ensureLabelId } from './gmailLabels.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import Agency from '../../models/Agency.model.js';
import { sendEmailFromIdentity } from './unifiedEmailSender.service.js';
import { callGeminiText } from '../geminiText.service.js';

function headerMap(headers = []) {
  const m = new Map();
  for (const h of headers || []) {
    if (!h?.name) continue;
    m.set(String(h.name).toLowerCase(), String(h.value || ''));
  }
  return m;
}

function decodeBase64Url(data) {
  if (!data) return '';
  const s = String(data).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

function extractEmails(headerValue) {
  const v = String(headerValue || '').trim();
  if (!v) return [];
  const parts = v.split(',').map((p) => p.trim()).filter(Boolean);
  const emails = [];
  for (const p of parts) {
    const m = p.match(/<([^>]+)>/);
    const raw = (m?.[1] || p).trim();
    const cleaned = raw.replace(/^mailto:/i, '').trim();
    if (cleaned.includes('@')) emails.push(cleaned.toLowerCase());
  }
  return Array.from(new Set(emails));
}

function isAutoReply(hdrs) {
  const autoSubmitted = String(hdrs.get('auto-submitted') || '').toLowerCase();
  if (autoSubmitted.includes('auto-generated')) return true;
  const suppress = String(hdrs.get('x-auto-response-suppress') || '').toLowerCase();
  if (suppress.includes('all')) return true;
  return false;
}

async function listOurFromEmailsLower() {
  const identities = await EmailSenderIdentity.list({ agencyId: null, includePlatformDefaults: true, onlyActive: true });
  const froms = (identities || []).map((i) => String(i?.from_email || '').toLowerCase()).filter(Boolean);
  froms.push(String(getImpersonatedUser() || '').toLowerCase());
  return Array.from(new Set(froms)).filter(Boolean);
}

function subjectForReply(originalSubject) {
  const s = String(originalSubject || '').trim();
  if (!s) return 'Re:';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function pickBodyText(payload) {
  if (!payload) return '';

  // If single-part body
  if (payload?.body?.data) return decodeBase64Url(payload.body.data);

  const stack = [payload];
  const textParts = [];
  const htmlParts = [];
  while (stack.length) {
    const node = stack.pop();
    const mimeType = String(node?.mimeType || '').toLowerCase();
    const data = node?.body?.data ? decodeBase64Url(node.body.data) : '';
    if (data) {
      if (mimeType === 'text/plain') textParts.push(data);
      if (mimeType === 'text/html') htmlParts.push(data);
    }
    const parts = node?.parts || [];
    for (const p of parts) stack.push(p);
  }

  if (textParts.length) return textParts.join('\n\n').trim();
  if (htmlParts.length) {
    // crude html->text: strip tags
    const joined = htmlParts.join('\n\n');
    return joined.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

async function compileGeminiDecision({ agencyName, fromEmail, subject, bodyText }) {
  const prompt = [
    `You are an assistant for "${agencyName}".`,
    `Decide if this email needs a human. If you can answer, write a concise helpful reply.`,
    ``,
    `Return ONLY valid JSON with this shape:`,
    `{"needsHuman": boolean, "replyText": string}`,
    ``,
    `Email:`,
    `From: ${fromEmail}`,
    `Subject: ${subject}`,
    `Body:`,
    bodyText
  ].join('\n');

  const { text } = await callGeminiText({ prompt, temperature: 0.2, maxOutputTokens: 400 });
  const trimmed = String(text).trim();
  // Model may wrap in ```json ... ```
  const jsonText = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(jsonText);
  const needsHuman = !!parsed?.needsHuman;
  const replyText = String(parsed?.replyText || '').trim();
  return { needsHuman, replyText };
}

async function routeSenderIdentityIdFromHeaders(hdrs) {
  const to = extractEmails(hdrs.get('to'));
  const cc = extractEmails(hdrs.get('cc'));
  const all = [...to, ...cc];
  for (const addr of all) {
    const identity = await EmailSenderIdentity.findByInboundAddress(addr);
    if (identity?.id) return identity.id;
  }
  return null;
}

export async function runInboundEmailAgentOnce({ maxMessages = 10 } = {}) {
  const gmail = await getGmailClient();
  const processedLabelId = await ensureLabelId('AI_PROCESSED');
  const needsHumanLabelId = await ensureLabelId('AI_NEEDS_HUMAN');
  const ignoredLabelId = await ensureLabelId('AI_IGNORED');

  const ourFromEmails = await listOurFromEmailsLower();

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: Math.max(1, Math.min(50, Number(maxMessages) || 10))
  });

  const msgs = list.data?.messages || [];
  const results = { scanned: msgs.length, replied: 0, needsHuman: 0, ignored: 0, unroutable: 0 };

  for (const m of msgs) {
    const id = m.id;
    if (!id) continue;

    const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const payload = full.data?.payload || null;
    const hdrs = headerMap(payload?.headers || []);
    const fromHeader = hdrs.get('from') || '';
    const fromEmail = extractEmails(fromHeader)[0] || '';
    const subject = hdrs.get('subject') || '';

    // Loop protection: ignore our own sent mail
    if (fromEmail && ourFromEmails.includes(fromEmail.toLowerCase())) {
      results.ignored += 1;
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: { removeLabelIds: ['UNREAD'], addLabelIds: [processedLabelId, ignoredLabelId] }
      });
      continue;
    }

    // Loop protection: ignore auto-replies / auto-generated messages
    if (isAutoReply(hdrs)) {
      results.ignored += 1;
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: { removeLabelIds: ['UNREAD'], addLabelIds: [processedLabelId, ignoredLabelId] }
      });
      continue;
    }

    const senderIdentityId = await routeSenderIdentityIdFromHeaders(hdrs);
    if (!senderIdentityId) {
      results.unroutable += 1;
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: { removeLabelIds: ['UNREAD'], addLabelIds: [processedLabelId, ignoredLabelId] }
      });
      continue;
    }

    const identity = await EmailSenderIdentity.findById(senderIdentityId);
    const agencyId = identity?.agency_id || null;
    const agency = agencyId ? await Agency.findById(agencyId) : null;
    const agencyName = agency?.name || 'your organization';

    const bodyText = pickBodyText(payload);
    const decision = await compileGeminiDecision({ agencyName, fromEmail, subject, bodyText }).catch((e) => {
      return { needsHuman: true, replyText: '', error: e.message };
    });

    if (decision.needsHuman || !decision.replyText) {
      results.needsHuman += 1;
      await gmail.users.messages.modify({
        userId: 'me',
        id,
        requestBody: { removeLabelIds: ['UNREAD'], addLabelIds: [processedLabelId, needsHumanLabelId] }
      });
      continue;
    }

    const msgIdHeader = hdrs.get('message-id') || null;
    const references = hdrs.get('references') || msgIdHeader || null;
    const threadId = full.data?.threadId || null;

    await sendEmailFromIdentity({
      senderIdentityId,
      to: fromEmail,
      subject: subjectForReply(subject),
      text: decision.replyText,
      html: null,
      inReplyTo: msgIdHeader,
      references,
      threadId
    });

    results.replied += 1;
    await gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { removeLabelIds: ['UNREAD'], addLabelIds: [processedLabelId] }
    });
  }

  return results;
}

