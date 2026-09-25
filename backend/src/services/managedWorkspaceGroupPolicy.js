// Explicit tenant enrollment: sharing a mail domain or enabling SSO is not consent
// to have PlotTwist manage an organization's Google Groups.
export const CURRENT_MANAGED_DOMAINS = Object.freeze({
  plottwistco: 'plottwistco.com', itsco: 'itsco.health', nlu: 'nextleveluplcc.com',
  tisi: 'innerstrengthin.com', mh4kidz: 'mh4kidz.com'
});
export const GROUP_LABELS = Object.freeze({
  staff: 'Staff', unlicensed: 'Unlicensed', prelicensed: 'Prelicensed', licensed: 'Licensed',
  supervisors: 'Supervisors', supervisees: 'Supervisees', interns: 'Interns',
  costaff: 'Colorado staff', denver: 'Denver', cosprings: 'Colorado Springs'
});
const norm = value => String(value || '').trim().toLowerCase();
const staffRoles = new Set(['super_admin','admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant']);
export function managedDomain(agency) {
  const flags = typeof agency.feature_flags === 'string' ? JSON.parse(agency.feature_flags || '{}') : agency.feature_flags || {};
  if (!Number(agency.is_active) || agency.organization_type !== 'agency' || flags.managedWorkspaceGroupsEnabled === false) return null;
  const domain = flags.managedWorkspaceGroupsEnabled === true
    ? norm(flags.workspaceEmailDomain) : CURRENT_MANAGED_DOMAINS[agency.slug];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain || '') ? domain : null;
}
export function activeManagedStaff(row) {
  return staffRoles.has(norm(row.role)) && Number(row.is_active) === 1 && !Number(row.is_archived)
    && !Number(row.is_demo) && Number(row.membership_active) === 1
    && ['ACTIVE_EMPLOYEE','ACTIVE','ONBOARDING'].includes(String(row.status || '').toUpperCase());
}
export function staffGroupKeys(row, { supervisorIds = new Set(), superviseeIds = new Set() } = {}) {
  if (!activeManagedStaff(row)) return [];
  const keys = new Set(['staff']);
  const credential = norm(row.credential).replace(/\./g, '');
  const tokens = new Set(credential.split(/[^a-z]+/).filter(Boolean));
  // Current license evidence takes precedence over stale "intern" job labels or
  // the supervision flag. Unknown qualifications are never guessed as licensed.
  const licensed = ['lpc','lcsw','lmft','lp','psychologist','lac'].some(t => tokens.has(t));
  const candidate = !licensed && (['lpcc','mftc','swc','lsw','candidate'].some(t => tokens.has(t)) || Number(row.supervision_is_prelicensed) === 1);
  const intern = !licensed && !candidate && (tokens.has('intern') || /^intern(?:_plus)?$/.test(norm(row.role)) || /\b(intern|internship|practicum)\b/.test(norm(row.agency_position)));
  if (licensed) keys.add('licensed');
  else if (candidate) keys.add('prelicensed');
  else if (intern || ['ba','bs','bachelors','unlicensed'].some(t => tokens.has(t))) keys.add('unlicensed');
  if (intern) keys.add('interns');
  if (supervisorIds.has(Number(row.id)) || norm(row.role) === 'supervisor' || Number(row.has_supervisor_privileges) === 1) keys.add('supervisors');
  if (superviseeIds.has(Number(row.id))) keys.add('supervisees');
  for (const loc of row.locations || []) {
    const city = norm(loc.city), state = norm(loc.state);
    if (state === 'co' || state === 'colorado') keys.add('costaff');
    if (city === 'denver' && (!state || ['co','colorado'].includes(state))) { keys.add('denver'); keys.add('costaff'); }
    if (city === 'colorado springs' && (!state || ['co','colorado'].includes(state))) { keys.add('cosprings'); keys.add('costaff'); }
  }
  const work = norm(row.work_location);
  if (/\bdenver\b/.test(work)) { keys.add('denver'); keys.add('costaff'); }
  if (/\b(colorado springs|cosprings)\b/.test(work)) { keys.add('cosprings'); keys.add('costaff'); }
  if (/\b(colorado|co)\b/.test(work)) keys.add('costaff');
  return [...keys];
}
export function buildManagedGroupPlan({ domain, rows, assignments = [] }) {
  const active = rows.filter(activeManagedStaff), byId = new Map(active.map(r => [Number(r.id), r]));
  const validAssignments = assignments.filter(s => byId.has(Number(s.supervisor_id)) && byId.has(Number(s.supervisee_id)));
  const supervisorIds = new Set(validAssignments.map(s => Number(s.supervisor_id)));
  const superviseeIds = new Set(validAssignments.map(s => Number(s.supervisee_id)));
  const plans = Object.entries(GROUP_LABELS).map(([key, label]) => ({ key, label, email: `${key}@${domain}`, userIds: [], managerUserIds: [] }));
  for (const row of active) {
    for (const key of staffGroupKeys(row, { supervisorIds, superviseeIds })) plans.find(p => p.key === key).userIds.push(Number(row.id));
  }
  // Use a stable user-id key; the first created address is retained on later name
  // changes. Duplicate first names get a user-id suffix, never a shared roster.
  const supervisors = active.filter(r => staffGroupKeys(r, { supervisorIds, superviseeIds }).includes('supervisors'));
  const slug = r => norm(r.first_name).normalize('NFKD').replace(/[^a-z0-9]/g, '') || `user${r.id}`;
  for (const row of supervisors) {
    const stem = slug(row), duplicate = supervisors.filter(r => slug(r) === stem).length > 1;
    const key = `supervisor:${row.id}`;
    plans.push({ key, label: `${row.first_name}’s supervisees`, email: `${stem}${duplicate ? row.id : ''}supervisees@${domain}`,
      managerUserIds: [Number(row.id)], userIds: [...new Set([Number(row.id), ...validAssignments.filter(s => Number(s.supervisor_id) === Number(row.id)).map(s => Number(s.supervisee_id))])] });
  }
  return plans;
}
