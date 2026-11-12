import DOMPurify from 'dompurify';

// Reading view only: original HTML/text is always available in the message expander.
export function emailConversationText(message = {}) {
  let text = String(message.body_text || '');
  if (message.body_html) {
    const fragment = DOMPurify.sanitize(message.body_html, { RETURN_DOM_FRAGMENT: true });
    const container = document.createElement('div');
    container.append(fragment);
    container.querySelectorAll('style,script,img,blockquote,.gmail_quote,.gmail_signature,.moz-signature,[data-smartmail="gmail_signature"]').forEach(node => node.remove());
    for (const link of container.querySelectorAll('a')) {
      const href = link.getAttribute('href') || '';
      const label = link.textContent.trim();
      if (/^https?:\/\//i.test(href) && label && label !== href) link.append(document.createTextNode(` (${href})`));
    }
    container.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
    container.querySelectorAll('p,div,li,tr,h1,h2,h3,h4,pre,table').forEach(node => node.append(document.createTextNode('\n')));
    text = container.textContent || text;
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^On .{5,}wrote:$/i.test(line) || /^[-_]{2,}\s*(Original Message|Forwarded message)/i.test(line)
      || /^>/.test(line) || /^From:\s*.+/i.test(line) && lines.slice(i + 1, i + 5).some(v => /^(?:Sent|Date|To|Subject):/i.test(v.trim()))) {
      end = i; break;
    }
    // Only explicit signature boundaries, never a sentence that merely says thanks.
    if (/^(?:--|Sent from my (?:iPhone|iPad|Android).*)$/.test(line)
      || /^(?:Best regards|Kind regards|Warm regards|Sincerely|Regards|Thank you|Thanks|Best)[,!]?$/i.test(line)
        && lines.slice(i + 1).filter(v => v.trim()).length <= 8) { end = i; break; }
    if (/^(?:CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!?|Part of the SchoolCareBridge network|A program of MH4Kidz)$/i.test(line)) { end = i; break; }
  }
  const compact = lines.slice(0, end).join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return compact || text.trim();
}
