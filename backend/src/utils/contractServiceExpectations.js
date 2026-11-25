import { findContractPlaceholders } from './contractPlaceholders.js';

export function minimumWeeklyHours(minHours) {
  const raw = String(minHours ?? '').trim();
  if (!raw) return null;
  // Older contract-builder entries can read "Ten (10) Hours" or "6 hours".
  const numeric = raw.match(/^(?:[a-z -]+\(\s*(\d+(?:\.\d+)?)\s*\)|(\d+(?:\.\d+)?))\s*(?:hours?)?$/i);
  if (!numeric) return null;
  const hours = Number(numeric[1] ?? numeric[2]);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return hours;
}

export function weeklyRequiredHours(minHours) {
  const hours = minimumWeeklyHours(minHours);
  if (hours == null) return null;
  const capacity = Math.ceil(hours * 1.25);
  return Number.isSafeInteger(capacity) ? capacity : null;
}

// Apply to stored and newly authored clauses alike, before token replacement.
export function withWeeklyHoursExpectations(html, { append = true } = {}) {
  const original = String(html || '');
  const oldParagraph = /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<strong>Weekly availability and scheduling expectations:<\/strong>(?:(?!<\/p>)[\s\S])*?<\/p>|<p\b[^>]*data-weekly-hours-expectations[^>]*>[\s\S]*?<\/p>/gi;
  const source = original.replace(oldParagraph, '').trimEnd();
  if (!append) return source;
  const fields = findContractPlaceholders(source).map(key => key.replaceAll('_', ''));
  if (!fields.includes('MINHOURS') && original === source) return source;
  return `${source}\n<p data-weekly-hours-expectations="true"><strong>Weekly availability and scheduling expectations.</strong> The individual minimum is {{MIN_HOURS}} direct-service hours per week. The {{ROLE_LABEL}} must maintain at least {{MIN_AVAILABLE_HOURS}} hours per week of client-bookable availability in the app and plan to schedule at least {{MIN_SCHEDULED_HOURS}} hours per week. Both figures use the direct-service minimum plus 25%, rounded up to the next whole hour. Follow the individual schedule in this agreement for agreed days and arrangements. Compensation for approved work follows the agreement’s pay terms.</p>`;
}
