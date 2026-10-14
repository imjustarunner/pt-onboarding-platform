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
export function withWeeklyHoursExpectations(html) {
  const source = String(html || '');
  const fields = findContractPlaceholders(source).map(key => key.replaceAll('_', ''));
  if (!fields.includes('MINHOURS') || source.includes('data-weekly-hours-expectations')) return source;
  return `${source}\n<p data-weekly-hours-expectations="true"><strong>Weekly availability and scheduling expectations:</strong> To meet the minimum weekly direct-service expectation stated above, the {{ROLE_LABEL}} must list and maintain at least {{MIN_AVAILABLE_HOURS}} hours per week of client-bookable availability in the app and is expected to schedule at least {{MIN_SCHEDULED_HOURS}} hours per week to support achieving the compensation rate for the selected category and level. Both available-to-book hours and expected scheduled hours equal the minimum weekly direct-service hours plus 25%, rounded up to the next whole hour, to account for no-shows, cancellations and rescheduling. These two expectations are calculated automatically whenever the minimum changes; they do not require separate entries. Compensation for approved services actually performed remains subject to the Agreement and applicable Practice compensation policies.</p>`;
}
