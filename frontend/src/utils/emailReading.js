import { readableEmailHtml } from './emailPresentation';

/** Preview cleanup only: the reader always retains the original message. */
export function emailPreviewText(value) {
  let text = String(value || '');
  if (/<[a-z][\s\S]*>/i.test(text)) {
    const doc = new DOMParser().parseFromString(text,'text/html');
    doc.querySelectorAll('script,style,blockquote,.gmail_quote,.gmail_signature').forEach((e) => e.remove());
    doc.querySelectorAll('br').forEach((e) => e.replaceWith('\n'));
    doc.querySelectorAll('p,div,tr').forEach((e) => e.append('\n'));
    text = doc.body.textContent || '';
  }
  text = text.split(/\s+--\s+|\s+CONFIDENTIAL(?:ITY)?(?: NOTICE)?[ :]/i)[0];
  const lines = text.replace(/\r/g,'').split('\n'); const body = [];
  for (const line of lines) {
    if (/^\s*(--\s*$|_{5,}|-{5,}\s*(Original|Forwarded)|On .+wrote:|Sent from my (iPhone|iPad|Android)|CONFIDENTIAL(?:ITY)?\b|This (?:email|message) (?:and any attachments )?(?:is|contains) confidential)/i.test(line)) break;
    if (/^\s*>/.test(line)) break;
    body.push(line);
  }
  return body.join('\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
export function quoteEmailHistory(messages = []) {
  return messages.filter((m) => !m.is_internal_note && (!m.send_status || m.send_status === 'sent')).map((m) => {
    const sender = m.from?.name || m.from?.email || 'Sender';
    const recipients = (m.to || []).map((a) => a.email || a).join(', ');
    return `From: ${sender}\nDate: ${m.sent_at || m.created_at || ''}\nTo: ${recipients}\nSubject: ${m.subject || ''}\n\n${m.body_text || emailPreviewText(m.body_html)}`;
  }).reverse().join('\n\n---------- Earlier message ----------\n');
}

/** Preserve the HTML alternative instead of quoting Gmail's hard-wrapped text MIME part. */
export function quoteEmailHistoryHtml(messages = []) {
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return messages.filter(m => !m.is_internal_note && (!m.send_status || m.send_status === 'sent')).map(m => {
    const sender = [m.from?.name, m.from?.email ? `<${m.from.email}>` : ''].filter(Boolean).join(' ') || 'Sender';
    const recipients = (m.to || []).map(a => a.email || a).join(', ');
    const date = m.sent_at || m.created_at;
    const when = date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'}) : String(date || '');
    let html = m.body_html || '';
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      // The stored thread supplies earlier messages separately; avoid recursively
      // repeating Gmail/app quotes and their signatures on every round trip.
      if (messages.length > 1) doc.querySelectorAll('.gmail_quote,.yahoo_quoted,blockquote[type="cite"]').forEach(node => node.remove());
      html = doc.body.innerHTML;
    }
    let body = readableEmailHtml({body_html:html, body_text:m.body_text}, {collapseQuotes:false, loadExternalImages:true});
    if (!html) body = body.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
    return `<section><div style="margin:16px 0 8px;font-size:13px;line-height:1.4"><b>From:</b> ${escape(sender)}<br><b>Date:</b> ${escape(when)}<br><b>To:</b> ${escape(recipients)}<br><b>Subject:</b> ${escape(m.subject)}</div><div style="line-height:1.5;${html ? '' : 'white-space:pre-wrap;'}">${body}</div></section>`;
  }).reverse().join('');
}
