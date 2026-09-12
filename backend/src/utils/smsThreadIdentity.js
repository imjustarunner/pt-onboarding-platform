export function normalizeSmsPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
}

export function smsThreadKey({ clientId, contactId, fromNumber, toNumber, direction }) {
  const from = normalizeSmsPhone(fromNumber);
  const to = normalizeSmsPhone(toNumber);
  if (!from || !to || (!Number(clientId) && !Number(contactId))) return null;
  const inbound = String(direction).toLowerCase() === 'inbound';
  return `sms:v2:${clientId ? `client:${Number(clientId)}` : `contact:${Number(contactId)}`}:${inbound ? to : from}:${inbound ? from : to}`;
}

export function parseSmsThreadKey(key) {
  const match = /^sms:v2:(client|contact):(\d+):(\+[1-9]\d{6,14}):(\+[1-9]\d{6,14})$/.exec(String(key || ''));
  if (!match) return null;
  return { clientId: match[1] === 'client' ? Number(match[2]) : null, contactId: match[1] === 'contact' ? Number(match[2]) : null, fromNumber: match[3], toNumber: match[4], threadKey: key };
}
