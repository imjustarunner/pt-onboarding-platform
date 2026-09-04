/**
 * Product location knowledge for Ask Assistant ("where can I find…?").
 *
 * Vue-free so the backend can import it (same pattern as profileSearchCatalog).
 * Curated PRODUCT_LOCATIONS cover high-traffic destinations with routeNames;
 * APP_PAGES (full page index) fills the rest so Ask can explain + open by path.
 *
 * Quick Nav is the jump-to-page UI; Ask is the conversational “where/what” option.
 */

import { APP_PAGES } from './appPagesData.js';

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
    id: 'my-clients',
    routeName: 'MyClients',
    label: 'My Clients',
    description: 'Your caseload and client workflow hub.',
    group: 'clients',
    howToFind: 'My Dashboard → Clients',
    keywords: ['my clients', 'clients tab', 'caseload hub', 'client workflow'],
    rolesAny: ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant', 'admin', 'super_admin', 'supervisor', 'support', 'staff']
  },
  {
    id: 'office-clients',
    routeName: 'OfficeClients',
    label: 'Office Clients',
    description: 'Prospective and continuing office enrollments workspace.',
    group: 'clients',
    howToFind: 'Admin → Office Clients',
    path: '/admin/office-clients',
    keywords: ['office clients', 'clinical clients', 'in office clients', 'office enrollments', 'waitlist'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'office-hub',
    routeName: 'OfficeHub',
    label: 'Office Hub',
    description: 'Office operational command center for intakes, waitlist, and today’s activity.',
    group: 'clients',
    howToFind: 'Admin → Office Hub',
    path: '/admin/office-hub',
    keywords: ['office hub', 'office client management', 'office dashboard'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'my-office-caseload',
    routeName: 'MyOfficeCaseload',
    label: 'My Office Caseload',
    description: 'Provider dashboard office/clinical clients tab.',
    group: 'clients',
    howToFind: 'My Dashboard → Clients → Office',
    path: '/dashboard?tab=clients&clients=office',
    keywords: ['my office clients', 'office caseload']
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
    keywords: ['tasks', 'task list', 'to do', 'todos', 'work lists', 'shared lists']
  },
  {
    id: 'submit',
    routeName: 'SubmitHub',
    label: 'Submit',
    description: 'Mileage, reimbursement, PTO, time, and availability claims.',
    group: 'schedule',
    howToFind: 'My Dashboard → Submit',
    keywords: ['submit', 'claims', 'mileage', 'reimbursement', 'time claim', 'submit hub']
  },
  {
    id: 'supervision',
    routeName: 'SupervisionHub',
    label: 'Supervision',
    description: 'Supervisee sessions, notes, and support.',
    group: 'schedule',
    howToFind: 'My Dashboard → Supervision',
    keywords: ['supervision', 'supervisee', 'supervisor hub']
  },
  {
    id: 'my-supervision',
    routeName: 'MySupervisionHub',
    label: 'My Supervision',
    description: 'Your supervision sessions, transcripts, and summaries.',
    group: 'schedule',
    howToFind: 'My Dashboard → My Supervision',
    keywords: ['my supervision', 'supervision transcripts']
  },
  {
    id: 'assigned-training',
    routeName: 'AssignedTraining',
    label: 'Assigned Training',
    description: 'Assigned onboarding modules and learning paths.',
    group: 'learning',
    howToFind: 'My Dashboard → Training',
    keywords: ['assigned training', 'training modules', 'onboarding modules', 'learning paths']
  },
  {
    id: 'my-work',
    routeName: 'MyWorkChecklist',
    label: 'My Work',
    description: 'Focus digest, checklist, and actionable items.',
    group: 'learning',
    howToFind: 'My Dashboard → My Work / Checklist',
    keywords: ['my work', 'momentum', 'checklist', 'focus digest']
  },
  {
    id: 'platform-chats',
    routeName: 'PlatformChats',
    label: 'Platform Chats',
    description: 'Message your team.',
    group: 'workspace',
    howToFind: 'My Dashboard → Chats',
    keywords: ['chats', 'chat', 'messages', 'messaging', 'platform chats']
  },
  {
    id: 'my-learning',
    routeName: 'MyLearning',
    label: 'My Learning',
    description: 'Catalog, progress, and continuing education courses.',
    group: 'learning',
    howToFind: 'My Learning (catalog / on-demand training)',
    keywords: ['my learning', 'on demand training', 'on-demand', 'continuing education', 'certificates']
  },
  {
    id: 'library',
    routeName: 'Library',
    label: 'Tools and Resources',
    description: 'Guides, templates, care documents, forms, and shared Google Docs.',
    group: 'workspace',
    howToFind: 'Library',
    keywords: ['library', 'resources', 'templates', 'guides', 'handouts', 'shared files']
  },
  {
    id: 'tools-aids',
    routeName: 'ToolsAids',
    label: 'Tools',
    description: 'Assessments, games and activities, and AI tools.',
    group: 'workspace',
    howToFind: 'Tools / Tools & Aids',
    keywords: ['tools', 'aids', 'tools aids', 'assessments', 'games', 'activities', 'ai tools'],
    rolesAny: [
      'admin',
      'support',
      'staff',
      'provider',
      'provider_plus',
      'super_admin',
      'intern',
      'intern_plus',
      'clinical_practice_assistant',
      'supervisor',
      'facilitator',
      'school_staff'
    ]
  },
  {
    id: 'office-approvals',
    routeName: 'OfficeApprovals',
    label: 'Office Approvals',
    description: 'Approve office requests and triage Therapy Notes coverage conflicts.',
    group: 'schedule',
    howToFind: 'Admin → Office Approvals',
    keywords: ['office approvals', 'approve office', 'coverage flags', 'therapy notes conflicts'],
    rolesAny: [
      'admin',
      'support',
      'staff',
      'super_admin',
      'clinical_practice_assistant',
      'provider_plus',
      'schedule_manager'
    ]
  },
  {
    id: 'client-action-admin',
    routeName: 'ClientOnboardingWorkspace',
    label: 'Client Action Needed',
    description: 'Clients who still need a next step — fall confirmation, intake, or clearance.',
    group: 'clients',
    howToFind: 'Admin → Client Onboarding / Client Action Needed',
    keywords: ['client action needed', 'client onboarding', 'fall confirmation', 'onboarding workspace'],
    rolesAny: ['admin', 'staff', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus']
  },
  {
    id: 'client-action-provider',
    routeName: 'ProviderClientOnboarding',
    label: 'Client Action Needed (Provider)',
    description: 'Provider fall confirmation and new-client next steps.',
    group: 'clients',
    howToFind: 'Provider → Client Action Needed',
    keywords: ['provider client onboarding', 'provider fall confirmation'],
    rolesAny: ['provider', 'provider_plus', 'intern', 'supervisor']
  },
  {
    id: 'office-intake-queue',
    routeName: 'OfficeIntakeQueue',
    label: 'New Office Clients',
    description: 'Office/clinical digital intakes awaiting provider assignment.',
    group: 'admin',
    howToFind: 'Admin → Office Intake Queue',
    keywords: ['office intake', 'new office clients', 'digital intake', 'pending assignment'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'announcements',
    routeName: 'AnnouncementsHub',
    label: 'Announcements',
    description: 'Splashes, banners, engagement, and birthday / anniversary queue.',
    group: 'admin',
    howToFind: 'Admin → Announcements',
    keywords: ['announcements', 'splash', 'banner', 'birthday', 'anniversary'],
    rolesAny: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant']
  },
  {
    id: 'admin-update',
    routeName: 'CommunicationsHub',
    label: 'Admin Update',
    description: 'Monthly branded staff newsletter from Communications Center.',
    group: 'admin',
    howToFind: 'Admin → Communications → Admin Update',
    keywords: ['admin update', 'newsletter', 'staffing updates', 'communications center'],
    rolesAny: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']
  },
  {
    id: 'escalations',
    routeName: 'EscalationsDesk',
    label: 'Escalations',
    description: 'Escalations desk for urgent agency issues.',
    group: 'admin',
    howToFind: 'Admin → Escalations',
    keywords: ['escalations', 'escalation desk', 'urgent issues'],
    rolesAny: ['admin', 'super_admin', 'support']
  },
  {
    id: 'provider-fall-update',
    routeName: 'ProviderYearUpdateAdmin',
    label: 'Provider Fall Update',
    description: 'Provider year / fall update administration.',
    group: 'admin',
    howToFind: 'Admin → Provider Fall Update',
    keywords: ['provider fall update', 'year update', 'provider year update'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'provider-update',
    routeName: 'ProviderUpdateAdmin',
    label: 'Provider Update',
    description: 'Modular provider update pushes, handbook, and payroll time submit.',
    group: 'admin',
    howToFind: 'Admin → Provider Update',
    keywords: ['provider update', 'handbook push', 'people ops update'],
    rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
  },
  {
    id: 'payroll-pending',
    routeName: 'PayrollPendingSubmissions',
    label: 'Payroll Pending Submissions',
    description: 'Review pending payroll claims and submissions.',
    group: 'admin',
    howToFind: 'Admin → Payroll → Pending Submissions',
    keywords: ['payroll pending', 'pending submissions', 'pending claims'],
    rolesAny: ['admin', 'super_admin', 'support', 'staff']
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
    .replace(/\bwhere\s+(can|do)\s+i\s+/gi, '')
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

function appPageToLocationEntry(page) {
  if (!page?.path) return null;
  return {
    id: `app-page-${String(page.path).replace(/[^\w]+/g, '-')}`,
    routeName: null,
    path: page.path,
    label: page.title,
    description: page.desc || '',
    group: 'admin',
    howToFind: page.section || 'the app',
    keywords: [
      String(page.title || '').toLowerCase(),
      ...((page.keywords || []).map((k) => String(k || '').toLowerCase()))
    ].filter(Boolean),
    fromAppPages: true
  };
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.role]
 * @param {Set<string>|string[]} [opts.allowedRouteNames]  navigateTo whitelist for this user
 * @param {number} [opts.minScore]
 * @returns {{ entry: object, score: number, canNavigate: boolean }|null}
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
    // Prefer curated destinations slightly over raw index pages.
    const adj = score + 10;
    if (!best || adj > best.score) {
      best = { entry, score: adj };
    }
  }

  for (const page of APP_PAGES || []) {
    const entry = appPageToLocationEntry(page);
    if (!entry) continue;
    const score = scoreProductLocation(q, entry);
    if (score < minScore) continue;
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }

  if (!best) return null;

  const routeName = best.entry.routeName;
  const canNavigateByRoute = Boolean(routeName && (!allowed || allowed.has(routeName)));
  const canNavigateByPath = Boolean(best.entry.path && !routeName);
  return {
    ...best,
    canNavigate: canNavigateByRoute || canNavigateByPath
  };
}

export function formatProductLocationAnswer(entry, { canNavigate = false } = {}) {
  const label = entry?.label || 'That page';
  const where = entry?.howToFind || PRODUCT_LOCATION_GROUP_LABELS[entry?.group] || 'the app';
  const desc = String(entry?.description || '').trim();
  const bits = [`${label} is under ${where}.`];
  if (desc) bits.push(desc);
  if (canNavigate) bits.push('Opening it for you.');
  else if (entry?.routeName || entry?.path) {
    bits.push('You may not have access to open it from here — ask an admin if you need it.');
  }
  return bits.join(' ');
}

/**
 * Ask Assistant intent: "Where can I find X?" → explain + optional navigate.
 * Quick Nav remains the simpler jump-to list for the same destinations.
 */
export function matchProductLocationIntent({
  prompt,
  allowedToolNames,
  role,
  allowedRouteNames = null
}) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;
  if (!looksLikeProductLocationAsk(lower)) return null;

  const resolved = resolveBestProductLocation({
    prompt: lower,
    role,
    allowedRouteNames:
      allowedRouteNames ||
      (allowedToolNames?.has?.('navigateTo') ? null : new Set()),
    minScore: 70
  });
  if (!resolved?.entry) return null;

  const { entry, canNavigate } = resolved;
  const canOpen =
    Boolean(canNavigate) &&
    (Boolean(entry.routeName && allowedToolNames?.has?.('navigateTo')) || Boolean(entry.path));
  const assistantText = formatProductLocationAnswer(entry, { canNavigate: canOpen });

  if (canOpen && entry.routeName && allowedToolNames?.has?.('navigateTo')) {
    return {
      intent: 'product_location',
      capabilityId: 'product_location_help',
      toolCalls: [{ name: 'navigateTo', args: { routeName: entry.routeName } }],
      assistantText
    };
  }

  if (canOpen && entry.path) {
    return {
      intent: 'product_location',
      capabilityId: 'product_location_help',
      toolCalls: [],
      uiCommands: [{ type: 'navigate', to: entry.path }],
      assistantText
    };
  }

  return {
    intent: 'product_location',
    capabilityId: 'product_location_help',
    toolCalls: [],
    assistantText,
    uiCommands: []
  };
}
