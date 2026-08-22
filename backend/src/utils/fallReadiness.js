/**
 * Fall returning-client readiness helpers.
 * School year cutoff is July 1 (see computeCurrentSchoolYearLabel).
 */
import { computeCurrentSchoolYearLabel, isDateInCurrentSchoolYear, normalizeSchoolYearLabel } from './schoolYear.js';

export const CONTINUATION_WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
export const CONTINUATION_SERVICES_PLANS = new Set([
  'continue_school',
  'not_continue_school',
  'unable_to_contact_parent',
  'other'
]);

export function julyCutoffYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
}

export function parseJsonMaybe(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeContinuationWeekday(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const title = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return CONTINUATION_WEEKDAYS.has(title) ? title : null;
}

/** Date of created_at / submission_date as YYYY-MM-DD, or null. */
export function clientAnchorYmd(client) {
  const sub = client?.submission_date ? String(client.submission_date).slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(sub)) return sub;
  const created = client?.created_at ? String(client.created_at).slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(created)) return created;
  return null;
}

export function isSchoolClientRow(client) {
  return String(client?.client_type || '').toLowerCase() === 'school';
}

/**
 * Returning school client for the current fall season:
 * staff already completed, prior school year, or created/submitted before this July 1.
 */
export function isReturningSchoolClient(client, now = new Date()) {
  if (!isSchoolClientRow(client)) return false;
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  if (statusKey === 'terminated' || statusKey === 'waitlist') return false;
  if (String(client?.status || '').toUpperCase() === 'ARCHIVED') return false;

  if (client?.staff_onboarding_completed_at) return true;
  if (['onboarded', 'current'].includes(statusKey)) return true;

  const currentYear = computeCurrentSchoolYearLabel(now);
  const clientYear = normalizeSchoolYearLabel(client?.school_year);
  if (clientYear && clientYear !== currentYear) return true;

  const anchor = clientAnchorYmd(client);
  if (anchor && anchor < julyCutoffYmd(now)) return true;

  return false;
}

/**
 * Provider confirmed services for the current school year.
 * Returners: only this year's Mark Being Seen date counts (not last year's first_service_at).
 */
export function servicesConfirmedThisSchoolYear(client, now = new Date()) {
  if (isDateInCurrentSchoolYear(client?.services_started_at, now)) return true;
  if (isReturningSchoolClient(client, now)) return false;
  return isDateInCurrentSchoolYear(client?.first_service_at, now);
}

/** New-intake pipeline — not continuing / returning for fall. */
const NEW_CLIENT_INTAKE_KEYS = new Set([
  'received',
  'packet',
  'pending_corrections',
  'in_process',
  'screener',
  'ready_to_schedule'
]);

/**
 * Continuing school client (not brand-new intake). Disclosures are auto-ok in-system.
 */
export function isContinuingSchoolClient(client) {
  if (!isSchoolClientRow(client)) return false;
  const key = String(client?.client_status_key || '').toLowerCase();
  if (NEW_CLIENT_INTAKE_KEYS.has(key) || key === 'waitlist' || key === 'terminated') return false;
  if (String(client?.status || '').toUpperCase() === 'ARCHIVED') return false;
  return true;
}

export function continuingClientDisclosureAutoOk(client) {
  return isContinuingSchoolClient(client);
}

/**
 * Provider fall pushback (unable to reach / other + remove from assignment) needs agency
 * to reassign provider/day and re-confirm disclosure + insurance before Ready to Schedule.
 */
export function needsFallReassignmentClearance({ client, disposition = null } = {}) {
  if (String(client?.client_type || 'school').toLowerCase() !== 'school') return false;
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  if (statusKey === 'waitlist' || statusKey === 'terminated') return false;
  const disp = disposition || {};
  if (!disp.fall_completed_at) return false;
  const outcome = String(disp.fall_outcome || '').toLowerCase();
  const removed = disp.fall_remove_from_assignment === 1 || disp.fall_remove_from_assignment === true;
  if (!removed && outcome !== 'unable_to_reach' && outcome !== 'other_transfer') return false;
  if (disp.agency_cleared_at != null) return false;
  const raw = disp.agency_clearance_json;
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed?.agencyCleared === true) return false;
    } catch {
      // ignore parse errors
    }
  }
  return true;
}

/** Temporary: continuing clients are not blocked on insurance through 2026-08-16. */
export const CONTINUING_INSURANCE_OVERRIDE_UNTIL_YMD = '2026-08-16';

export function continuingInsuranceOverrideActive(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(d.getTime())) return false;
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return ymd <= CONTINUING_INSURANCE_OVERRIDE_UNTIL_YMD;
}

export function needsPriorYearServiceAttest(client) {
  if (!isContinuingSchoolClient(client)) return false;
  const parents = client?.parents_contacted_at;
  const first = client?.first_service_at || client?.services_started_at;
  return !parents || !first;
}

export function hasCompletedFallContinuation(raw) {
  const data = parseJsonMaybe(raw);
  if (!data || typeof data !== 'object') return false;
  const plan = String(data.plan || '').trim();
  if (plan === 'not_continue_school' || plan === 'unable_to_contact_parent' || plan === 'other') {
    return !!String(data.privateComment || data.comment || '').trim() || !!data.completedAt;
  }
  if (plan !== 'continue_school') return false;
  if (Array.isArray(data.serviceDays) && data.serviceDays.map(normalizeContinuationWeekday).filter(Boolean).length) {
    return true;
  }
  // Legacy admin expanded flow
  if (data.schoolChoice === 'current_school') return !!data.currentSchoolAction;
  if (data.schoolChoice === 'new_school') {
    const hasSchool = !!Number(data.newSchoolOrganizationId || 0) || !!String(data.newSchoolName || '').trim();
    const selectedAgencySchool = !!Number(data.newSchoolOrganizationId || 0);
    return hasSchool && (!selectedAgencySchool || !!data.newSchoolAction);
  }
  // Legacy simplified flow that required a start date
  if (Array.isArray(data.serviceDays) && data.serviceDays.length && data.continuationStartDate) return true;
  return false;
}

export function continuationPlanIsContinue(raw) {
  const data = parseJsonMaybe(raw);
  return String(data?.plan || '') === 'continue_school' && hasCompletedFallContinuation(data);
}

export function continuationNeedsFallFlag(raw) {
  const data = parseJsonMaybe(raw);
  if (!data || typeof data !== 'object') return false;
  const plan = String(data.plan || '').trim();
  if (plan === 'unable_to_contact_parent') return true;
  if (plan === 'not_continue_school') return true;
  if (plan === 'other' && (data.recommendTerminate === true || data.recommendTerminate === 'true')) return true;
  return false;
}

export function continuationIsTerminatedPlan(raw) {
  const data = parseJsonMaybe(raw);
  if (!data || typeof data !== 'object') return false;
  const plan = String(data.plan || '').trim();
  if (plan === 'not_continue_school') return true;
  if (plan === 'unable_to_contact_parent' && (data.recommendTerminate === true || data.recommendTerminate === 'true')) {
    return true;
  }
  if (plan === 'other' && (data.recommendTerminate === true || data.recommendTerminate === 'true')) {
    return true;
  }
  return false;
}

/**
 * Compute fall-aware readiness summary for a school client.
 * @param {{ returning: boolean, hasWeekday: boolean, statusKey: string, continuationJson: any, priorProviderComplete?: boolean }}
 */
export function computeFallReadinessSummary({
  returning,
  hasWeekday,
  statusKey,
  continuationJson,
  priorProviderComplete = true
}) {
  const key = String(statusKey || '').toLowerCase();
  if (key === 'terminated' || continuationIsTerminatedPlan(continuationJson)) {
    return {
      summary_label: 'Terminated',
      fall_pending: false,
      fall_flag: true,
      fall_complete: false,
      phase: 'done'
    };
  }

  if (!returning) {
    return null;
  }

  if (hasWeekday && continuationPlanIsContinue(continuationJson)) {
    return {
      summary_label: 'Fall confirmation complete',
      fall_pending: false,
      fall_flag: false,
      fall_complete: true,
      phase: 'done'
    };
  }

  if (hasWeekday && key === 'current') {
    return {
      summary_label: 'Fall confirmation complete',
      fall_pending: false,
      fall_flag: false,
      fall_complete: true,
      phase: 'done'
    };
  }

  if (!hasWeekday) {
    const flagged = continuationNeedsFallFlag(continuationJson);
    return {
      summary_label: flagged ? 'Fall confirmation needed' : 'Fall confirmation pending',
      fall_pending: true,
      fall_flag: flagged,
      fall_complete: false,
      phase: 'fall',
      prior_year_complete: priorProviderComplete
    };
  }

  return {
    summary_label: 'Fall confirmation pending',
    fall_pending: true,
    fall_flag: continuationNeedsFallFlag(continuationJson),
    fall_complete: false,
    phase: 'fall',
    prior_year_complete: priorProviderComplete
  };
}

export function normalizeContinuationServicesPayload(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Continuation of Services must be an object');
  }

  const plan = String(raw.plan || '').trim();
  if (!CONTINUATION_SERVICES_PLANS.has(plan)) {
    throw new Error('Select a Continuation of Services option');
  }

  const normalized = { plan, completedAt: new Date().toISOString() };

  if (plan === 'continue_school') {
    const serviceDays = Array.isArray(raw.serviceDays)
      ? [...new Set(raw.serviceDays.map((d) => normalizeContinuationWeekday(d)).filter(Boolean))]
      : [];
    const usesSimplifiedFlow =
      serviceDays.length > 0
      || raw.serviceDays !== undefined
      || raw.continuationStartDate !== undefined;

    if (usesSimplifiedFlow) {
      if (!serviceDays.length) {
        throw new Error('Select at least one assigned day of the week');
      }
      normalized.serviceDays = serviceDays;
      // Optional legacy date — not required and not used for Current promotion.
      const start = String(raw.continuationStartDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) normalized.continuationStartDate = start;
      return normalized;
    }

    // Legacy admin expanded flow
    const schoolChoice = String(raw.schoolChoice || '').trim();
    if (!['current_school', 'new_school'].includes(schoolChoice)) {
      throw new Error('Select current school or new school');
    }
    normalized.schoolChoice = schoolChoice;
    if (schoolChoice === 'current_school') {
      const currentSchoolAction = String(raw.currentSchoolAction || '').trim();
      if (!['continuing_with_me', 'requesting_transfer'].includes(currentSchoolAction)) {
        throw new Error('Select how services should continue at the current school');
      }
      normalized.currentSchoolAction = currentSchoolAction;
    } else {
      const newSchoolOrganizationId = parseInt(raw.newSchoolOrganizationId, 10);
      normalized.newSchoolOrganizationId =
        Number.isFinite(newSchoolOrganizationId) && newSchoolOrganizationId > 0
          ? newSchoolOrganizationId
          : null;
      const newSchoolName = String(raw.newSchoolName || '').trim().slice(0, 255) || null;
      normalized.newSchoolName = newSchoolName;
      if (!normalized.newSchoolOrganizationId && !normalized.newSchoolName) {
        throw new Error('Select or enter the new school');
      }
      if (normalized.newSchoolOrganizationId) {
        const newSchoolAction = String(raw.newSchoolAction || '').trim();
        if (!['continue_at_new_school_if_possible', 'pursue_in_office_support'].includes(newSchoolAction)) {
          throw new Error('Select how services should continue at the new school');
        }
        normalized.newSchoolAction = newSchoolAction;
      }
    }
    return normalized;
  }

  let privateComment = String(raw.privateComment || raw.comment || '').trim();
  // Legacy admin fields (pre–fall-readiness UI)
  if (!privateComment && plan === 'not_continue_school' && raw.notContinuingAction) {
    privateComment = `Not continuing: ${String(raw.notContinuingAction).trim()}`;
  }
  if (!privateComment && plan === 'unable_to_contact_parent' && raw.unableToContactRecommendation) {
    privateComment = `Unable to contact parent — ${String(raw.unableToContactRecommendation).trim()}`;
  }
  if (!privateComment) {
    throw new Error('A private comment for admin/support is required');
  }
  normalized.privateComment = privateComment.slice(0, 4000);
  normalized.supportFollowUp = raw.supportFollowUp === true || raw.supportFollowUp === 'true' || raw.supportFollowUp === 1;
  normalized.removeFromAssignment =
    raw.removeFromAssignment === true || raw.removeFromAssignment === 'true' || raw.removeFromAssignment === 1;

  if (plan === 'not_continue_school') {
    normalized.recommendTerminate = true;
  } else {
    let recommendRaw = raw.recommendTerminate;
    if (
      (recommendRaw === undefined || recommendRaw === null || recommendRaw === '')
      && plan === 'unable_to_contact_parent'
      && raw.unableToContactRecommendation
    ) {
      recommendRaw = String(raw.unableToContactRecommendation) === 'recommend_terminate';
    }
    if (plan === 'unable_to_contact_parent' || plan === 'other') {
      if (recommendRaw === undefined || recommendRaw === null || recommendRaw === '') {
        throw new Error('Indicate whether you recommend termination');
      }
    }
    normalized.recommendTerminate =
      recommendRaw === true || recommendRaw === 'true' || recommendRaw === 1;
  }

  // Structured "other" reason (school-safe when confirmed). Freeform custom is not shown to schools.
  if (plan === 'other') {
    const otherReasonKey = String(raw.otherReasonKey || '').trim();
    const allowedOther = new Set(['patient_discontinued_services', 'custom']);
    if (otherReasonKey && allowedOther.has(otherReasonKey)) {
      normalized.otherReasonKey = otherReasonKey;
    } else {
      normalized.otherReasonKey = 'custom';
    }
  }

  if (plan === 'unable_to_contact_parent') {
    const attempts = parseInt(raw.contactAttempts, 10);
    if (!Number.isFinite(attempts) || attempts < 1) {
      throw new Error('List how many contact attempts were made');
    }
    normalized.contactAttempts = Math.min(99, attempts);
  }

  // Note school staff may see on Terminated hover (provider is warned in UI).
  if (normalized.recommendTerminate) {
    const schoolNote = String(raw.schoolVisibleNote || raw.terminationNote || '').trim();
    if (schoolNote) normalized.schoolVisibleNote = schoolNote.slice(0, 1000);
  }

  return normalized;
}

function clientFlagTruthy(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function hoverHasProvider(client) {
  if (clientFlagTruthy(client?.has_provider)) return true;
  if (client?.has_provider === false || client?.has_provider === 0) return false;
  if (Number(client?.provider_id) > 0) return true;
  const ids = String(client?.provider_ids || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0;
}

function hoverHasWeekday(client) {
  if (clientFlagTruthy(client?.has_weekday)) return true;
  const day = String(client?.service_day || '').trim();
  if (day && /(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(day)) return true;
  const pairs = String(client?.provider_day_pairs || '');
  return /:(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(pairs);
}

/** School-safe default when no continuation JSON is on file yet. */
export function defaultFallConfirmationHover(client) {
  if (!hoverHasProvider(client)) {
    return 'Waiting on a provider assignment. This client is not on a caseload yet.';
  }
  if (!hoverHasWeekday(client)) {
    return 'Waiting on provider fall confirmation (an assigned day is still needed).';
  }
  return 'Provider and day are assigned. This client should move to Ready to Schedule.';
}

/**
 * School-staff-safe hover text for Fall Confirmation Pending / Terminated.
 * Never exposes freeform private admin comments unless schoolVisibleNote was explicitly set.
 */
export function buildSchoolFallHoverText(client) {
  const statusKey = String(client?.client_status_key || '').toLowerCase();
  if (statusKey === 'confirmed_returning') {
    return 'Agency clearance pending';
  }
  const data = parseJsonMaybe(client?.continuation_services_json);
  if (!data || typeof data !== 'object') {
    if (statusKey === 'terminated' && client?.termination_reason) {
      return String(client.termination_reason);
    }
    if (['confirmation_pending', 'unable_to_reach', 'other_transfer'].includes(statusKey)) {
      return defaultFallConfirmationHover(client);
    }
    return null;
  }
  const plan = String(data.plan || '').trim();
  const support = data.supportFollowUp === true || data.supportFollowUp === 'true' || data.supportFollowUp === 1;
  const parts = [];

  if (statusKey === 'terminated' || data.recommendTerminate === true || data.recommendTerminate === 'true') {
    if (plan === 'unable_to_contact_parent') {
      parts.push('Unable to Contact Parent');
      if (data.contactAttempts) parts.push(`${data.contactAttempts} attempt(s)`);
    } else if (plan === 'other' && data.otherReasonKey === 'patient_discontinued_services') {
      parts.push('Patient Discontinued Services with Provider');
    } else if (plan === 'not_continue_school') {
      parts.push('Not continuing services');
    }
    const note = String(data.schoolVisibleNote || client?.termination_reason || '').trim();
    if (note) parts.push(note);
    if (support) parts.push('Our support team is following up');
    return parts.length ? parts.join(' · ') : (statusKey === 'terminated' ? null : defaultFallConfirmationHover(client));
  }

  if (statusKey === 'confirmation_pending' || statusKey === 'unable_to_reach' || statusKey === 'other_transfer') {
    if (plan === 'unable_to_contact_parent') {
      parts.push('Unable to Contact Parent');
      if (data.contactAttempts) parts.push(`${data.contactAttempts} attempt(s)`);
      if (support) parts.push('Our support team is following up');
      return parts.join(' · ');
    }
    if (plan === 'other' && data.otherReasonKey === 'patient_discontinued_services') {
      parts.push('Patient Discontinued Services with Provider');
      if (support) parts.push('Our support team is following up');
      return parts.join(' · ');
    }
    // Custom freeform "other" — do not show private comment to school staff
    if (plan === 'other') {
      if (support) return 'Fall Confirmation Pending · Our support team is following up';
      return 'Fall Confirmation Pending';
    }
    return defaultFallConfirmationHover(client);
  }

  return null;
}
