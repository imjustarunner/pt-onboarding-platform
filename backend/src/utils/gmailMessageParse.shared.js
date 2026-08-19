export function headerMap(headers = []) {
  const m = new Map();
  for (const h of headers || []) {
    if (!h?.name) continue;
    m.set(String(h.name).toLowerCase(), String(h.value || ''));
  }
  return m;
}

export function decodeBase64Url(data) {
  if (!data) return '';
  const s = String(data).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

export function extractEmails(headerValue) {
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

export function pickBodyText(payload) {
  if (!payload) return '';
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
    for (const p of node?.parts || []) stack.push(p);
  }

  if (textParts.length) return textParts.join('\n\n').trim();
  if (htmlParts.length) {
    return htmlParts.join('\n\n').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

const QUOTE_PATTERNS = [
  /\nOn .{0,160}wrote:/i,
  /\n-{2,}\s*Original Message\s*-{2,}\s*\n/i,
  /\nFrom:\s.+\nSent:\s.+\nTo:\s.+\nSubject:\s/i,
  /\n_{5,}\n/,
  /\n>{1}\s?.+/m
];

export function stripQuotedEmailTail(body) {
  let text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  let cutAt = text.length;
  for (const pattern of QUOTE_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match.index >= 20 && match.index < cutAt) cutAt = match.index;
  }
  return text.slice(0, cutAt).trim();
}

export function truncateText(raw, max = 4000) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function parseGmailMessageSummary(message, ourEmails = []) {
  const payload = message?.payload || message;
  const hdrs = headerMap(payload?.headers || []);
  const fromEmails = extractEmails(hdrs.get('from'));
  const toEmails = extractEmails(hdrs.get('to'));
  const ccEmails = extractEmails(hdrs.get('cc'));
  const our = new Set((ourEmails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean));
  const fromEmail = fromEmails[0] || '';
  const isFromUs = fromEmails.some((e) => our.has(e));
  const body = stripQuotedEmailTail(pickBodyText(payload));
  return {
    id: String(message?.id || ''),
    threadId: String(message?.threadId || ''),
    internalDate: Number(message?.internalDate || 0),
    subject: String(hdrs.get('subject') || '').trim(),
    fromEmail,
    toEmails: [...toEmails, ...ccEmails],
    isFromUs,
    body
  };
}

export function pairThreadStaffReplies(messages = [], ourEmails = []) {
  const parsed = (messages || [])
    .map((m) => parseGmailMessageSummary(m, ourEmails))
    .filter((m) => m.id)
    .sort((a, b) => a.internalDate - b.internalDate);

  const pairs = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const msg = parsed[i];
    if (!msg.isFromUs || !msg.body || msg.body.length < 20) continue;

    let question = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = parsed[j];
      if (prev.isFromUs) continue;
      if (!prev.body || prev.body.length < 8) continue;
      question = prev;
      break;
    }

    pairs.push({
      gmailMessageId: msg.id,
      threadId: msg.threadId,
      subject: msg.subject || question?.subject || 'School email',
      questionBody: question?.body || '',
      answerBody: msg.body,
      schoolFromEmail: question?.fromEmail || msg.toEmails.find((e) => !ourEmails.includes(e)) || null,
      sentAt: msg.internalDate ? new Date(msg.internalDate) : null
    });
  }
  return pairs;
}
