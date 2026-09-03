/**
 * Product location knowledge for Ask Assistant ("where can I find…?").
 *
 * Vue-free so the backend can import it (same pattern as profileSearchCatalog).
 * Keep destinations aligned with `quickNavCatalog.js` + backend
 * `NAVIGATION_ROUTE_WHITELIST` in toolRegistry.service.js.
 */

export const PRODUCT_LOCATION_GROUP_LABELS = {
  account: 'My Account',
  schedule: 'My Schedule',
  clients: 'Clients',
  learning: 'Learning',
  workspace: 'My Dashboard',
  admin: 'Admin'
};

/**
 * @typedef {object} ProductLocation
 * @property {string} id
 * @property {string|null} routeName  navigateTo whitelist name (null = explain only)
 * @property {string} label
 * @property {string} description
 * @property {string} group
 * @property {string} howToFind  human breadcrumb / where staff look
 * @property {string[]} keywords
 * @property {string[]|null} [rolesAny]
 */

/** @type {ProductLocation[]} */
export const PRODUCT_LOCATIONS = [
  {
    id: 'overview',
    routeName: 'Dashboard',
    label: 'Overview',
    description: 'Dashboard home — schedule, pay period, and quick actions.',
    group: 'workspace',
    howToFind: 'My Dashboard → Overview (home)',
    keywords: ['overview', 'home', 'dashboard', 'today', 'landing']
  },
  {
    id: 'schedule',
    routeName: 'Schedule',
    label: 'My Schedule',
    description: 'Your week, availability, and bookings.',
    group: 'schedule',
    howToFind: 'My Dashboard → Schedule',
    keywords: ['schedule', 'calendar', 'availability', 'bookings', 'appointments', 'my week']
  },
  {
    id: 'notifications',
    routeName: 'Notifications',
    label: 'Notifications',
    description: 'Alerts and notification center.',
    group: 'workspace',
    howToFind: 'My Dashboard → Notifications',
    keywords: ['notifications', 'alerts', 'bell']
  },
  {
    id: 'account',
    routeName: 'AccountInfo',
    label: 'Account Info',
    description: 'Profile, contact details, and security.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Account Info',
    keywords: ['account', 'profile', 'personal', 'security', 'contact', 'my account']
  },
  {
    id: 'credentials',
    routeName: 'Credentials',
    label: 'Credentials',
    description: 'Licenses and certifications on your account.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Credentials',
    keywords: ['credentials', 'licenses', 'certifications', 'license', 'cert']
  },
  {
    id: 'payroll',
    routeName: 'MyPayroll',
    label: 'Payroll',
    description: 'Pay stubs, PTO, mileage, and claims.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Payroll',
    keywords: ['payroll', 'pay', 'paycheck', 'pay stubs', 'stubs', 'pto', 'mileage', 'claims', 'my pay']
  },
  {
    id: 'compensation',
    routeName: 'MyCompensation',
    label: 'Compensation',
    description: 'Pay rates and agreements.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Compensation',
    keywords: ['compensation', 'rates', 'agreements', 'pay structure', 'rate']
  },
  {
    id: 'benefits',
    routeName: 'MyBenefits',
    label: 'Benefits',
    description: 'Benefit eligibility and tiers.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Benefits',
    keywords: ['benefits', 'benefit', 'eligibility', 'tier', 'perks']
  },
  {
    id: 'documents',
    routeName: 'MyDocuments',
    label: 'Documents',
    description: 'Forms and documents to sign.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Documents',
    keywords: ['documents', 'forms', 'files', 'sign', 'signature', 'my documents', 'agreements']
  },
  {
    id: 'preferences',
    routeName: 'Preferences',
    label: 'Preferences',
    description: 'Notification and integration settings.',
    group: 'account',
    howToFind: 'My Dashboard → My Account → Preferences',
    keywords: ['preferences', 'settings', 'notifications settings', 'alerts settings']
  },
  {
    id: 'school-clients',
    routeName: 'SchoolClients',
    label: 'School Clients',
    description: 'Your school caseload on My Dashboard.',
    group: 'clients',
    howToFind: 'My Dashboard → Clients → School',
    keywords: ['school clients', 'school caseload', 'my school clients', 'caseload']
  },
  {
    id: 'office-clients',
    routeName: 'OfficeClients',
    label: 'Office Clients',
    description: 'In-office / clinical clients.',
    group: 'clients',
    howToFind: 'My Dashboard → Clients → Office',
    keywords: ['office clients', 'clinical clients', 'in office clients']
  },
  {
    id: 'new-clients',
    routeName: 'NewClients',
    label: 'New Clients',
    description: 'Pending / new client intake list.',
    group: 'clients',
    howToFind: 'My Dashboard → Clients → New',
    keywords: ['new clients', 'pending clients']
  },
  {
    id: 'client-exchange',
    routeName: 'ClientExchange',
    label: 'Client Exchange',
    description: 'Caseload swap / transfer requests.',
    group: 'clients',
    howToFind: 'My Dashboard → Clients → Exchange',
    keywords: ['client exchange', 'caseload swap', 'transfer client']
  },
  {
    id: 'client-management',
    routeName: 'ClientManagement',
    label: 'Client Management',
    description: 'Agency client admin list.',
    group: 'admin',
    howToFind: 'Admin → Clients',
    keywords: ['client management', 'admin clients', 'all clients'],
    rolesAny: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin']
  },
  {
    id: 'school-portals',
    routeName: 'SchoolPortalsHub',
    label: 'School Portals',
    description: 'Hub for school / program portal links.',
    group: 'admin',
    howToFind: 'Admin → School Portals',
    keywords: ['school portals', 'school portal', 'portals hub', 'program portals'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'school-events',
    routeName: 'CaseloadHubEvents',
    label: 'School Events',
    description: 'School event list and provider request review (Caseload Hub).',
    group: 'admin',
    howToFind: 'Admin → Caseload Hub → School Events',
    keywords: [
      'school events',
      'school event',
      'events for schools',
      'school event list',
      'caseload hub events',
      'provider requests',
      'staff see school events',
      'where staff see events',
      'events at schools'
    ],
    rolesAny: [
      'admin',
      'support',
      'staff',
      'super_admin',
      'provider_plus',
      'provider',
      'clinical_practice_assistant'
    ]
  },
  {
    id: 'school-events-calendar',
    routeName: 'CaseloadHubCalendar',
    label: 'School Events Calendar',
    description: 'Calendar of school events and staffing status.',
    group: 'admin',
    howToFind: 'Admin → Caseload Hub → School Events Calendar',
    keywords: ['school events calendar', 'caseload hub calendar', 'school event calendar'],
    rolesAny: [
      'admin',
      'support',
      'staff',
      'super_admin',
      'provider_plus',
      'provider',
      'clinical_practice_assistant'
    ]
  },
  {
    id: 'school-management',
    routeName: 'CaseloadHubSchoolsStaff',
    label: 'School Management',
    description: 'Schools & staff coverage, open school days, and coverage needs.',
    group: 'admin',
    howToFind: 'Admin → Caseload Hub → Schools & Staff',
    keywords: [
      'school management',
      'schools staff',
      'schools and staff',
      'caseload hub',
      'coverage needs',
      'open school spots'
    ],
    rolesAny: [
      'admin',
      'support',
      'staff',
      'super_admin',
      'provider_plus',
      'provider',
      'clinical_practice_assistant',
      'schedule_manager',
      'supervisor'
    ]
  },
  {
    id: 'outreach-hub',
    routeName: 'OutreachHub',
    label: 'Outreach Hub',
    description: 'Track school contacts, visits, and partnership stages.',
    group: 'admin',
    howToFind: 'Admin → Outreach Hub',
    keywords: ['outreach', 'outreach hub', 'school visits', 'school contacts', 'partnership'],
    rolesAny: [
      'admin',
      'support',
      'staff',
      'super_admin',
      'provider_plus',
      'provider',
      'clinical_practice_assistant'
    ]
  },
  {
    id: 'program-events',
    routeName: 'SkillBuildersProgramsEvents',
    label: 'Program Events',
    description: 'Skill Builders / program events (not school Caseload Hub events).',
    group: 'admin',
    howToFind: 'Admin → Program Events',
    keywords: ['program events', 'program event', 'skill builders events', 'skill builder events'],
    rolesAny: [
      'admin',
      'staff',
      'support',
      'super_admin',
      'provider',
      'provider_plus',
      'intern',
      'intern_plus',
      'clinical_practice_assistant'
    ]
  },
  {
    id: 'user-manager',
    routeName: 'UserManager',
    label: 'User Manager',
    description: 'Staff directory and user administration.',
    group: 'admin',
    howToFind: 'Admin → Users',
    keywords: ['user manager', 'users', 'staff directory', 'employee list', 'people admin'],
    rolesAny: ['admin', 'super_admin', 'support', 'staff']
  },
  {
    id: 'provider-directory',
    routeName: 'ProviderDirectory',
    label: 'Provider Directory',
    description: 'Public-facing / internal provider directory.',
    group: 'admin',
    howToFind: 'Admin → Provider Directory',
    keywords: ['provider directory', 'provider list', 'clinician directory'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin']
  },
  {
    id: 'referral-directory',
    routeName: 'ReferralDirectory',
    label: 'Referral Directory',
    description: 'External referral resources (pediatrics, psychiatry, etc.).',
    group: 'admin',
    howToFind: 'Admin → Referral Directory',
    keywords: ['referral directory', 'referrals', 'referral'],
    rolesAny: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin']
  },
  {
    id: 'hiring',
    routeName: 'HiringCandidates',
    label: 'Hiring Candidates',
    description: 'Hiring pipeline and candidates.',
    group: 'admin',
    howToFind: 'Admin → Hiring Candidates',
    keywords: ['hiring', 'candidates', 'hire', 'recruiting'],
    rolesAny: ['admin', 'super_admin']
  },
  {
    id: 'admin-payroll',
    routeName: 'AdminPayroll',
    label: 'Admin Payroll',
    description: 'Agency payroll management.',
    group: 'admin',
    howToFind: 'Admin → Payroll',
    keywords: ['admin payroll', 'payroll management', 'payroll admin', 'run payroll'],
    rolesAny: ['admin', 'super_admin', 'support', 'staff']
  },
  {
    id: 'gear',
    routeName: 'GearInventory',
    label: 'Gear Inventory',
    description: 'Stock levels and unique assets.',
    group: 'admin',
    howToFind: 'Admin → Gear Inventory',
    keywords: ['gear', 'inventory', 'stock', 'assets', 'equipment inventory'],
    rolesAny: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']
  },
  {
    id: 'materials',
    routeName: 'MaterialsRequests',
    label: 'Materials Requests',
    description: 'Onboarding materials, carts, and fulfillment.',
    group: 'admin',
    howToFind: 'Admin → Materials Requests',
    keywords: ['materials', 'materials requests', 'carts', 'fulfillment', 'trifold'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'note-aid',
    routeName: 'NoteAid',
    label: 'Note Aid',
    description: 'Clinical note generator.',
    group: 'admin',
    howToFind: 'Admin → Note Aid',
    keywords: ['note aid', 'note generator', 'clinical note', 'generate note'],
    rolesAny: ['admin', 'support', 'staff', 'provider', 'super_admin']
  },
  {
    id: 'credentialing',
    routeName: 'AgencyCredentialing',
    label: 'Agency Credentialing',
    description: 'Provider credentialing workflows.',
    group: 'admin',
    howToFind: 'Admin → Credentialing',
    keywords: ['credentialing', 'agency credentialing', 'provider credentialing'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin']
  },
  {
    id: 'presence',
    routeName: 'PresenceTeamBoard',
    label: 'Team Presence',
    description: 'Who is in / team board.',
    group: 'admin',
    howToFind: 'Admin → Presence',
    keywords: ['presence', 'team board', 'who is in', "who's in"],
    rolesAny: ['admin', 'super_admin']
  },
  {
    id: 'audit',
    routeName: 'AuditCenter',
    label: 'Audit Center',
    description: 'Audit log and activity.',
    group: 'admin',
    howToFind: 'Admin → Audit Center',
    keywords: ['audit center', 'audit log', 'audit activity'],
    rolesAny: ['admin', 'support', 'super_admin']
  },
  {
    id: 'email-settings',
    routeName: 'AutomatedEmailSettings',
    label: 'Email Settings',
    description: 'Automated email / sender identity settings.',
    group: 'admin',
    howToFind: 'Admin → Email Settings',
    keywords: ['email settings', 'auto email', 'automated email', 'sender identity', 'from address'],
    rolesAny: ['admin', 'super_admin', 'support']
  },
  {
    id: 'training-kb',
    routeName: 'TrainingKnowledgeBase',
    label: 'Training Knowledge Base',
    description: 'Workplace handbook and policy reference docs.',
    group: 'admin',
    howToFind: 'Admin → Module Manager → Training Knowledge Base',
    keywords: [
      'training knowledge base',
      'handbook',
      'policies',
      'training reference',
      'workplace handbook'
    ],
    rolesAny: ['admin', 'support', 'super_admin']
  },
  {
    id: 'module-manager',
    routeName: 'ModuleManager',
    label: 'Module Manager',
    description: 'Training modules administration.',
    group: 'admin',
    howToFind: 'Admin → Modules',
    keywords: ['module manager', 'training modules', 'admin modules'],
    rolesAny: ['admin', 'support', 'super_admin']
  },
  {
    id: 'tasks',
    routeName: 'Tasks',
    label: 'Tasks',
    description: 'Tasks hub / work lists.',
    group: 'workspace',
    howToFind: 'Tasks (top nav / Tasks hub)',
    keywords: ['tasks', 'task list', 'to do', 'todos', 'work lists']
  }
];

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

function roleAllowed(role, rolesAny) {
  if (!rolesAny || !rolesAny.length) return true;
  const r = normalizeRole(role);
  if (r === 'super_admin' || r === 'superadmin') return true;
  return rolesAny.map(normalizeRole).includes(r);
}

/**
 * True when the user is asking where a feature lives in the product UI
 * (not handbook policy / live DB counts).
 */
export function looksLikeProductLocationAsk(prompt) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return false;
  if (/\b(handbook|polic(?:y|ies)|pto balance|sick leave policy|dress code)\b/.test(lower)) {
    // Still allow "where is the handbook" as location.
    if (!/\b(where|find|open|go to|take me)\b/.test(lower)) return false;
  }
  if (
    /\bwhere\s+(can|do|does|is|are|to)\b/.test(lower) ||
    /\bhow\s+do\s+i\s+(find|get\s+to|open|see|access|reach)\b/.test(lower) ||
    /\b(locate|take me to|go to)\b/.test(lower)
  ) {
    return true;
  }
  if (
    /\b(find|see|view|access)\b/.test(lower) &&
    /\b(page|screen|menu|tab|section|hub|area)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/**
 * Strip conversational wrappers so scoring hits feature labels/keywords.
 */
export function extractProductLocationQuery(prompt) {
  let s = String(prompt || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return '';

  s = s
    .replace(/^(hey|hi|hello|please|can you|could you|would you)\s+/i, '')
    .replace(
      /\bwhere\s+(can|do|does)\s+(i|we|staff|providers?|admins?|users?|employees?|people|clinicians?)\s+(find|see|view|access|open|go to|get to)\s+/gi,
      ''
    )
    .replace(
      /\bwhere\s+(staff|providers?|admins?|users?|employees?|people|clinicians?)\s+(can|do|does)?\s*(find|see|view|access|open)\s+/gi,
      ''
    )
    .replace(/\bwhere\s+(can|do)\s+i\s+(find|see|view|access|open)\s+/gi, '')
    .replace(/\bwhere\s+(is|are)\s+(the\s+)?/gi, '')
    .replace(/\bwhere\s+to\s+(find|see|go)\s+(the\s+)?/gi, '')
    .replace(/\bhow\s+do\s+i\s+(find|get to|open|see|access|reach)\s+(the\s+)?/gi, '')
    .replace(/\btake me to\s+(the\s+)?/gi, '')
    .replace(/\bgo to\s+(the\s+)?/gi, '')
    .replace(/\blocate\s+(the\s+)?/gi, '')
    .replace(/\b(please|thanks|thank you)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize common paraphrases toward catalog keywords.
  s = s
    .replace(/\bevents?\s+for\s+schools?\b/g, 'school events')
    .replace(/\bschools?\s+events?\b/g, 'school events')
    .replace(/\bevents?\s+at\s+schools?\b/g, 'school events')
    .replace(/\bsee\s+the\s+events\b/g, 'school events')
    .replace(/\bthe\s+events\b/g, 'events')
    .replace(/\s+/g, ' ')
    .trim();

  // Second pass: leftover "where …" wrappers after paraphrase rewrites.
  s = s
    .replace(
      /\bwhere\s+(can|do|does)\s+(i|we|staff|providers?|admins?|users?|employees?|people|clinicians?)\s+(find|see|view|access|open)\s+/gi,
      ''
    )
    .replace(/\bwhere\s+(is|are)\s+(the\s+)?/gi, '')
    .replace(/[?!.,;:]+$/g, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
}

/**
 * Fuzzy score — higher is better; 0 = no match.
 */
export function scoreProductLocation(query, entry) {
  const q = String(query || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  if (!q || !entry) return 0;

  const label = String(entry.label || '').toLowerCase();
  const desc = String(entry.description || '').toLowerCase();
  const how = String(entry.howToFind || '').toLowerCase();
  const keywords = (entry.keywords || []).map((k) => String(k || '').toLowerCase());

  if (label === q) return 200;
  if (keywords.some((k) => k === q)) return 180;
  if (label.startsWith(q)) return 160;
  if (keywords.some((k) => k.startsWith(q))) return 140;
  if (label.includes(q)) return 120;
  if (keywords.some((k) => k.includes(q))) return 100;
  if (how.includes(q)) return 80;
  if (desc.includes(q)) return 60;

  const tokens = q.split(' ').filter((t) => t.length > 1 && !/^(the|a|an|for|to|of|in|on|at)$/.test(t));
  if (tokens.length > 1) {
    const hay = `${label} ${keywords.join(' ')} ${how}`;
    const hit = tokens.filter((t) => hay.includes(t)).length;
    if (hit === tokens.length) return 90;
    if (hit >= Math.ceil(tokens.length * 0.7)) return 70;
  }

  return 0;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.role]
 * @param {Set<string>|string[]} [opts.allowedRouteNames]  navigateTo whitelist for this user
 * @param {number} [opts.minScore]
 * @returns {{ entry: ProductLocation, score: number, canNavigate: boolean }|null}
 */
export function resolveBestProductLocation({ prompt, role, allowedRouteNames = null, minScore = 70 } = {}) {
  const ask = looksLikeProductLocationAsk(prompt);
  const q = extractProductLocationQuery(prompt);
  if (!q) return null;
  // Require location phrasing OR a strong exact-ish keyword hit on a short prompt.
  if (!ask) {
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 6) return null;
  }

  const allowed = allowedRouteNames
    ? allowedRouteNames instanceof Set
      ? allowedRouteNames
      : new Set(allowedRouteNames)
    : null;

  let best = null;
  for (const entry of PRODUCT_LOCATIONS) {
    if (!roleAllowed(role, entry.rolesAny)) continue;
    const score = scoreProductLocation(q, entry);
    if (score < minScore) continue;
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  if (!best) return null;

  const routeName = best.entry.routeName;
  const canNavigate = Boolean(routeName && (!allowed || allowed.has(routeName)));
  return { ...best, canNavigate };
}

export function formatProductLocationAnswer(entry, { canNavigate = false } = {}) {
  const label = entry?.label || 'That page';
  const where = entry?.howToFind || PRODUCT_LOCATION_GROUP_LABELS[entry?.group] || 'the app';
  const desc = String(entry?.description || '').trim();
  const bits = [`${label} is under ${where}.`];
  if (desc) bits.push(desc);
  if (canNavigate) bits.push('Opening it for you.');
  else if (entry?.routeName) bits.push('You may not have access to open it from here — ask an admin if you need it.');
  return bits.join(' ');
}
