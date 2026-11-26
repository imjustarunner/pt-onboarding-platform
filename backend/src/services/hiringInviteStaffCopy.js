const caption = 'Staff copy · the candidate received a private sign-in link.';
const subjectPrefix = 'Staff copy — ';
const privateLink = /(?:https?:\/\/[^\s<>"'\/]+)?\/(?:pre-hire|prehire-portal|passwordless(?:-login)?)\/([a-z0-9._%=-]+)(?:[^\s<>"']*)/gi;
const trackingImage = /<img\b[^>]*\/api\/email\/track-open\/[^>]*>/gi;

export function storedHiringInviteMessage(comm) {
  const body = String(comm.body || '');
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  return {
    subject: comm.subject,
    html: isHtml ? body : null,
    text: isHtml ? null : body
  };
}

export function hiringInviteStaffCopy(message, fallback) {
  const subject = String(message?.subject || fallback.subject);
  const text = String(message?.text || '');
  const html = String(message?.html || '');
  // Strip both URLs and any matching bare tokens from custom messages and old stored emails.
  const tokens = new Set();
  for (const match of `${subject}\n${text}\n${html}`.matchAll(privateLink)) {
    if (match[1].length >= 16) tokens.add(match[1]);
  }
  function redact(value, label) {
    let result = value.replace(privateLink, label);
    for (const token of tokens) result = result.replaceAll(token, label);
    return result;
  }
  const alreadyCopy = subject.startsWith(subjectPrefix);
  const staffSubject = redact(subject, '[private link]');
  return {
    subject: (alreadyCopy ? staffSubject : subjectPrefix + staffSubject).slice(0, 240),
    text: text ? (alreadyCopy ? '' : `${caption}\n\n`) + redact(text, '[private link]') : html ? null : fallback.text,
    html: html ? (alreadyCopy ? '' : `<p style="font:14px Arial,sans-serif;color:#526469;">${caption}</p>`)
      + redact(html.replace(trackingImage, ''), '#private-candidate-link') : null
  };
}
