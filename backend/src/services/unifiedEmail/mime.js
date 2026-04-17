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
 * RFC 2047 encoded-word (base64) for UTF-8 Subject headers.
 */
function encodeRfc2047Subject(subject) {
  const raw = String(subject || '');
  if (!raw) return '';
  const asciiOnly = /^[\x09\x20-\x7E]*$/.test(raw);
  if (asciiOnly) return normalizeHeaderValue(raw);
  const b64 = Buffer.from(raw, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

/**
 * Quoted-printable for UTF-8 body parts (soft line breaks at ~72 octets).
 */
function utf8ToQuotedPrintable(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const buf = Buffer.from(normalized, 'utf8');
  let out = '';
  let lineLen = 0;
  const pushEnc = (enc) => {
    if (lineLen + enc.length > 73 && lineLen > 0) {
      out += '=\r\n';
      lineLen = 0;
    }
    out += enc;
    lineLen += enc.length;
  };
  for (let i = 0; i < buf.length; i += 1) {
    const b = buf[i];
    if (b === 0x0a) {
      out += '\r\n';
      lineLen = 0;
      continue;
    }
    if (b === 0x0d) continue;
    const printable = (b >= 33 && b <= 60) || (b >= 62 && b <= 126);
    if (printable || b === 0x09) {
      pushEnc(String.fromCharCode(b));
    } else if (b === 0x20) {
      pushEnc(' ');
    } else {
      pushEnc(`=${b.toString(16).toUpperCase().padStart(2, '0')}`);
    }
  }
  return out;
}

/**
 * Build an RFC 5322 message for Gmail API "raw".
 * Supports plain, html, or multipart/alternative.
 * Subject uses RFC 2047 when non-ASCII; bodies use quoted-printable UTF-8.
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
    `Subject: ${encodeRfc2047Subject(subject)}`,
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
      'Content-Transfer-Encoding: quoted-printable',
      '',
      utf8ToQuotedPrintable(String(text || '')),
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      utf8ToQuotedPrintable(String(html || text || '')),
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
      'Content-Transfer-Encoding: quoted-printable',
      '',
      utf8ToQuotedPrintable(String(text)),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      utf8ToQuotedPrintable(String(html)),
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

  if (html) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: quoted-printable');
    return [...headers, '', utf8ToQuotedPrintable(String(html)), ''].join('\r\n');
  }

  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: quoted-printable');
  return [...headers, '', utf8ToQuotedPrintable(String(text || '')), ''].join('\r\n');
}

export { base64UrlEncode, buildMimeMessage, encodeRfc2047Subject, utf8ToQuotedPrintable };
