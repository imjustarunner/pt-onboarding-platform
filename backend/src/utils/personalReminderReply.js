// Gmail/Outlook append quoted notification headers containing a private address.
// Forward only the newly written reply, and replace any remaining private identity.
export function personalReminderReplyText(body, personalEmail, workEmail) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*>/.test(line) || /^\s*-{2,}\s*(Original Message|Forwarded message)/i.test(line) ||
        /^\s*On\s.+wrote:\s*$/i.test(line) || /^\s*From:\s/i.test(line) ||
        (/^\s*On\s/i.test(line) && lines.slice(i, i + 4).some((next) => /wrote:\s*$/i.test(next)))) break;
    output.push(line);
  }
  const escaped = String(personalEmail || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = output.join('\n').trim();
  return escaped ? text.replace(new RegExp(escaped, 'gi'), workEmail) : text;
}
import { simpleParser } from 'mailparser';

export async function personalReminderBody(payload, fallback = '') {
  const parts = [];
  const visit = (part) => {
    if (!part || part.filename) return;
    if (part.body?.data) parts.push(part);
    for (const child of part.parts || []) visit(child);
  };
  visit(payload);
  const plain = parts.find((p) => p.mimeType === 'text/plain');
  if (plain) return Buffer.from(plain.body.data, 'base64url').toString('utf8');
  const html = parts.find((p) => p.mimeType === 'text/html');
  if (!html) return fallback;
  let body = Buffer.from(html.body.data, 'base64url').toString('utf8');
  const quote = /<blockquote\b|<div\b[^>]*(?:class=["'][^"']*(?:gmail_quote|yahoo_quoted)|id=["']divRplyFwdMsg)/i.exec(body);
  if (quote) body = body.slice(0, quote.index);
  // Decode entities and preserve paragraph boundaries before removing quoted headers.
  const parsed = await simpleParser(`Content-Type: text/html; charset=utf-8\r\n\r\n${body}`);
  return parsed.text || '';
}
