import { providerAssignmentSummary, providerCapacityColor } from './providerSlotCapacity.js';

export function assignmentSchoolId(assignment) {
  return Number(assignment?.schoolOrgId || assignment?.schoolOrganizationId || assignment?.schoolId || 0);
}

export function assignmentStartsInCell(startTime, hour, minute = 0, stepMinutes = 60) {
  const match = String(startTime || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number(hour) === 0 && Number(minute || 0) === 0;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const cell = Number(hour) * 60 + Number(minute || 0);
  const step = Number(stepMinutes) || 60;
  return start >= cell && start < cell + step;
}

/** A school-specific closure wins over a district date. No school wins over sessions prohibited. */
export function closureForSchoolDate(closures, schoolId, date) {
  const matches = (closures || []).filter(item => Number(item?.schoolOrgId) === Number(schoolId) && item?.date === date);
  if (!matches.length) return null;
  const rank = item => (item.scope === 'school' ? 0 : 2) + (item.kind === 'no_school' ? 0 : 1);
  return [...matches].sort((a, b) => rank(a) - rank(b))[0];
}

export function schoolRailTone(assignment, closure) {
  if (closure) return 'closed';
  const color = providerCapacityColor({
    slots_total: assignment?.slotsTotal ?? assignment?.slots_total,
    slots_used: assignment?.slotsUsed ?? assignment?.slots_used
  });
  if (color === 'green') return 'open';
  if (color === 'yellow') return 'tight';
  if (color === 'red') return 'full';
  return 'neutral';
}

export const SCHOOL_RAIL_COLORS = {
  open: { fill: '#15803d', border: '#14532d' },
  tight: { fill: '#ca8a04', border: '#854d0e' },
  full: { fill: '#b91c1c', border: '#7f1d1d' },
  closed: { fill: '#9a3412', border: '#7c2d12' },
  neutral: { fill: '#64748b', border: '#334155' }
};

export function schoolRailSummary(assignment) {
  return providerAssignmentSummary({
    slots_total: assignment?.slotsTotal ?? assignment?.slots_total,
    slots_used: assignment?.slotsUsed ?? assignment?.slots_used
  });
}

export function closureLabel(closure) {
  if (!closure) return '';
  const kind = closure.kind === 'sessions_prohibited' ? 'Sessions prohibited' : 'No school';
  const scope = closure.scope === 'district' ? 'District-wide' : 'This school';
  const who = closure.recordedByName ? `Recorded by ${closure.recordedByName}` : '';
  return [kind, scope, closure.reason || closure.title, who].filter(Boolean).join(' · ');
}
