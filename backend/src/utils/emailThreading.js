// Subjects describe conversations; they are never conversation identifiers.
export function replyMessageIds(inReplyTo, references) {
  const extract = (value) => String(value || '').match(/<[^<>\s]+@[^<>\s]+>/g) || [];
  return [...new Set([...extract(inReplyTo), ...extract(references).reverse()])];
}

export function emailReplyHeaders(messages, mode = 'reply') {
  if (mode === 'forward') return { inReplyTo: null, referencesHeader: null };
  const parent = [...messages].reverse().find((m) =>
    !m.is_internal_note && (m.send_status || 'sent') === 'sent' &&
    replyMessageIds(m.internet_message_id).length
  );
  if (!parent) return { inReplyTo: null, referencesHeader: null };
  return {
    inReplyTo: parent.internet_message_id,
    referencesHeader: [...new Set([
      ...replyMessageIds(null, parent.references_header).reverse(),
      parent.internet_message_id
    ])].join(' ')
  };
}
