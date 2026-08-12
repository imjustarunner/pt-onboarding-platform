/**
 * Map the current route to a command / assistant "surface" so Quick Nav and Ask
 * can prefer destinations and prompts relevant to that page first.
 */

/** @typedef {'admin_dashboard'|'operations_dashboard'|'workforce_operations'|'school_operations'|'people_operations'|'my_dashboard'|null} CommandSurfaceKey */

/**
 * @typedef {object} CommandSurface
 * @property {CommandSurfaceKey} key
 * @property {string} label
 * @property {string} placementKey
 * @property {string[]} navSectionHints  – case-insensitive substrings of NAV_SEARCH_INDEX.section
 * @property {string[]} navPathHints     – path prefixes / substrings of NAV_SEARCH_INDEX.path
 * @property {string[]} quickNavGroups   – quickNavCatalog group ids to boost
 * @property {string[]} quickNavKeywords – keyword/label boosts for quick nav
 * @property {string[]} askExamples
 * @property {string[]} preferredCapabilityGroups – backend capability group labels
 * @property {string[]} preferredCapabilityIds
 */

/** @type {Record<Exclude<CommandSurfaceKey, null>, Omit<CommandSurface, 'key'>>} */
export const COMMAND_SURFACES = {
  admin_dashboard: {
    label: 'Admin Dashboard',
    placementKey: 'admin_dashboard',
    navSectionHints: ['management', 'people ops', 'notifications', 'communications', 'directory', 'hub'],
    navPathHints: ['/admin/', '/admin-dashboard', '/operations-dashboard', '/workforce-operations', '/school-operations', '/people-operations'],
    quickNavGroups: ['admin', 'workspace', 'clients'],
    quickNavKeywords: ['admin', 'users', 'payroll', 'hiring', 'audit', 'agency', 'settings', 'directory', 'people'],
    askExamples: [
      'What activity happened in my agency this week?',
      'Who has an intake opening today?',
      'Open User Manager',
      'Show coverage needs',
      'Who is free today?'
    ],
    preferredCapabilityGroups: ['Operations', 'People / directory', 'Navigation and lookup', 'Payroll analytics'],
    preferredCapabilityIds: [
      'agency_activity',
      'office_roster',
      'people_directory_lookup',
      'user_lookup',
      'payroll_analytics',
      'payroll_summary',
      'school_portal_lookup',
      'school_client_counts'
    ]
  },
  operations_dashboard: {
    label: 'Operations Dashboard',
    placementKey: 'operations_dashboard',
    navSectionHints: ['workforce ops', 'school ops', 'directory', 'people ops', 'management'],
    navPathHints: [
      '/operations-dashboard',
      '/workforce-operations',
      '/school-operations',
      '/admin/caseload',
      '/admin/payroll',
      '/admin/hiring'
    ],
    quickNavGroups: ['admin', 'schedule', 'clients', 'workspace'],
    quickNavKeywords: ['operations', 'coverage', 'schedule', 'payroll', 'staff', 'caseload', 'billing'],
    askExamples: [
      'Who is free today?',
      'Who is in right now?',
      'Who has an intake opening today?',
      'Show coverage needs',
      'What activity happened in my agency this week?'
    ],
    preferredCapabilityGroups: [
      'Operations',
      'Coverage and referrals',
      'Availability',
      'Schedule and meetings',
      'People / directory'
    ],
    preferredCapabilityIds: [
      'team_presence',
      'intake_openings',
      'office_roster',
      'office_schedule',
      'agency_activity',
      'people_directory_lookup',
      'providers_at_location'
    ]
  },
  workforce_operations: {
    label: 'Workforce Operations',
    placementKey: 'workforce_operations',
    navSectionHints: ['workforce ops'],
    navPathHints: [
      '/workforce-operations',
      '/admin/caseload-hub',
      '/admin/payroll',
      '/admin/credential',
      '/admin/billing',
      '/admin/buildings',
      '/careers',
      '/join',
      '/office-intake'
    ],
    quickNavGroups: ['schedule', 'admin', 'workspace'],
    quickNavKeywords: [
      'schedule',
      'payroll',
      'staff',
      'billing',
      'credential',
      'coverage',
      'buildings',
      'careers',
      'workforce'
    ],
    askExamples: [
      'Who is free today?',
      "What is Hale's schedule today?",
      'Who is in right now?',
      'Who has an intake opening today?',
      'Show open coverage needs'
    ],
    preferredCapabilityGroups: [
      'Schedule and meetings',
      'Availability',
      'Coverage and referrals',
      'Operations',
      'Payroll analytics'
    ],
    preferredCapabilityIds: [
      'team_presence',
      'workspace_open',
      'intake_openings',
      'office_schedule',
      'office_roster',
      'payroll_analytics',
      'provider_availability_at_location'
    ]
  },
  school_operations: {
    label: 'School Operations',
    placementKey: 'school_operations',
    navSectionHints: ['school ops', 'school portal'],
    navPathHints: [
      '/school-operations',
      '/admin/caseload-hub',
      '/admin/school',
      '/admin/events',
      '/admin/company-events',
      'school-portals',
      'collaborative-year'
    ],
    quickNavGroups: ['clients', 'admin', 'schedule'],
    quickNavKeywords: [
      'school',
      'caseload',
      'coverage',
      'portal',
      'events',
      'staffing',
      'addendum',
      'year update'
    ],
    askExamples: [
      'Show coverage needs',
      'Who has open school spots?',
      'How many clients does each school have?',
      'Open school portals',
      'Who sees 10 year old kids?'
    ],
    preferredCapabilityGroups: [
      'Coverage and referrals',
      'Navigation and lookup',
      'Operations',
      'People / directory'
    ],
    preferredCapabilityIds: [
      'school_client_counts',
      'school_portal_lookup',
      'intake_openings',
      'people_directory_lookup',
      'providers_by_age',
      'events_lookup',
      'agency_activity'
    ]
  },
  people_operations: {
    label: 'People Operations',
    placementKey: 'people_operations',
    navSectionHints: ['people ops', 'hiring', 'careers', 'onboarding', 'employee relations'],
    navPathHints: [
      '/people-operations',
      '/admin/hiring',
      '/admin/careers',
      '/admin/pre-hire',
      '/admin/onboarding',
      '/admin/interview-hub',
      '/admin/employee-relations',
      '/admin/modules',
      '/admin/agency-progress',
      '/admin/documents'
    ],
    quickNavGroups: ['admin', 'workspace', 'learning'],
    quickNavKeywords: [
      'hiring',
      'careers',
      'applicants',
      'onboarding',
      'interview',
      'training',
      'people',
      'retention',
      'milestones'
    ],
    askExamples: [
      'Open applicants',
      'Show onboarding progress',
      'Open job postings',
      'Who is in pre-hire?',
      'Open employee relations'
    ],
    preferredCapabilityGroups: ['People / directory', 'Navigation and lookup', 'Operations'],
    preferredCapabilityIds: [
      'people_directory_lookup',
      'user_lookup',
      'agency_activity',
      'workspace_open'
    ]
  },
  my_dashboard: {
    label: 'My Dashboard',
    placementKey: 'my_dashboard',
    navSectionHints: [],
    navPathHints: ['/dashboard'],
    quickNavGroups: ['account', 'schedule', 'workspace', 'learning', 'clients'],
    quickNavKeywords: [
      'schedule',
      'payroll',
      'credentials',
      'benefits',
      'tasks',
      'messages',
      'training',
      'kudos',
      'documents'
    ],
    askExamples: [
      "What's on my agenda today?",
      'What should I prioritize today?',
      "What's on my to-do list?",
      'When is my next meeting?',
      'Who is available this afternoon?'
    ],
    preferredCapabilityGroups: [
      'Schedule and meetings',
      'My activity',
      'Availability',
      'Handbook and policies'
    ],
    preferredCapabilityIds: [
      'workspace_open',
      'dashboard_tab_navigate',
      'my_activity',
      'team_presence',
      'payroll_summary',
      'my_compliance_status',
      'training_kb_open'
    ]
  }
};

/**
 * Strip org slug prefix from a path for matching.
 * @param {string} path
 */
export function normalizeAppPath(path) {
  const p = String(path || '').split('?')[0].split('#')[0];
  // /:orgSlug/... → strip first segment when it looks like a slug (not a known root)
  const knownRoots = new Set([
    'admin',
    'admin-dashboard',
    'operations-dashboard',
    'workforce-operations',
    'school-operations',
    'people-operations',
    'dashboard',
    'schedule',
    'careers',
    'join',
    'office-intake',
    'messages',
    'tasks',
    'login'
  ]);
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 2 && !knownRoots.has(parts[0])) {
    return `/${parts.slice(1).join('/')}`;
  }
  return p.startsWith('/') ? p : `/${p}`;
}

/**
 * @param {{ path?: string, fullPath?: string, name?: string|symbol|null }} routeLike
 * @returns {CommandSurface | null}
 */
export function resolveCommandSurface(routeLike = {}) {
  const rawPath = String(routeLike.fullPath || routeLike.path || '');
  const path = normalizeAppPath(rawPath);
  const name = String(routeLike.name || '').toLowerCase();

  // Specific hubs before generic admin/dashboard
  if (
    path.startsWith('/school-operations') ||
    name.includes('schooloperations') ||
    name.includes('schooloperationshub')
  ) {
    return { key: 'school_operations', ...COMMAND_SURFACES.school_operations };
  }

  if (
    path.startsWith('/people-operations') ||
    path.startsWith('/admin/hiring') ||
    path.startsWith('/admin/careers') ||
    path.startsWith('/admin/pre-hire') ||
    path.startsWith('/admin/onboarding') ||
    path.startsWith('/admin/interview-hub') ||
    path.startsWith('/admin/employee-relations') ||
    name.includes('peopleoperations') ||
    name.includes('employeerelations')
  ) {
    return { key: 'people_operations', ...COMMAND_SURFACES.people_operations };
  }

  if (
    path.startsWith('/workforce-operations') ||
    path === '/schedule' ||
    name.includes('schedulehub') ||
    name.includes('workforceoperations')
  ) {
    return { key: 'workforce_operations', ...COMMAND_SURFACES.workforce_operations };
  }

  if (
    path.startsWith('/operations-dashboard') ||
    name.includes('operationsdashboard') ||
    name.includes('providerplusdashboard')
  ) {
    return { key: 'operations_dashboard', ...COMMAND_SURFACES.operations_dashboard };
  }

  if (
    path === '/admin' ||
    path.startsWith('/admin-dashboard') ||
    name === 'admindashboard' ||
    name === 'organizationadmindashboard' ||
    name === 'tenantadmindashboard' ||
    name === 'organizationtenantadmindashboard' ||
    (name.includes('admindashboard') && !name.includes('school') && !name.includes('provider'))
  ) {
    return { key: 'admin_dashboard', ...COMMAND_SURFACES.admin_dashboard };
  }

  // Personal / My Dashboard — exact /dashboard (not /admin/... nested)
  if (
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    name === 'dashboard' ||
    name === 'organizationdashboard'
  ) {
    return { key: 'my_dashboard', ...COMMAND_SURFACES.my_dashboard };
  }

  return null;
}

/**
 * Bonus points for a NAV_SEARCH_INDEX item on the active surface.
 * @param {{ section?: string, path?: string, title?: string, keywords?: string[] }} item
 * @param {CommandSurface | null} surface
 */
export function surfaceBoostForNavItem(item, surface) {
  if (!surface) return 0;
  let boost = 0;
  const section = String(item.section || '').toLowerCase();
  const path = String(item.path || '').toLowerCase();
  const title = String(item.title || '').toLowerCase();
  const kws = (item.keywords || []).map((k) => String(k).toLowerCase());

  for (const hint of surface.navSectionHints || []) {
    if (hint && section.includes(hint.toLowerCase())) {
      boost += 45;
      break;
    }
  }
  for (const hint of surface.navPathHints || []) {
    if (hint && path.includes(hint.toLowerCase())) {
      boost += 55;
      break;
    }
  }
  for (const kw of surface.quickNavKeywords || []) {
    const k = kw.toLowerCase();
    if (title.includes(k) || kws.some((x) => x.includes(k))) {
      boost += 12;
      break;
    }
  }
  return boost;
}

/**
 * Bonus points for a quick-nav catalog entry on the active surface.
 * @param {{ group?: string, label?: string, keywords?: string[], description?: string }} entry
 * @param {CommandSurface | null} surface
 */
export function surfaceBoostForQuickNavEntry(entry, surface) {
  if (!surface) return 0;
  let boost = 0;
  if ((surface.quickNavGroups || []).includes(entry.group)) boost += 35;
  const label = String(entry.label || '').toLowerCase();
  const desc = String(entry.description || '').toLowerCase();
  const kws = (entry.keywords || []).map((k) => String(k).toLowerCase());
  for (const kw of surface.quickNavKeywords || []) {
    const k = kw.toLowerCase();
    if (label.includes(k) || desc.includes(k) || kws.some((x) => x.includes(k) || k.includes(x))) {
      boost += 25;
      break;
    }
  }
  return boost;
}
