export const SMS_CATEGORY_LABELS = Object.freeze({
  exchange_matches: ['Client Exchange texts', 'NOEXCHANGE'],
  client_forwarding: ['client text forwarding', 'NOCLIENTS'],
  reminders: ['appointment reminders', 'NOREMIND'],
  staff_reminders: ['meeting and supervision reminder texts', 'NOREMIND'],
  links: ['session links', 'NOLINK'],
  forms: ['form texts', 'NOFORM'],
  account: ['account notices', 'NOACCOUNT'],
  conversations: ['provider texts', 'NOPROVIDER']
});

export function categoryRestartMessage(brand, restored) {
  const entries = [...new Set(restored)].map(key => SMS_CATEGORY_LABELS[key]).filter(Boolean);
  if (!entries.length) return `${brand}: No previously consented text categories were turned back on. Review your communication settings or contact support. Reply STOP to stop all texts or HELP for help.`;
  return `${brand}: Turned back on: ${entries.map(([label]) => label).join(', ')}. To turn any off separately, reply ${entries.map(([label, keyword]) => `${keyword} (${label})`).join('; ')}. Reply STOP to stop all texts or HELP for help.`;
}
