import sanitizeHtml from 'sanitize-html';

export const EMAIL_HISTORY_MARKER = '<!-- pt-quoted-email-history -->';
export const EMAIL_HISTORY_TEXT_MARKER = '\n\n---------- Earlier messages ----------\n';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Line breaks in plain email are not separate paragraphs with default margins.
export function plainEmailHtml(text) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.5;overflow-wrap:anywhere;">${escape(text).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')}</div>`;
}

export function sanitizeQuotedEmailHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['a','p','br','div','span','strong','b','em','i','u','s','ul','ol','li','blockquote','pre','code','hr','h1','h2','h3','h4','table','thead','tbody','tr','th','td','img'],
    allowedAttributes: { '*':['style'], a:['href','title'], img:['src','alt','width','height'], td:['colspan','rowspan'], th:['colspan','rowspan'] },
    allowedSchemes: ['https','http','mailto','tel'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    allowedStyles: { '*': {
      'color': [/^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i],
      'background-color': [/^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,%\s]+\))$/i],
      'font-family': [/^[a-z ,"'-]+$/i], 'font-size': [/^[\d.]+(?:px|pt|em|rem|%)$/],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/], 'font-style': [/^(?:normal|italic)$/],
      'text-align': [/^(?:left|right|center|justify)$/], 'text-decoration': [/^(?:none|underline|line-through)$/],
      'vertical-align': [/^(?:top|middle|bottom|baseline)$/], 'line-height': [/^[\d.]+(?:px|em|%)?$/],
      'padding': [/^[\d.\s]+(?:px|em|rem|%)(?:[\d.\s]+(?:px|em|rem|%))*$/],
      'margin': [/^[\d.\s]+(?:px|em|rem|%)(?:[\d.\s]+(?:px|em|rem|%))*$/],
      'width': [/^[\d.]+(?:px|%)$/], 'max-width': [/^[\d.]+(?:px|%)$/],
      'height': [/^(?:auto|[\d.]+(?:px|%))$/], 'border-collapse': [/^(?:collapse|separate)$/]
    } },
    transformTags: { img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, style: 'max-width:100%;height:auto' } }) }
  });
}

export function emailDraftContent(draft) {
  const quote = sanitizeQuotedEmailHtml(draft.quotedHtml);
  const quotedText = String(draft.quotedText || '');
  const history = quote || (quotedText ? plainEmailHtml(quotedText) : '');
  return {
    text: `${draft.text || ''}${quotedText ? EMAIL_HISTORY_TEXT_MARKER + quotedText : ''}`,
    html: `${plainEmailHtml(draft.text)}${history ? `${EMAIL_HISTORY_MARKER}<div class="gmail_quote"><blockquote style="margin:20px 0 0;padding:12px 0 0 12px;border-left:2px solid #cbd5e1;">${history}</blockquote></div>` : ''}`
  };
}

// Sign the new writing, then restore the historical messages after that signature.
export function splitEmailHistory({ html, text }) {
  const htmlIndex = String(html || '').indexOf(EMAIL_HISTORY_MARKER);
  if (htmlIndex < 0) return { html, text, historyHtml: '', historyText: '' };
  const textIndex = String(text || '').indexOf(EMAIL_HISTORY_TEXT_MARKER);
  return {
    html: html.slice(0, htmlIndex), historyHtml: html.slice(htmlIndex),
    text: textIndex < 0 ? text : text.slice(0, textIndex),
    historyText: textIndex < 0 ? '' : text.slice(textIndex)
  };
}
