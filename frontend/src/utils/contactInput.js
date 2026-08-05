import { digitsOnly } from './phoneDisplay.js';

export { digitsOnly };

/**
 * Permissive email check — accepts modern TLDs (.health, .agency, etc.)
 * without relying on browser type=email or outdated regex lists.
 */
export function isValidEmailAddress(value) {
  const email = String(value || '').trim();
  if (!email || email.length > 254) return false;
  if (/\s/.test(email)) return false;

  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  if (!domain.includes('.')) return false;

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (!/^[A-Za-z]{2,63}$/.test(tld)) return false;

  return true;
}

/** Format US phone as (555) 555-5555 while typing (max 10 digits). */
export function formatUsPhoneInput(raw) {
  const digits = digitsOnly(raw).slice(0, 10);
  if (!digits.length) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidUsPhone(value) {
  const digits = digitsOnly(value);
  if (digits.length === 10) return true;
  return digits.length === 11 && digits.startsWith('1');
}

export function normalizeUsPhoneForSubmit(value) {
  const digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

export const POPULAR_EMAIL_DOMAINS = [
  '@gmail.com',
  '@yahoo.com',
  '@outlook.com',
  '@icloud.com',
  '@hotmail.com'
];

/** Append or replace the domain part when a hint chip is clicked. */
export function applyEmailDomainHint(current, domainHint) {
  const domain = String(domainHint || '').trim();
  const suffix = domain.startsWith('@') ? domain : `@${domain}`;
  const value = String(current || '');
  const at = value.indexOf('@');
  const local = (at === -1 ? value : value.slice(0, at)).trimEnd();
  return `${local}${suffix}`;
}
