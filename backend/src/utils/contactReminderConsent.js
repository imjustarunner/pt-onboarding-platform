import { createHash } from 'node:crypto';
import { normalizeSmsPhone } from './smsThreadIdentity.js';
export const contactReminderPhoneHash = phone => {
  const normalized = normalizeSmsPhone(phone);
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
};
export const contactReminderConsentLock = (sender, phone) => `contact-consent:${createHash('sha256').update(`${sender.registration?.provider === 'notifyre' ? 'notifyre-account' : sender.scope}:${normalizeSmsPhone(phone)}`).digest('hex').slice(0, 40)}`;
