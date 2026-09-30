import DOMPurify from 'dompurify';

export function readableEmailHtml({ body_html, body_text } = {}, { collapseQuotes = true } = {}) {
  const html = body_html || '';
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['a','p','br','div','span','strong','b','em','i','u','s','ul','ol','li','blockquote','pre','code','hr','h1','h2','h3','h4','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR: ['href','title','class','colspan','rowspan'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false
  });
  const container = document.createElement('div');
  container.append(fragment);
  if (!html) {
    const text = String(body_text || '');
    // Use text nodes for all sender-controlled text, including URL labels.
    const pattern = /https?:\/\/[^\s<>]+/gi;
    let position = 0;
    for (const match of text.matchAll(pattern)) {
      const url = match[0].replace(/[.,;!?)\]]+$/, '');
      container.append(document.createTextNode(text.slice(position, match.index)));
      const link = document.createElement('a'); link.href = url; link.textContent = url; container.append(link);
      position = match.index + url.length;
    }
    container.append(document.createTextNode(text.slice(position)));
  }
  if (collapseQuotes) {
    for (const quoted of container.querySelectorAll('blockquote,.gmail_quote,.gmail_signature')) {
      if (quoted.closest('details')) continue;
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = quoted.classList.contains('gmail_signature') ? 'Show signature' : 'Show quoted conversation';
      quoted.replaceWith(details); details.append(summary, quoted);
    }
  }
  for (const node of container.querySelectorAll('[class]')) node.removeAttribute('class');
  for (const link of container.querySelectorAll('a')) {
    const href = link.getAttribute('href') || '';
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) link.removeAttribute('href');
    else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  }
  return container.innerHTML;
}

export function emailDeliveryLabel(message = {}) {
  switch (message.send_status) {
    case 'scheduled': return message.scheduled_send_at ? `Scheduled for ${new Date(message.scheduled_send_at).toLocaleString()}` : 'Queued for delivery';
    case 'queued': case 'pending': return 'Queued for delivery';
    case 'sending': return 'Sending…';
    case 'failed': return 'Send failed — this email was not confirmed sent';
    case 'cancelled': return 'Send cancelled';
    case 'sent': return message.direction === 'outbound' ? 'Sent' : '';
    default: return message.send_status ? 'Delivery confirmation pending' : '';
  }
}
