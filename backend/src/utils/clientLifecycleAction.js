/**
 * Pure helper: next Action for roster Action column (no DB).
 * Returns { role, actionKey, label } or null.
 *
 * Agency Ready-to-Schedule gate for returners = disclosure + insurance only.
 * ROI renewal is a non-blocking Action item (does not hold Ready to Schedule).
 */

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

import {
  continuingClientDisclosureAutoOk,
  continuingInsuranceOverrideActive,
  isContinuingSchoolClient,
  isReturningSchoolClient,
  servicesConfirmedThisSchoolYear
} from './fallReadiness.js';

const NO_AGENCY_CLEARANCE = new Set([
  'terminated',
  'waitlist',
  'recommend_termination',
  'unable_to_reach',
  'not_returning',
  'confirmation_pending', // waiting on provider fall confirmation / reassignment — not agency clearance
  'continuation_unknown',
  'returning',
  'spring_update_pending',
  'other_transfer'
]);

function truthy(v) {
  return v === true || v === 1 || v === 'true' || v === '1';
}

function continuationBlocksAgencyClearance(continuation) {
  if (!continuation || typeof continuation !== 'object') return false;
  if (truthy(continuation.recommendTerminate)) return true;
  if (truthy(continuation.removeFromAssignment)) return true;
  if (String(continuation.plan || '') === 'not_continue_school') return true;
  return false;
}

function clientHasWeekday(client) {
  if (truthy(client?.has_weekday)) return true;
  const day = String(client?.service_day || '').trim();
  if (day && /(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(day)) return true;
  const pairs = String(client?.provider_day_pairs || '');
  return /:(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(pairs);
}

function clientHasAssignedProvider(client) {
  if (client?.has_provider === false || client?.has_provider === 0) return false;
  if (truthy(client?.has_provider)) return true;
  if (Number(client?.provider_id) > 0) return true;
  const ids = String(client?.provider_ids || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length) return true;
  // Unknown (unit tests / incomplete rows): assume assigned. Portal always sets has_provider.
  return client?.has_provider == null;
}

export function deriveLifecycleAction({ client, viewerRole, disposition = null, now = new Date() }) {
  const role = String(viewerRole || '').toLowerCase();
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  const agencyIntake = parseJson(client?.agency_intake_json) || {};
  const clearance = parseJson(disposition?.agency_clearance_json) || parseJson(client?.agency_clearance_json) || {};
  const continuation = parseJson(client?.continuation_services_json) || {};
  const isAgency = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
  const isProvider = ['provider', 'provider_plus', 'intern', 'intern_plus'].includes(role);

  if (statusKey === 'terminated' || statusKey === 'waitlist') return null;

  // Recommend/initiate terminate (or terminated fall plan) — drop agency clearance Actions
  if (truthy(continuation.recommendTerminate) || String(continuation.plan || '') === 'not_continue_school') {
    if (isAgency) {
      // Still allow ROI follow-up only if somehow still active; otherwise no Action
      const roiExpiredTerminate = client?.roi_expired === true
        || client?.agency_roi_expired === true
        || (client?.roi_expires_at != null && String(client.roi_expires_at).slice(0, 10) < new Date().toISOString().slice(0, 10));
      if (roiExpiredTerminate && statusKey !== 'terminated' && !truthy(clearance.roiNoted)) {
        return { role: 'agency', actionKey: 'roi_followup', label: 'ROI renewal – Action item' };
      }
      return null;
    }
  }

  if (isAgency) {
    if (['received', 'packet', 'pending_corrections', 'in_process'].includes(statusKey)) {
      return { role: 'agency', actionKey: 'agency_intake', label: 'Complete agency intake' };
    }
    if (agencyIntake.pendingCorrections === true) {
      return { role: 'agency', actionKey: 'agency_intake', label: 'Resolve corrections' };
    }

    if (
      statusKey === 'confirmation_pending'
      && !continuationBlocksAgencyClearance(continuation)
      && needsInsuranceClearance({ client, disposition, ignoreOverride: true, now })
    ) {
      return { role: 'agency', actionKey: 'agency_clearance', label: 'Insurance check' };
    }

    const roiExpired = client?.roi_expired === true
      || client?.agency_roi_expired === true
      || (client?.roi_expires_at != null && String(client.roi_expires_at).slice(0, 10) < new Date().toISOString().slice(0, 10));

    if (!NO_AGENCY_CLEARANCE.has(statusKey)) {
      const continuingDisclosureOk = continuingClientDisclosureAutoOk({
        client_type: 'school',
        client_status_key: statusKey
      });
      // Same provider year-over-year: disclosure already satisfied when disclosure_required is false.
      const sameProviderOk = client?.disclosure_required !== true && client?.disclosure_required !== 1;
      const disclosureOk = continuingDisclosureOk
        || clearance.disclosureOk === true
        || client?.disclosure_ok === true
        || sameProviderOk;
      const insuranceOverride = continuingInsuranceOverrideActive(now) && isContinuingSchoolClient({
        client_type: 'school',
        client_status_key: statusKey
      });
      const insuranceOk = insuranceOverride
        || clearance.insuranceOk === true
        || client?.insurance_cleared === true;
      const agencyCleared = disposition?.agency_cleared_at != null || clearance.agencyCleared === true;

      const needsClearanceGate = ['confirmed_returning', 'ready_to_schedule', 'scheduled', 'current', 'pending', 'onboarded'].includes(statusKey);
      if (needsClearanceGate && !agencyCleared) {
        if (!disclosureOk) {
          return { role: 'agency', actionKey: 'agency_clearance', label: 'Provider disclosure check' };
        }
        if (!insuranceOk) {
          return { role: 'agency', actionKey: 'agency_clearance', label: 'Insurance check' };
        }
      }
    }

    // Non-blocking ROI Action (does not gate Ready to Schedule)
    if (
      roiExpired
      && !truthy(clearance.roiNoted)
      && !['terminated', 'recommend_termination', 'unable_to_reach', 'confirmation_pending'].includes(statusKey)
    ) {
      return { role: 'agency', actionKey: 'roi_followup', label: 'ROI renewal – Action item' };
    }
  }

  if (isProvider) {
    if (statusKey === 'spring_update_pending') {
      return { role: 'provider', actionKey: 'spring_update', label: 'Spring Update – Action Needed' };
    }
    const fallDone = disposition?.fall_completed_at != null;
    const fallOutcome = String(disposition?.fall_outcome || '').toLowerCase();
    const hasWeekday = clientHasWeekday(client);
    const hasProvider = clientHasAssignedProvider(client);
    const returning = isReturningSchoolClient({ ...client, client_type: client?.client_type || 'school' }, now);
    const beingSeenConfirmed = servicesConfirmedThisSchoolYear(
      { ...client, client_type: client?.client_type || 'school' },
      now
    );
    const leftoverBeingSeen = returning && statusKey === 'being_seen' && !beingSeenConfirmed;
    const fallPendingStatuses = ['confirmation_pending', 'continuation_unknown', 'unable_to_reach', 'other_transfer'];
    const fallConfirmedOrTerminated = fallOutcome === 'confirmed_returning' || fallOutcome === 'recommend_termination';
    // Unassigned / already placed returning clients: do not show a generic Fall confirmation.
    if (fallPendingStatuses.includes(statusKey)) {
      if (!hasProvider) return null;
      if (fallDone && fallConfirmedOrTerminated) return null;
      if (fallDone) {
        return { role: 'provider', actionKey: 'fall_confirmation', label: 'Update', quiet: true };
      }
      if (hasWeekday) return null;
      return { role: 'provider', actionKey: 'fall_confirmation', label: 'Fall confirmation – Action Needed' };
    }
    if (!fallDone && ['returning', 'current', 'pending', 'onboarded', 'confirmed_returning'].includes(statusKey)) {
      if (!hasProvider || hasWeekday) return null;
      return { role: 'provider', actionKey: 'fall_confirmation', label: 'Fall confirmation – Action Needed' };
    }
    // Returners who reached Ready to Schedule still need a weekday before they are placed.
    if (!fallDone && returning && statusKey === 'ready_to_schedule') {
      if (!hasProvider || hasWeekday) return null;
      return { role: 'provider', actionKey: 'fall_confirmation', label: 'Fall confirmation – Action Needed' };
    }
    // Returners: after Scheduled, one action to mark Being Seen (last year's first_service_at does not count).
    if (returning && (statusKey === 'scheduled' || leftoverBeingSeen) && !beingSeenConfirmed) {
      if (leftoverBeingSeen && !hasWeekday) return null;
      return { role: 'provider', actionKey: 'confirm_services_started', label: 'Mark Being Seen' };
    }
    if (returning && statusKey === 'ready_to_schedule' && hasWeekday) {
      return null;
    }
    // New clients: Being Seen comes from the new-client checklist, including after they are Scheduled.
    if (!returning && ['ready_to_schedule', 'scheduled'].includes(statusKey) && !beingSeenConfirmed) {
      if (statusKey === 'scheduled' && client?.first_service_at) return null;
      return { role: 'provider', actionKey: 'provider_intake', label: 'New Client – Action Needed' };
    }
  }

  return null;
}

/**
 * Insurance agency-clearance still owed, even during the temporary continuing-client
 * insurance override window (through CONTINUING_INSURANCE_OVERRIDE_UNTIL_YMD).
 */
export function needsInsuranceClearance({ client, disposition = null, ignoreOverride = false, now = new Date() }) {
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  if (statusKey === 'terminated' || statusKey === 'waitlist') return false;
  if (NO_AGENCY_CLEARANCE.has(statusKey) && statusKey !== 'confirmation_pending') return false;
  const continuation = parseJson(client?.continuation_services_json) || {};
  if (continuationBlocksAgencyClearance(continuation)) return false;
  if (truthy(continuation.recommendTerminate) || String(continuation.plan || '') === 'not_continue_school') {
    return false;
  }
  const clearance = parseJson(disposition?.agency_clearance_json) || parseJson(client?.agency_clearance_json) || {};
  if (disposition?.agency_cleared_at != null || clearance.agencyCleared === true) return false;
  const needsClearanceGate = [
    'confirmed_returning',
    'ready_to_schedule',
    'scheduled',
    'current',
    'pending',
    'onboarded',
    'confirmation_pending'
  ].includes(statusKey);
  if (!needsClearanceGate) return false;
  if (!ignoreOverride) {
    const insuranceOverride = continuingInsuranceOverrideActive(now) && isContinuingSchoolClient({
      client_type: client?.client_type || 'school',
      client_status_key: statusKey
    });
    if (insuranceOverride) return false;
  }
  return !(clearance.insuranceOk === true || client?.insurance_cleared === true);
}
