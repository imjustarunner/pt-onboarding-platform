/** School Overview (orgType=school) + All portals + hub + school clients + school digital intakes — not Program Overview (orgType=program). */
export function routeRequiresSchoolPortalsFeature(to) {
  const n = String(to?.name || '');
  if (n === 'SchoolPortals' || n === 'OrganizationSchoolPortals') return true;
  if (n === 'SchoolPortalsHub' || n === 'OrganizationSchoolPortalsHub') return true;
  if (n === 'SchoolOperations' || n === 'OrganizationSchoolOperations') return true;
  if (n === 'SchoolClients' || n === 'OrganizationSchoolClients') return true;
  if (n === 'SchoolPortalDigitalIntakes' || n === 'OrganizationSchoolPortalDigitalIntakes') return true;
  if (n === 'SchoolReferralHub' || n === 'OrganizationSchoolReferralHub') return true;
  if (n === 'SchoolOverviewDashboard' || n === 'OrganizationSchoolOverviewDashboard') {
    return String(to.query?.orgType || 'school').toLowerCase() === 'school';
  }
  return false;
}

/** School overview “Program” tab — either school portals or Skill Builders school program must be provisioned. */
export function routeRequiresProgramOverviewDashboard(to) {
  const n = String(to?.name || '');
  if (n !== 'SchoolOverviewDashboard' && n !== 'OrganizationSchoolOverviewDashboard') return false;
  return String(to.query?.orgType || '').toLowerCase() === 'program';
}

/** Authenticated Skill Builders school-program admin + event portal (not public/guardian SB pages). */
export function routeRequiresSkillBuildersSchoolProgramFeature(to) {
  const n = String(to?.name || '');
  if (n === 'SkillBuildersEventPortal') return true;
  if (n === 'OrganizationSkillBuildersAvailability' || n === 'SkillBuildersAvailability') return true;
  if (n === 'OrganizationSkillBuildersProgramsEvents' || n === 'SkillBuildersProgramsEvents') return true;
  if (n === 'OrganizationSkillBuildersClientManagement' || n === 'SkillBuildersClientManagement') return true;
  if (n === 'OrganizationSkillBuildersMyAvailability' || n === 'SkillBuildersMyAvailability') return true;
  return false;
}
