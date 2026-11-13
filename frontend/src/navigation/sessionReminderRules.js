/** Platform floors and practice defaults describe one delivery at a given time. */
export function dedupeSessionReminders(reminders = []) {
  const unique = new Map();
  const priority = row => String(row.ruleKey || '').startsWith('appointment_custom:') ? 3 : row.ruleKey === 'tenant_standard' ? 2 : String(row.ruleKey || '').startsWith('platform:') ? 0 : 1;
  for (const row of reminders) {
    const key = JSON.stringify([row.kind, row.channel, row.recipientRole || row.recipient || 'client', Number(row.offsetMinutes), !!row.sendImmediately]);
    const previous = unique.get(key);
    if (!previous) { unique.set(key, { ...row }); continue; }
    const winner = priority(row) >= priority(previous) ? row : previous;
    unique.set(key, { ...winner, isRequired: !!(previous.isRequired || row.isRequired), requiresConfirmation: !!(previous.requiresConfirmation || row.requiresConfirmation) });
  }
  return [...unique.values()];
}

export function normalizeCustomSessionReminders(input = []) {
  if (!Array.isArray(input) || input.length > 5) throw Object.assign(new Error('Add up to five session reminders.'), { status: 400 });
  return input.map((row, index) => {
    const channel = String(row?.channel || 'email').toLowerCase();
    const offsetMinutes = Number(row?.offsetMinutes);
    const message = String(row?.message || '').trim();
    if (!['email', 'sms', 'in_app'].includes(channel)) throw Object.assign(new Error('Choose email, text or in-app for each reminder.'), { status: 400 });
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < 5 || offsetMinutes > 10080) throw Object.assign(new Error('Set reminders between 5 minutes and 7 days before the session.'), { status: 400 });
    if (message.length > 1000) throw Object.assign(new Error('Keep reminder messages under 1,000 characters.'), { status: 400 });
    const id = /^[a-zA-Z0-9_-]{1,64}$/.test(String(row?.id || '')) ? String(row.id) : `custom-${index + 1}`;
    return { id, channel, offsetMinutes, message, askConfirmation: row?.askConfirmation !== false };
  });
}
