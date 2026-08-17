/**
 * Display-only school status: legacy "Current" is retired.
 * Returning / leftover current rows show Fall Confirmation Pending (no weekday)
 * or Ready to Schedule (weekday assigned).
 */
import { isDateInCurrentSchoolYear } from './schoolYear.js';

const KEEP_KEY_LABELS = {
  being_seen: 'Being Seen',
  scheduled: 'Scheduled',
  ready_to_schedule: 'Ready to Schedule',
  waitlist: 'Waitlist',
  terminated: 'Terminated',
  archived: 'Archived',
  unable_to_reach: 'Unable to Reach',
  other_transfer: 'Other / Transfer',
  recommend_termination: 'Recommend Termination',
  received: 'Received',
  packet: 'Packet',
  pending_corrections: 'Pending Corrections',
  in_process: 'In Process',
  screener: 'Screener',
  spring_update_pending: 'Spring Update – Pending',
  not_returning: 'Not Returning'
};

const FALL_PENDING_LABEL = 'Fall Confirmation Pending';
const READY_LABEL = 'Ready to Schedule';

function hasWeekday(client) {
  if (client?.has_weekday === true || client?.has_weekday === 1) return true;
  const day = String(client?.service_day || '').trim();
  if (day && day.toLowerCase() !== 'unknown' && /(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(day)) {
    return true;
  }
  const pairs = String(client?.provider_day_pairs || '');
  return /:(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(pairs);
}

function julyCutoffYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
}

function isReturningSchoolClient(client, now = new Date()) {
  const type = String(client?.client_type || '').toLowerCase();
  const schoolLike = type === 'school' || !!Number(client?.organization_id) || !!String(client?.organization_name || '').trim();
  if (!schoolLike) return false;
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  if (statusKey === 'terminated' || statusKey === 'waitlist') return false;
  if (client?.staff_onboarding_completed_at) return true;
  if (['onboarded', 'current', 'returning', 'confirmation_pending', 'confirmed_returning'].includes(statusKey)) {
    return true;
  }
  const sub = client?.submission_date ? String(client.submission_date).slice(0, 10) : '';
  const created = client?.created_at ? String(client.created_at).slice(0, 10) : '';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : created;
  if (anchor && anchor < julyCutoffYmd(now)) return true;
  return false;
}

function servicesConfirmedThisSchoolYear(client, now = new Date()) {
  if (isDateInCurrentSchoolYear(client?.services_started_at, now)) return true;
  if (isReturningSchoolClient(client, now)) return false;
  return isDateInCurrentSchoolYear(client?.first_service_at, now);
}

function isLegacyCurrent(client) {
  const key = String(client?.client_status_key || '').toLowerCase();
  const label = String(client?.client_status_label || '').trim();
  if (key === 'current') return true;
  if (/^current$/i.test(label)) return true;
  if (!key && String(client?.status || '').toUpperCase() === 'ACTIVE') return true;
  return false;
}

function isSchoolLike(client) {
  const type = String(client?.client_type || '').toLowerCase();
  if (type === 'school') return true;
  if (Number(client?.organization_id) > 0) return true;
  if (String(client?.organization_name || '').trim()) return true;
  return false;
}

export function displaySchoolClientStatusLabel(client, now = new Date()) {
  if (!client) return '—';
  const key = String(client?.client_status_key || '').toLowerCase();
  const catalogLabel = String(client?.client_status_label || '').trim();

  if (!isSchoolLike(client) && !isLegacyCurrent(client)) {
    return catalogLabel || KEEP_KEY_LABELS[key] || catalogLabel || '—';
  }

  const weekday = hasWeekday(client);
  const returning = isReturningSchoolClient(client, now);

  if (key === 'being_seen') {
    if (servicesConfirmedThisSchoolYear(client, now) || !returning) {
      return KEEP_KEY_LABELS.being_seen;
    }
    return weekday ? KEEP_KEY_LABELS.scheduled : FALL_PENDING_LABEL;
  }

  if (KEEP_KEY_LABELS[key] && key !== 'ready_to_schedule') {
    return KEEP_KEY_LABELS[key];
  }
  const fallPendingKeys = new Set([
    'confirmation_pending',
    'continuation_unknown',
    'confirmed_returning',
    'returning',
    'ready_to_schedule'
  ]);

  if (isLegacyCurrent(client) || fallPendingKeys.has(key) || (returning && ['pending', 'onboarded', ''].includes(key))) {
    return weekday ? READY_LABEL : FALL_PENDING_LABEL;
  }

  if (catalogLabel && !/^current$/i.test(catalogLabel)) return catalogLabel;
  return catalogLabel || '—';
}

export function assignedDayDisplay(client) {
  const raw = String(client?.service_day || '').trim();
  if (!raw || raw.toLowerCase() === 'unknown') return 'Not assigned';
  return raw;
}
