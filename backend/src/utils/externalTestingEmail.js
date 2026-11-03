// The owner and testers review testing@ mail in their external inboxes.
// Match envelope addresses only; mentioning testing@ in a body is ordinary mail.
export function isExternalTestingEmail(...values) {
  const matches = value => {
    if (Array.isArray(value)) return value.some(matches);
    if (value && typeof value === 'object') return matches(value.email || value.address);
    return /(?:^|[<,;\s])testing(?:\+[^@<>,;\s]+)?@[^@<>,;\s]+(?=$|[>,;\s])/i.test(String(value || '').trim());
  };
  return values.some(matches);
}

export function isExternalTestingMailHeaders(headers) {
  const names = ['from', 'to', 'cc', 'bcc', 'reply-to', 'sender', 'delivered-to',
    'x-original-to', 'envelope-to', 'x-original-sender', 'x-google-original-from'];
  return names.some(name => isExternalTestingEmail(headers.get(name)));
}

export function isExternalTestingHistory(row) {
  if (String(row?.channel || 'email').toLowerCase() !== 'email') return false;
  let metadata = row?.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  return isExternalTestingEmail(row?.recipient_address || row?.recipientAddress, metadata?.deliveredTo);
}

// Keep outbound transport receipts for deduplication and delivery processing,
// while excluding external testing mail from app history, lists, and counts.
export function appCommunicationVisibilitySql(alias = '') {
  if (alias && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL alias');
  const prefix = alias ? `${alias}.` : '';
  const direct = `COALESCE(${prefix}recipient_address, '')`;
  const delivered = `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${prefix}metadata, '$.deliveredTo')), '')`;
  const pattern = "'(^|[[:space:],;<])testing([+][^@,;[:space:]]+)?@'";
  return `(${prefix}channel <> 'email' OR (NOT REGEXP_LIKE(${direct}, ${pattern}, 'i')
    AND NOT REGEXP_LIKE(${delivered}, ${pattern}, 'i')))`;
}
