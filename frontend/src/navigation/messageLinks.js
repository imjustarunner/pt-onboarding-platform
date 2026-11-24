const webScheme = /^https?:\/\//i;

export function messageLinkUrl(input, { addScheme = false } = {}) {
  const value = String(input || '').trim();
  if (!value || /[\s\\<>"\u0000-\u001f\u007f]/u.test(value)) return null;
  const candidate = webScheme.test(value) ? value : addScheme && !/^[a-z][\w+.-]*:/i.test(value) ? `https://${value}` : '';
  if (!webScheme.test(candidate) || !/^https?:\/\/[^/?#]/i.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function messageLinkParts(text) {
  const value = String(text ?? '');
  const parts = [];
  let position = 0;
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let label = match[0].replace(/[.,;:!?]+$/, '');
    // Keep balanced parentheses and square brackets in legitimate URLs.
    for (const [open, close] of [['(', ')'], ['[', ']']]) {
      const count = char => label.split(char).length - 1;
      let excess = count(close) - count(open);
      while (excess > 0 && label.endsWith(close)) {
        label = label.slice(0, -1);
        excess--;
      }
    }
    const url = messageLinkUrl(label);
    if (!url) continue;
    if (match.index > position) parts.push({ text: value.slice(position, match.index) });
    parts.push({ text: label, url });
    position = match.index + label.length;
  }
  if (position < value.length) parts.push({ text: value.slice(position) });
  return parts;
}
