export function cancellationClientLabel(item) {
  const names = (item.clients || []).map(client => client.clientName).filter(Boolean);
  return (names.length ? names : item.recipients || []).join(', ');
}

export function selectedCancellationLetters(item, message, choices = null) {
  if (!message) return [];
  const roles = new Set();
  for (const client of item.clients || []) {
    const selected = choices?.[client.clientId] || client;
    if (selected.mode === 'none') continue;
    for (const contact of selected.recipients || client.recipients || []) {
      if (contact.enabled !== false && (selected.mode === 'both' || contact.role === selected.mode)) roles.add(contact.role);
    }
  }
  // Older records can lack audience details. Preserve their editable single
  // message; current records use only the contacts selected for delivery.
  if (!item.clients?.length) for (const audience of ['guardian', 'client']) if (message[audience]) roles.add(audience);
  const hasVersions = !!(message.guardian || message.client);
  if (!hasVersions) return item.clients?.length && !roles.size ? [] : [{ audience: [...roles][0] || 'client', label: 'Email', message }];
  return ['guardian', 'client'].filter(role => roles.has(role) && message[role]).map(audience => ({ audience,
    label: audience === 'guardian' ? 'Parent / guardian email' : 'Client email', message: { ...message[audience], subject: message.subject } }));
}
