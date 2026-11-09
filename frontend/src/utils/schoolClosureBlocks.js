/** Closures are already scoped to the viewed provider by the summary API. */
export function schoolClosureBlocks(closures = [], assignments = [], date) {
  const blocks = new Map();
  for (const closure of closures) {
    if (closure.date !== date || closure.fullDay === false) continue;
    const assignment = assignments.find(row => Number(row.schoolOrgId || row.schoolOrganizationId || row.schoolId) === Number(closure.schoolOrgId));
    const schoolName = closure.schoolName || assignment?.schoolName || 'School';
    const scopeName = closure.scope === 'district' ? closure.districtName || 'District' : schoolName;
    const label = closure.kind === 'sessions_prohibited' ? 'Sessions prohibited' : 'No school';
    const key = `school-closure-${closure.agencyId || ''}-${closure.eventId || closure.scope + ':' + scopeName}-${date}`;
    if (blocks.has(key)) continue;
    blocks.set(key, {
      key, kind: 'school-closure', allDay: true, dateYmd: date,
      agencyId: closure.agencyId, schoolOrgId: closure.schoolOrgId, schoolName,
      schoolClosure: closure, canEdit: false,
      shortLabel: `${scopeName} · ${label}`,
      title: [scopeName, label, 'All day', closure.reason || closure.title].filter(Boolean).join(' · ')
    });
  }
  return [...blocks.values()];
}
