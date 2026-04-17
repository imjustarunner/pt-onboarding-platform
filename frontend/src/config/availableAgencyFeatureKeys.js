/** Keys aligned with Platform Settings → Available Agency Features and Company Profile toggles. */
export const AVAILABLE_AGENCY_FEATURE_KEYS = [
  { key: 'budgetManagementEnabled', label: 'Budget Management' },
  {
    key: 'onboardingTrainingEnabled',
    label: 'Onboarding & Training',
    /** When absent from platform JSON, treat as off until superadmin explicitly enables (opt-in module). */
    defaultAvailable: false
  },
  { key: 'payrollEnabled', label: 'Payroll' },
  { key: 'hiringEnabled', label: 'Hiring Process' },
  { key: 'noteAidEnabled', label: 'Note Aid' },
  { key: 'clinicalNoteGeneratorEnabled', label: 'Clinical Note Generator' },
  { key: 'publicProviderFinderEnabled', label: 'Public Provider Finder' },
  { key: 'aiProviderSearchEnabled', label: 'AI Provider Search' },
  { key: 'shiftProgramsEnabled', label: 'Shift Programs' },
  { key: 'presenceEnabled', label: 'Presence / Team Board' },
  { key: 'kudosEnabled', label: 'Kudos' },
  { key: 'momentumListEnabled', label: 'Momentum List' },
  { key: 'medcancelEnabled', label: 'Med Cancel' },
  { key: 'inSchoolSubmissionsEnabled', label: 'In-School Submissions' },
  { key: 'googleSsoEnabled', label: 'Google Workspace SSO' },
  { key: 'workspaceProvisioningEnabled', label: 'Workspace Provisioning' },
  {
    key: 'schoolPortalsEnabled',
    label: 'School Portals (overview + all portals)',
    /** Opt-in: platform must expose before tenants see the Company Profile toggle. */
    defaultAvailable: false
  },
  {
    key: 'skillBuildersSchoolProgramEnabled',
    label: 'Skill Builders school program (skills groups, portal, provider hub)',
    /** Opt-in: school-scoped Skill Builders program; platform must expose before tenant toggle. */
    defaultAvailable: false
  }
];
