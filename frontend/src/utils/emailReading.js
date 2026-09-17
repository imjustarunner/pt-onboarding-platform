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
