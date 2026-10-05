/**
 * Display-only school status: legacy "Current" is retired.
 * Returning / leftover current rows show Fall Confirmation Pending (no weekday)
 * or Ready to Schedule (weekday assigned).
 */
import { isReturningSchoolClient, needsFallReassignmentClearance, servicesConfirmedThisSchoolYear } from './fallReadiness.js';

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
  needs_day_assignment: 'Needs Day Assignment',
  screener: 'Screener',
  spring_update_pending: 'Spring Update – Pending',
  not_returning: 'Not Returning'
};

const FALL_PENDING = { key: 'confirmation_pending', label: 'Fall Confirmation Pending' };
const READY = { key: 'ready_to_schedule', label: 'Ready to Schedule' };

function hasWeekday(client) {
  if (client?.has_weekday === true || client?.has_weekday === 1) return true;
  const day = String(client?.service_day || '').trim();
  if (day && day.toLowerCase() !== 'unknown' && /(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(day)) {
    return true;
  }
  const pairs = String(client?.provider_day_pairs || '');
  return /:(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(pairs);
}

function isLegacyCurrent(client) {
  const key = String(client?.client_status_key || '').toLowerCase();
  const label = String(client?.client_status_label || '').trim();
  if (key === 'current') return true;
  if (/^current$/i.test(label)) return true;
  if (!key && String(client?.status || '').toUpperCase() === 'ACTIVE') return true;
  return false;
}

/**
 * @returns {{ key: string, label: string }}
 */
export function resolveSchoolRosterDisplayStatus(client, now = new Date()) {
  const key = String(client?.client_status_key || '').toLowerCase();
  const catalogLabel = String(client?.client_status_label || '').trim();
  const weekday = hasWeekday(client);

  // Stored catalog status wins — don't remap waitlist/terminated/etc. for fall display logic.
  if (key === 'waitlist' || key === 'terminated' || key === 'archived') {
    return { key, label: KEEP_KEY_LABELS[key] || catalogLabel || key };
  }

  // Service evidence and scheduling follow-up are separate facts. Do not reopen
  // closed/paused dispositions merely because a historical date exists.
  const serviceEligible = new Set(['current', 'being_seen', 'ready_to_schedule', 'scheduled',
    'needs_day_assignment', 'onboarded', 'pending', 'confirmation_pending',
    'continuation_unknown', 'confirmed_returning', 'returning', '']);
  if (serviceEligible.has(key) && servicesConfirmedThisSchoolYear({ ...client, client_type: 'school' }, now)) {
    return { key: 'being_seen', label: KEEP_KEY_LABELS.being_seen };
  }

  if (needsFallReassignmentClearance({
    client,
    disposition: {
      fall_completed_at: client?.fall_completed_at,
      fall_outcome: client?.fall_outcome,
      fall_remove_from_assignment: client?.fall_remove_from_assignment,
      agency_cleared_at: client?.agency_cleared_at,
      agency_clearance_json: client?.agency_clearance_json
    }
  })) {
    return FALL_PENDING;
  }
  const returning = isReturningSchoolClient({
    ...client,
    client_type: client?.client_type || 'school'
  }, now);

  if (key === 'being_seen') {
    if (servicesConfirmedThisSchoolYear(client, now) || !returning) {
      return { key: 'being_seen', label: KEEP_KEY_LABELS.being_seen };
    }
    return weekday ? { key: 'scheduled', label: KEEP_KEY_LABELS.scheduled } : FALL_PENDING;
  }

  if (KEEP_KEY_LABELS[key]) {
    return { key, label: KEEP_KEY_LABELS[key] };
  }

  const fallPendingKeys = new Set([
    'confirmation_pending',
    'continuation_unknown',
    'confirmed_returning',
    'returning'
  ]);

  if (isLegacyCurrent(client) || fallPendingKeys.has(key) || (returning && ['pending', 'onboarded', ''].includes(key))) {
    return weekday ? READY : FALL_PENDING;
  }

  if (key === 'pending') {
    return { key: 'pending', label: catalogLabel || 'Pending' };
  }
  if (key === 'onboarded') {
    return { key: 'onboarded', label: catalogLabel || 'Onboarded' };
  }

  if (catalogLabel) return { key: key || null, label: catalogLabel };
  return { key: key || null, label: catalogLabel || '—' };
}

export function applySchoolRosterDisplayStatus(client, now = new Date()) {
  const display = resolveSchoolRosterDisplayStatus(client, now);
  return {
    ...client,
    client_status_key: display.key,
    client_status_label: display.label
  };
}
