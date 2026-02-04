function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeHeaderValue(v) {
  // Prevent header injection (CRLF)
  return String(v || '').replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Build an RFC 5322 message for Gmail API "raw".
 * Supports plain, html, or multipart/alternative.
 */
function buildMimeMessage({
  to,
  subject,
  text = null,
  html = null,
  from,
  replyTo = null,
  inReplyTo = null,
  references = null,
  attachments = null
}) {
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const headers = [
    `To: ${normalizeHeaderValue(to)}`,
    `Subject: ${normalizeHeaderValue(subject)}`,
    `From: ${normalizeHeaderValue(from)}`,
    ...(replyTo ? [`Reply-To: ${normalizeHeaderValue(replyTo)}`] : []),
    ...(inReplyTo ? [`In-Reply-To: ${normalizeHeaderValue(inReplyTo)}`] : []),
    ...(references ? [`References: ${normalizeHeaderValue(references)}`] : []),
    'MIME-Version: 1.0'
  ];

  if (hasAttachments) {
    const boundary = `mixed_${Math.random().toString(16).slice(2)}`;
    const altBoundary = `alt_${Math.random().toString(16).slice(2)}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

    const parts = [
      ...headers,
      '',
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      String(text || ''),
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      String(html || text || ''),
      '',
      `--${altBoundary}--`,
      ''
    ];

    attachments.forEach((att) => {
      const filename = normalizeHeaderValue(att.filename || 'attachment');
      const contentType = normalizeHeaderValue(att.contentType || 'application/octet-stream');
      const content = att.contentBase64 || '';
      parts.push(
        `--${boundary}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${filename}"`,
        '',
        content,
        ''
      );
    });

    parts.push(`--${boundary}--`, '');
    return parts.join('\r\n');
  }

  if (text && html) {
    const boundary = `alt_${Math.random().toString(16).slice(2)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      String(text),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      String(html),
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

  if (html) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    return [...headers, '', String(html), ''].join('\r\n');
  }

  headers.push('Content-Type: text/plain; charset="UTF-8"');
  return [...headers, '', String(text || ''), ''].join('\r\n');
}

export { base64UrlEncode, buildMimeMessage };

