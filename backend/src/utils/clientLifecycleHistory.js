/**
 * Build a school-year timeline of provider/agency submissions for a school client.
 * Spring continue copies into the upcoming year in the DB; fall lives on that next year.
 * Display de-dupes the copied spring so each year reads: New Client → Spring → Fall.
 */
import { computeCurrentSchoolYearLabel } from './schoolYear.js';
import { currentSchoolYearLabelFromCalendar } from './schoolYearCalendar.js';

const FALL_LABELS = {
  confirmed_returning: 'Confirmed Returning',
  unable_to_reach: 'Unable to Reach',
  recommend_termination: 'Will Not Continue / Recommend Termination',
  other_transfer: 'Other / Transfer Needed'
};

const SPRING_LABELS = {
  returning: 'Returning',
  not_returning: 'Not Returning',
  unknown: 'Unknown'
};

function parseJson(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ymd(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function schoolYearFromDate(value, now = new Date()) {
  const parsed = value ? new Date(value) : null;
  const d = parsed && Number.isFinite(parsed.getTime()) ? parsed : now;
  return computeCurrentSchoolYearLabel(d);
}

function yearSortKey(label) {
  const m = String(label || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function event(partial) {
  return {
    id: partial.id,
    kind: partial.kind,
    title: partial.title,
    schoolYear: partial.schoolYear || null,
    statusLabel: partial.statusLabel || null,
    completedAt: partial.completedAt || null,
    completedByUserId: partial.completedByUserId || null,
    details: partial.details || {},
    actionKey: partial.actionKey || null,
    canView: partial.canView !== false
  };
}

function schoolYearForPendingAction(actionKey, joinSchoolYear) {
  const key = String(actionKey || '');
  if (key === 'provider_intake' || key === 'agency_intake') return joinSchoolYear;
  if (key === 'spring_update') return computeCurrentSchoolYearLabel();
  return currentSchoolYearLabelFromCalendar();
}

/**
 * @param {{ client: object, dispositions?: object[], agencyIntake?: object|null, pendingActions?: object[] }} input
 * @returns {{ years: Array<{ schoolYear: string, events: object[] }>, joinSchoolYear: string }}
 */
export function buildClientLifecycleHistory({
  client,
  dispositions = [],
  agencyIntake = null,
  pendingActions = []
} = {}) {
  const c = client || {};
  const joinAnchor = c.submission_date || c.created_at || null;
  const joinSchoolYear = String(c.school_year || '').trim()
    || schoolYearFromDate(joinAnchor);
  const rows = (Array.isArray(dispositions) ? dispositions : [])
    .map((row) => ({
      ...row,
      school_year: String(row?.school_year || '').trim(),
      summer_plan_json: parseJson(row?.summer_plan_json, null),
      fall_plan_json: parseJson(row?.fall_plan_json, null),
      agency_clearance_json: parseJson(row?.agency_clearance_json, null)
    }))
    .filter((row) => row.school_year)
    .sort((a, b) => yearSortKey(a.school_year) - yearSortKey(b.school_year));

  const byYear = new Map();
  const ensureYear = (label) => {
    const key = String(label || '').trim();
    if (!key) return null;
    if (!byYear.has(key)) byYear.set(key, { schoolYear: key, events: [] });
    return byYear.get(key);
  };

  ensureYear(joinSchoolYear);
  for (const row of rows) ensureYear(row.school_year);

  const joinYear = ensureYear(joinSchoolYear);
  if (joinYear) {
    joinYear.events.push(event({
      id: `new-client-${joinSchoolYear}`,
      kind: 'new_client',
      title: 'New client',
      schoolYear: joinSchoolYear,
      statusLabel: (c.parents_contacted_at || c.first_service_at || c.services_started_at)
        ? 'Submitted'
        : 'Started',
      completedAt: iso(c.checklist_updated_at || c.first_service_at || c.parents_contacted_at || joinAnchor),
      actionKey: 'provider_intake',
      details: {
        parentsContactedAt: ymd(c.parents_contacted_at),
        parentsContactedSuccessful: c.parents_contacted_successful === true || c.parents_contacted_successful === 1
          ? true
          : c.parents_contacted_successful === false || c.parents_contacted_successful === 0
            ? false
            : null,
        firstServiceAt: ymd(c.first_service_at),
        servicesStartedAt: ymd(c.services_started_at),
        intakeAt: ymd(c.intake_at)
      },
      canView: !!(c.parents_contacted_at || c.first_service_at || c.services_started_at)
    }));
  }

  const intake = agencyIntake && typeof agencyIntake === 'object'
    ? (agencyIntake.intake || agencyIntake)
    : null;
  if (joinYear && intake && (intake.updatedAt || intake.agencyIntakeComplete || intake.packetType)) {
    joinYear.events.push(event({
      id: `agency-intake-${joinSchoolYear}`,
      kind: 'agency_intake',
      title: 'Agency intake',
      schoolYear: joinSchoolYear,
      statusLabel: intake.agencyIntakeComplete ? 'Complete' : 'In progress',
      completedAt: iso(intake.updatedAt),
      actionKey: 'agency_intake',
      details: {
        packetType: intake.packetType || null,
        paperComplete: intake.paperComplete ?? null,
        insuranceReviewed: !!intake.insuranceReviewed,
        ehrTransferred: !!intake.ehrTransferred,
        waitlisted: !!intake.waitlisted,
        waitlistReason: intake.waitlistReason || null,
        agencyIntakeComplete: !!intake.agencyIntakeComplete
      }
    }));
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const prev = i > 0 ? rows[i - 1] : null;
    const yearBucket = ensureYear(row.school_year);
    if (!yearBucket) continue;

    const springCopied = !!(
      prev
      && row.spring_completed_at
      && prev.spring_completed_at
      && String(row.spring_outcome || '') === String(prev.spring_outcome || '')
      && String(row.spring_completed_at) === String(prev.spring_completed_at)
    );

    if (row.spring_completed_at && !springCopied) {
      const summer = row.summer_plan_json || {};
      const fallPlan = row.fall_plan_json || {};
      yearBucket.events.push(event({
        id: `spring-${row.school_year}`,
        kind: 'spring_update',
        title: 'Spring update',
        schoolYear: row.school_year,
        statusLabel: SPRING_LABELS[String(row.spring_outcome || '').toLowerCase()] || row.spring_outcome,
        completedAt: iso(row.spring_completed_at),
        completedByUserId: row.spring_completed_by_user_id || null,
        actionKey: 'spring_update',
        details: {
          springOutcome: row.spring_outcome || null,
          summerNotes: summer.notes || summer.summerNotes || null,
          fallPlanKnown: fallPlan.known === true || fallPlan.known === 'known' || fallPlan.status === 'known'
            ? 'known'
            : (fallPlan.known === false || fallPlan.status === 'unknown' ? 'unknown' : null),
          fallNotes: fallPlan.notes || fallPlan.fallNotes || null,
          carriesToNextYear: row.spring_outcome === 'returning' || row.spring_outcome === 'unknown'
        }
      }));
    } else if (springCopied) {
      yearBucket.events.push(event({
        id: `spring-carry-${row.school_year}`,
        kind: 'spring_carryforward',
        title: 'Continued from spring',
        schoolYear: row.school_year,
        statusLabel: SPRING_LABELS[String(row.spring_outcome || '').toLowerCase()] || 'Continuing',
        completedAt: iso(row.spring_completed_at),
        actionKey: null,
        canView: false,
        details: {
          fromSchoolYear: prev.school_year,
          springOutcome: row.spring_outcome || null
        }
      }));
    }

    if (row.fall_completed_at || row.fall_outcome) {
      yearBucket.events.push(event({
        id: `fall-${row.school_year}`,
        kind: 'fall_confirmation',
        title: 'Fall confirmation',
        schoolYear: row.school_year,
        statusLabel: FALL_LABELS[String(row.fall_outcome || '').toLowerCase()] || row.fall_outcome,
        completedAt: iso(row.fall_completed_at),
        completedByUserId: row.fall_completed_by_user_id || null,
        actionKey: 'fall_confirmation',
        details: {
          fallOutcome: row.fall_outcome || null,
          privateComment: row.fall_comment || null,
          supportFollowUp: !!(row.fall_support_follow_up === 1 || row.fall_support_follow_up === true),
          removeFromAssignment: !!(row.fall_remove_from_assignment === 1 || row.fall_remove_from_assignment === true)
        },
        canView: !!row.fall_completed_at
      }));
    }

    if (row.agency_cleared_at) {
      const clearance = row.agency_clearance_json || {};
      yearBucket.events.push(event({
        id: `clearance-${row.school_year}`,
        kind: 'agency_clearance',
        title: 'Agency clearance',
        schoolYear: row.school_year,
        statusLabel: 'Cleared',
        completedAt: iso(row.agency_cleared_at),
        completedByUserId: row.agency_cleared_by_user_id || null,
        actionKey: 'agency_clearance',
        details: {
          disclosureOk: clearance.disclosureOk === true,
          insuranceOk: clearance.insuranceOk === true
        }
      }));
    }
  }

  const completedKeys = new Set();
  for (const bucket of byYear.values()) {
    for (const ev of bucket.events) {
      if (ev.actionKey && ev.kind !== 'action_needed') {
        completedKeys.add(`${bucket.schoolYear}:${ev.actionKey}`);
      }
    }
  }
  for (const pending of Array.isArray(pendingActions) ? pendingActions : []) {
    const actionKey = pending?.actionKey || null;
    if (!actionKey) continue;
    const yearLabel = pending.schoolYear || schoolYearForPendingAction(actionKey, joinSchoolYear);
    if (completedKeys.has(`${yearLabel}:${actionKey}`)) continue;
    const bucket = ensureYear(yearLabel);
    if (!bucket) continue;
    bucket.events.push(event({
      id: `pending-${pending.role || 'provider'}-${actionKey}-${yearLabel}`,
      kind: 'action_needed',
      title: pending.label || 'Action needed',
      schoolYear: yearLabel,
      statusLabel: pending.role === 'agency' ? 'Agency action needed' : 'Provider action needed',
      actionKey,
      canView: false,
      details: { role: pending.role || null }
    }));
  }

  const years = [...byYear.values()]
    .filter((y) => y.events.length)
    .sort((a, b) => yearSortKey(a.schoolYear) - yearSortKey(b.schoolYear));

  return { joinSchoolYear, years };
}

export { FALL_LABELS, SPRING_LABELS };
