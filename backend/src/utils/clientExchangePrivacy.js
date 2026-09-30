import { scrubIntakeTextForNoteWriter } from '../services/phiScrubber.service.js';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Remove known client identity from referral prose, including imported clinical sections. */
export function exchangeSafeText(value, client = {}) {
  let text = String(value || '').replace(/\b(?:full name|legal name|client name|patient name|name|client|patient|student|parent)\s*:[^\n]*/gi, '[Client]');
  const names = [client.full_name, client.first_name, client.last_name].filter(Boolean);
  const tokens = [...names, ...names.flatMap(name => String(name).split(/\s+/)), client.initials, client.identifier_code].filter(token => String(token || '').length >= 2);
  for (const token of [...new Set(tokens)].sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(String(token))}(?![\\p{L}\\p{N}])`, 'giu'), '[Client]');
  }
  return scrubIntakeTextForNoteWriter(text);
}
export function exchangeSafeValue(value, client) {
  if (typeof value === 'string') return exchangeSafeText(value, client);
  if (Array.isArray(value)) return value.map(item => exchangeSafeValue(item, client));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, exchangeSafeValue(item, client)]));
  return value;
}
