/**
 * School roster filtering by school year (membership + primary school_year).
 */
import { normalizeSchoolYearLabel, computeCurrentSchoolYearLabel } from './schoolYear.js';
import { getClientSchoolYearMembershipMap } from '../services/clientSchoolYear.service.js';

export const CURRENT_YEAR_EXCEPTION_STATUSES = new Set([
  'confirmation_pending',
  'unable_to_reach',
  'other_transfer',
  'continuation_unknown'
]);

/** Assigned caseload — used so unassigned clients are not pulled onto the current year. */
export function rosterClientHasAssignedProvider(client) {
  if (Number(client?.provider_id) > 0) return true;
  const ids = String(client?.provider_ids || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length) return true;
  const pairs = String(client?.provider_day_pairs || '');
  if (/\d+\s*:/.test(pairs)) return true;
  const name = String(client?.provider_name || '').trim();
  return !!(name && name !== '—' && name.toLowerCase() !== 'none');
}

/** Parse API query: current | all | YYYY-YYYY. Returns null when absent. */
export function parseSchoolYearFilterParam(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'all') return 'all';
  if (lower === 'current') return 'current';
  const normalized = normalizeSchoolYearLabel(s);
  return normalized || 'all';
}

export function rosterTerminationSchoolYear(client) {
  const key = String(client?.client_status_key || '').toLowerCase();
  if (key !== 'terminated') return null;
  const stamped = normalizeSchoolYearLabel(client?.termination_school_year);
  if (stamped) return stamped;
  const terminatedAt = client?.terminated_at ? new Date(client.terminated_at) : null;
  if (terminatedAt && Number.isFinite(terminatedAt.getTime())) {
    return computeCurrentSchoolYearLabel(terminatedAt);
  }
  return normalizeSchoolYearLabel(client?.school_year);
}

/**
 * Filter roster rows to a school year. Uses client_school_years membership when available.
 * Terminated clients appear on the school year they were in when terminated.
 */
export async function filterRosterClientsBySchoolYear(clients, {
  schoolYearFilter,
  portalSchoolYear = computeCurrentSchoolYearLabel()
} = {}) {
  const filterRaw = String(schoolYearFilter || '').trim().toLowerCase();
  if (!filterRaw || filterRaw === 'all') return clients || [];

  const currentYear = normalizeSchoolYearLabel(portalSchoolYear);
  const targetYear =
    filterRaw === 'current' ? currentYear : normalizeSchoolYearLabel(schoolYearFilter);
  if (!targetYear) return clients || [];

  const isCurrentFilter = targetYear === currentYear;

  let membershipMap = new Map();
  try {
    membershipMap = await getClientSchoolYearMembershipMap(
      (clients || []).map((c) => Number(c?.id)).filter(Boolean),
      targetYear
    );
  } catch {
    membershipMap = new Map();
  }

  return (clients || []).filter((c) => {
    const key = String(c?.client_status_key || '').toLowerCase();
    const cid = Number(c?.id || 0);

    if (key === 'terminated') {
      const termYear = rosterTerminationSchoolYear(c);
      if (termYear === targetYear) return true;
      if (membershipMap.has(cid)) return true;
      return false;
    }

    return clientMatchesSchoolYearTarget(c, {
      targetYear,
      isCurrentFilter,
      hasMembership: membershipMap.has(cid)
    });
  });
}

/** Pure matcher used by the async roster filter (and unit tests). */
export function clientMatchesSchoolYearTarget(c, {
  targetYear,
  isCurrentFilter = false,
  hasMembership = false
} = {}) {
  const key = String(c?.client_status_key || '').toLowerCase();
  const sy = normalizeSchoolYearLabel(c?.school_year);
  if (!sy || sy === targetYear) return true;
  if (hasMembership) return true;
  if (
    isCurrentFilter
    && CURRENT_YEAR_EXCEPTION_STATUSES.has(key)
    && rosterClientHasAssignedProvider(c)
  ) {
    return true;
  }
  return false;
}
