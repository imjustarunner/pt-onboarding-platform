/** Platform floors and practice defaults describe one delivery at a given time. */
export function dedupeSessionReminders(reminders = []) {
  const unique = new Map();
  const priority = row => row.ruleKey === 'tenant_standard' ? 2 : String(row.ruleKey || '').startsWith('platform:') ? 0 : 1;
  for (const row of reminders) {
    const key = JSON.stringify([row.kind, row.channel, row.recipientRole || row.recipient || 'client', Number(row.offsetMinutes), !!row.sendImmediately]);
    const previous = unique.get(key);
    if (!previous) { unique.set(key, { ...row }); continue; }
    const winner = priority(row) >= priority(previous) ? row : previous;
    unique.set(key, { ...winner, isRequired: !!(previous.isRequired || row.isRequired), requiresConfirmation: !!(previous.requiresConfirmation || row.requiresConfirmation) });
  }
  return [...unique.values()];
}
