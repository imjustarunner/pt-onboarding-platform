/**
 * Shared quick-nav catalog for Overview typeahead and Ask Assistant navigateTo.
 *
 * Keep `routeName` + destination paths aligned with backend
 * `NAVIGATION_ROUTE_WHITELIST` in `toolRegistry.service.js` and
 * `resolveNavigateRouteNameFromPrompt` in `assistantCapabilityCatalog.service.js`.
 */

import { ACCOUNT_SECTIONS } from '../config/accountDisplaySections.js';
import { isSupervisor } from '../utils/helpers.js';
import { resolveOrgSlugForNavigation } from '../utils/router.js';
import { surfaceBoostForQuickNavEntry } from '../utils/resolveCommandSurface.js';

export const QUICK_NAV_GROUP_ORDER = [
  'account',
  'schedule',
  'clients',
  'learning',
  'workspace',
  'admin'
];

export const QUICK_NAV_GROUP_LABELS = {
  account: 'Account',
  schedule: 'Schedule',
  clients: 'Clients',
  learning: 'Learning',
  workspace: 'Workspace',
  admin: 'Admin'
};

/** Route names shared with the Ask Assistant navigateTo whitelist. */
const ACCOUNT_ROUTE_NAMES = {
  account: 'AccountInfo',
  credentials: 'Credentials',
  payroll: 'MyPayroll',
  compensation: 'MyCompensation',
  benefits: 'MyBenefits',
  kudos: 'MyKudos',
  documents: 'MyDocuments',
  'life-balance': 'LifeBalance',
  preferences: 'Preferences'
};

const ACCOUNT_EXTRA_KEYWORDS = {
  account: ['profile', 'personal', 'security', 'contact'],
  credentials: ['licenses', 'certifications', 'license', 'cert'],
  payroll: ['pay', 'paycheck', 'pay check', 'pay stubs', 'stubs', 'pto', 'mileage', 'claims'],
  compensation: ['rates', 'agreements', 'pay structure', 'rate'],
  benefits: ['benefit', 'eligibility', 'tier', 'perks'],
  kudos: ['recognition', 'thanks', 'shoutout'],
  documents: ['forms', 'files', 'sign', 'signature', 'my documents', 'agreements'],
  'life-balance': ['wellbeing', 'well-being', 'wheel', 'balance', 'self-assess'],
  preferences: ['settings', 'notifications', 'alerts', 'integrations']
};

function shortAccountLabel(section) {
  const tag = String(section?.tag || '').trim();
  if (tag) return tag;
  return String(section?.navLabel || section?.title || '')
    .replace(/^My\s+/i, '')
    .trim();
}

function buildAccountEntries() {
  return ACCOUNT_SECTIONS.map((section) => {
    const id = String(section.id);
    const label = shortAccountLabel(section);
    const extras = ACCOUNT_EXTRA_KEYWORDS[id] || [];
    return {
      id: `account-${id}`,
      routeName: ACCOUNT_ROUTE_NAMES[id] || null,
      label,
      description: section.description || '',
      group: 'account',
      keywords: [
        label.toLowerCase(),
        String(section.navLabel || '').toLowerCase(),
        String(section.title || '').toLowerCase(),
        id.replace(/-/g, ' '),
        ...extras
      ].filter(Boolean),
      kind: 'dashboard',
      tab: 'my',
      my: id,
      visibleKey: section.visibleKey || null
    };
  });
}

/**
 * Major destinations beyond My Account — mirrors Ask Assistant whitelist + dashboard rail.
 */
function buildAppEntries() {
  return [
    {
      id: 'workspace-overview',
      routeName: 'Dashboard',
      label: 'Overview',
      description: 'Dashboard home — schedule, pay period, and quick actions.',
      group: 'workspace',
      keywords: ['overview', 'home', 'dashboard', 'today'],
      kind: 'dashboard',
      tab: 'overview'
    },
    {
      id: 'schedule-my',
      routeName: 'Schedule',
      label: 'My Schedule',
      description: 'Your week, availability, and bookings.',
      group: 'schedule',
      keywords: ['schedule', 'calendar', 'availability', 'bookings', 'appointments'],
      kind: 'dashboard',
      tab: 'my_schedule',
      requires: ['showSchedule']
    },
    {
      id: 'schedule-office-approvals',
      routeName: 'OfficeApprovals',
      label: 'Office Approvals',
      description: 'Approve office requests and triage Therapy Notes coverage conflicts.',
      group: 'schedule',
      keywords: [
        'office approvals',
        'approve office requests',
        'office requests',
        'coverage flags',
        'reported conflicts',
        'therapy notes'
      ],
      kind: 'path',
      path: '/admin/office-approvals',
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
      id: 'schedule-submit',
      routeName: null,
      label: 'Submit',
      description: 'Mileage, reimbursement, PTO, time, and availability claims.',
      group: 'schedule',
      keywords: ['submit', 'claim', 'claims', 'mileage', 'reimbursement', 'pto', 'time claim'],
      kind: 'dashboard',
      tab: 'submit',
      requires: ['showClaims']
    },
    {
      id: 'schedule-supervision',
      routeName: null,
      label: 'Supervision',
      description: 'Supervisee sessions, notes, and support.',
      group: 'schedule',
      keywords: ['supervision', 'supervisee', 'supervisor'],
      kind: 'dashboard',
      tab: 'supervision',
      requires: ['showSupervision']
    },
    {
      id: 'schedule-my-supervision',
      routeName: null,
      label: 'My Supervision',
      description: 'Your supervision sessions, transcripts, and summaries.',
      group: 'schedule',
      keywords: ['supervision', 'my supervision', 'transcripts'],
      kind: 'dashboard',
      tab: 'my_supervision',
      requires: ['showMySupervision']
    },
    {
      id: 'clients-caseload',
      routeName: null,
      label: 'My Clients',
      description: 'Your caseload and client workflow.',
      group: 'clients',
      keywords: ['clients', 'caseload', 'client'],
      kind: 'dashboard',
      tab: 'clients',
      rolesAny: ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant', 'admin', 'super_admin']
    },
    {
      id: 'my-school-clients',
      routeName: 'SchoolClients',
      label: 'School Clients',
      description: 'Your school-assigned caseload on My Dashboard.',
      group: 'clients',
      keywords: ['school clients', 'my clients', 'my caseload', 'school caseload'],
      kind: 'path',
      path: '/dashboard?tab=clients&clients=school',
      rolesAny: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'clinical_practice_assistant',
        'supervisor',
        'admin',
        'super_admin',
        'support',
        'staff'
      ]
    },
    {
      id: 'my-office-clients',
      routeName: 'OfficeClients',
      label: 'Office Clients',
      description: 'In-office, virtual, and other non-school clinical clients.',
      group: 'clients',
      keywords: ['office clients', 'clinical clients', 'in-office', 'virtual clients'],
      kind: 'path',
      path: '/dashboard?tab=clients&clients=office',
      rolesAny: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'clinical_practice_assistant',
        'supervisor',
        'admin',
        'super_admin',
        'support',
        'staff'
      ]
    },
    {
      id: 'my-new-clients',
      routeName: 'NewClients',
      label: 'New Clients',
      description: 'Pending school and office clients needing acceptance or a day.',
      group: 'clients',
      keywords: ['new clients', 'pending clients', 'new caseload'],
      kind: 'path',
      path: '/dashboard?tab=clients&clients=new',
      rolesAny: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'clinical_practice_assistant',
        'supervisor',
        'admin',
        'super_admin',
        'support',
        'staff'
      ]
    },
    {
      id: 'client-onboarding-workspace',
      routeName: 'ClientOnboardingWorkspace',
      label: 'Client Action Needed',
      description: 'Clients who still need a next step — fall confirmation, new-client intake, or agency clearance.',
      group: 'clients',
      keywords: ['client action needed', 'client readiness', 'client onboarding', 'onboarding workspace', 'fall confirmation'],
      kind: 'path',
      path: '/admin/client-onboarding?scope=school',
      rolesAny: ['admin', 'staff', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus']
    },
    {
      id: 'provider-client-onboarding',
      routeName: 'ProviderClientOnboarding',
      label: 'Client Action Needed',
      description: 'Fall confirmation, new-client actions, and remaining provider next steps.',
      group: 'clients',
      keywords: ['client action needed', 'client readiness', 'client onboarding', 'provider onboarding', 'fall confirmation'],
      kind: 'path',
      path: '/provider/client-onboarding',
      rolesAny: ['provider', 'provider_plus', 'intern', 'supervisor']
    },
    {
      id: 'clients-admin',
      routeName: 'ClientManagement',
      label: 'Client Management',
      description: 'Agency client directory and management.',
      group: 'clients',
      keywords: ['client management', 'agency clients'],
      kind: 'path',
      path: '/admin/clients',
      rolesAny: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin']
    },
    {
      id: 'clients-exchange',
      routeName: 'ClientExchange',
      label: 'Client Exchange',
      description: 'Post or request office clients that need a new provider.',
      group: 'clients',
      keywords: ['client exchange', 'reassign', 'transfer client', 'caseload swap'],
      kind: 'path',
      path: '/dashboard?tab=clients&clients=exchange',
      rolesAny: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'clinical_practice_assistant',
        'supervisor'
      ]
    },
    {
      id: 'admin-office-intake-queue',
      routeName: 'OfficeIntakeQueue',
      label: 'New Office Clients',
      description: 'Office/clinical digital intakes awaiting provider assignment.',
      group: 'admin',
      keywords: ['office intake', 'office clients', 'digital intake', 'new clients', 'pending assignment'],
      kind: 'path',
      path: '/admin/office-intake-queue',
      rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
    },
    {
      id: 'learning-training',
      routeName: null,
      label: 'Assigned Training',
      description: 'Assigned onboarding modules and learning paths.',
      group: 'learning',
      keywords: ['training', 'modules', 'learning', 'courses', 'onboarding'],
      kind: 'dashboard',
      tab: 'training',
      requires: ['showLearning']
    },
    {
      id: 'learning-my-learning',
      routeName: 'MyLearning',
      label: 'My Learning',
      description: 'Catalog, progress, and continuing education courses.',
      group: 'learning',
      keywords: ['my learning', 'catalog', 'courses', 'certificates', 'continuing education'],
      kind: 'route',
      requires: ['showLearning']
    },
    {
      id: 'workspace-library',
      routeName: 'Library',
      label: 'Library',
      description: 'Guides, templates, care documents, forms, and shared Google Docs.',
      group: 'workspace',
      keywords: [
        'library',
        'resources',
        'google docs',
        'templates',
        'guides',
        'forms',
        'shared files',
        'handouts'
      ],
      kind: 'path',
      path: '/library'
    },
    {
      id: 'learning-checklist',
      routeName: null,
      label: 'My Work',
      description: 'Focus digest, checklist, and actionable items.',
      group: 'learning',
      keywords: ['my work', 'momentum', 'checklist', 'focus', 'to do', 'todo'],
      kind: 'dashboard',
      tab: 'checklist',
      requires: ['showLearning']
    },
    {
      id: 'learning-tasks-hub',
      routeName: null,
      label: 'Tasks',
      description: 'Assigned tasks, shared lists, and meeting actions.',
      group: 'learning',
      keywords: ['tasks', 'shared lists', 'action items', 'to do', 'todo'],
      kind: 'path',
      path: '/tasks',
      requires: ['showLearning']
    },
    {
      id: 'learning-on-demand',
      routeName: 'MyLearning',
      label: 'On-Demand Training',
      description: 'Browse optional on-demand training in My Learning.',
      group: 'learning',
      keywords: ['on demand', 'on-demand', 'library', 'training'],
      kind: 'route',
      requires: ['showLearning']
    },
    {
      id: 'workspace-notifications',
      routeName: 'Notifications',
      label: 'Notifications',
      description: 'Alerts, reminders, and recent updates.',
      group: 'workspace',
      keywords: ['notifications', 'alerts', 'inbox'],
      kind: 'dashboard',
      tab: 'notifications'
    },
    {
      id: 'workspace-chats',
      routeName: null,
      label: 'Platform Chats',
      description: 'Message your team.',
      group: 'workspace',
      keywords: ['chats', 'chat', 'messages', 'messaging'],
      kind: 'dashboard',
      tab: 'chats',
      requires: ['showChats']
    },
    {
      id: 'workspace-tools',
      routeName: 'ToolsAids',
      label: 'Tools',
      description: 'Assessments & evaluations, games and activities, and AI tools.',
      group: 'workspace',
      keywords: [
        'tools',
        'aids',
        'tools aids',
        'note aid',
        'noteaid',
        'clinical note',
        'assessments',
        'evaluations',
        'games',
        'games and activities',
        'activities',
        'ai tools'
      ],
      kind: 'path',
      path: '/tools-aids',
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
      id: 'workspace-note-aid',
      routeName: 'NoteAid',
      label: 'Note Aid',
      description: 'AI clinical note assistant for documentation.',
      group: 'workspace',
      keywords: ['note aid', 'noteaid', 'clinical note', 'documentation'],
      kind: 'path',
      path: '/note-aid',
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
      id: 'admin-payroll',
      routeName: 'AdminPayroll',
      label: 'Admin Payroll',
      description: 'Manage payroll periods, claims, and pending submissions.',
      group: 'admin',
      keywords: ['payroll', 'admin payroll', 'pending submissions', 'pay periods'],
      kind: 'path',
      path: '/admin/payroll',
      requires: ['canManagePayroll']
    },
    {
      id: 'admin-payroll-pending',
      routeName: 'PayrollPendingSubmissions',
      label: 'Payroll Pending Submissions',
      description: 'Approve PTO, event time, mileage, reimbursements, and MedCancel.',
      group: 'admin',
      keywords: [
        'payroll pending',
        'pending submissions',
        'event times',
        'approve time',
        'pto approve',
        'mileage approve',
        'payroll submissions'
      ],
      kind: 'path',
      path: '/admin/payroll/pending',
      requires: ['canManagePayroll']
    },
    {
      id: 'admin-gear-inventory',
      routeName: 'GearInventory',
      label: 'Gear, Equipment & Materials',
      description: 'Catalog, sized stock, unique assets, and issue history.',
      group: 'admin',
      keywords: ['gear', 'inventory', 'stock', 'assets', 'cart', 'hoodie', 'equipment'],
      kind: 'path',
      path: '/admin/gear-inventory',
      rolesAny: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']
    },
    {
      id: 'admin-users',
      routeName: 'UserManager',
      label: 'Users',
      description: 'User manager and member directory.',
      group: 'admin',
      keywords: ['users', 'members', 'user manager', 'directory'],
      kind: 'path',
      path: '/admin/users',
      rolesAny: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant']
    },
    {
      id: 'admin-announcements',
      routeName: 'AnnouncementsHub',
      label: 'Announcements',
      description: 'Splashes, banners, engagement, and birthday / anniversary queue.',
      group: 'admin',
      keywords: ['announcements', 'splash', 'splashes', 'banner', 'birthday', 'anniversary', 'quick announcement'],
      kind: 'path',
      path: '/admin/announcements',
      rolesAny: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant']
    },
    {
      id: 'admin-referrals',
      routeName: 'ReferralDirectory',
      label: 'Referral Directory',
      description: 'External providers and referral resources.',
      group: 'admin',
      keywords: ['referral', 'referrals', 'directory'],
      kind: 'path',
      path: '/admin/referral-directory',
      rolesAny: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin']
    },
    {
      id: 'admin-school-portals',
      routeName: 'SchoolPortalsHub',
      label: 'School Portals',
      description: 'School portals hub and overview.',
      group: 'admin',
      keywords: ['school', 'portals', 'school portals'],
      kind: 'path',
      path: '/admin/school-portals-hub',
      rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
    },
    {
      id: 'admin-provider-year-update',
      routeName: 'ProviderYearUpdateAdmin',
      label: 'Provider Fall Update',
      description: 'Enable, push, and track the provider fall update.',
      group: 'admin',
      keywords: ['provider fall update', 'fall update', 'provider', 'school cart', 'back to school', 'year update'],
      kind: 'path',
      path: '/admin/provider-year-update',
      rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
    },
    {
      id: 'admin-materials-requests',
      routeName: 'MaterialsRequests',
      label: 'Materials Requests',
      description: 'Packets, carts, shirts, and delivery — onboarding, collaborative update, and provider fall-update materials.',
      group: 'admin',
      keywords: [
        'materials',
        'materials requests',
        'packets',
        'paper packets',
        'trifold',
        'carts',
        'shirts',
        'delivery',
        'fulfillment',
        'inventory',
        'onboarding materials',
        'school cart'
      ],
      kind: 'path',
      path: '/admin/materials-requests',
      rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
    },
    {
      id: 'admin-provider-update',
      routeName: 'ProviderUpdateAdmin',
      label: 'Provider Update',
      description: 'Modular provider update pushes, handbook, and payroll time submit.',
      group: 'admin',
      keywords: ['provider update', 'handbook', 'people ops', 'workplace handbook', 'staff update'],
      kind: 'path',
      path: '/admin/provider-update',
      rolesAny: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant']
    },
    {
      id: 'admin-caseload-hub-schools-staff',
      routeName: 'CaseloadHubSchoolsStaff',
      label: 'School Management',
      description: 'Schools & staff coverage, open school days, and coverage needs.',
      group: 'admin',
      keywords: ['caseload', 'coverage', 'school management', 'schools staff', 'open school spots', 'by school', 'by person'],
      kind: 'path',
      path: '/admin/caseload-hub/schools-staff',
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
      id: 'admin-caseload-hub-calendar',
      routeName: 'CaseloadHubCalendar',
      label: 'School Events Calendar',
      description: 'Calendar of school events and staffing status.',
      group: 'admin',
      keywords: ['calendar', 'school events', 'caseload hub'],
      kind: 'path',
      path: '/admin/caseload-hub/calendar',
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
      id: 'admin-caseload-hub-events',
      routeName: 'CaseloadHubEvents',
      label: 'School Events',
      description: 'School event list and provider request review.',
      group: 'admin',
      keywords: ['school events', 'event list', 'provider requests'],
      kind: 'path',
      path: '/admin/caseload-hub/events',
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
      id: 'admin-outreach-hub',
      routeName: 'OutreachHub',
      label: 'Outreach Hub',
      description: 'Track school contacts, visits, and partnership stages.',
      group: 'admin',
      keywords: ['outreach', 'visits', 'school contacts', 'partnership', 'trips'],
      kind: 'path',
      path: '/admin/outreach-hub',
      requires: ['canAccessOutreach'],
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
      id: 'admin-program-events',
      routeName: 'SkillBuildersProgramsEvents',
      label: 'Program Events',
      description: 'Skill Builders and program events.',
      group: 'admin',
      keywords: ['program events', 'skill builders', 'events', 'programs'],
      kind: 'path',
      path: '/admin/program-events',
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
      id: 'admin-hiring',
      routeName: 'HiringCandidates',
      label: 'Applications',
      description: 'Job applications and hiring pipeline.',
      group: 'admin',
      keywords: ['hiring', 'candidates', 'applicants', 'applications', 'hire'],
      kind: 'path',
      path: '/admin/hiring/applicants',
      rolesAny: ['admin', 'super_admin', 'support'],
      requires: ['canManageHiring']
    },
    {
      id: 'admin-email-settings',
      routeName: 'AutomatedEmailSettings',
      label: 'Email Settings',
      description: 'Automated emails, sender identities, and approval vs. send.',
      group: 'admin',
      keywords: ['email settings', 'auto email', 'automated email', 'sender', 'from address', 'notifications', 'fallback', 'delivery', 'roi approval', 'templates'],
      kind: 'path',
      path: '/admin/email-settings',
      rolesAny: ['admin', 'super_admin', 'support']
    },
    {
      id: 'admin-update-newsletter',
      routeName: 'CommunicationsCenter',
      label: 'Admin Update',
      description: 'Monthly branded staff newsletter from Communications Center.',
      group: 'admin',
      keywords: ['admin update', 'newsletter', 'staffing updates', 'departures', 'monthly email'],
      kind: 'path',
      path: '/admin/communications?mode=admin-update',
      rolesAny: ['admin', 'super_admin', 'support', 'staff']
    },
    {
      id: 'admin-audit',
      routeName: 'AuditCenter',
      label: 'Audit Center',
      description: 'Agency audit log and activity.',
      group: 'admin',
      keywords: ['audit', 'audit center', 'activity log'],
      kind: 'path',
      path: '/admin/audit-center',
      rolesAny: ['admin', 'support', 'super_admin']
    },
    {
      id: 'admin-escalations',
      routeName: 'EscalationsDesk',
      label: 'Escalations',
      description: 'Leadership escalations desk — triage, ownership, and resolution.',
      group: 'admin',
      keywords: ['escalations', 'escalation', 'escalations desk', 'leadership', 'issue workflow'],
      kind: 'path',
      path: '/admin/escalations',
      rolesAny: ['admin', 'super_admin', 'support']
    },
    {
      id: 'admin-credentialing',
      routeName: 'AgencyCredentialing',
      label: 'Credentialing',
      description: 'Agency group NPIs and provider credentialing — licenses, payers, and CSV export.',
      group: 'admin',
      keywords: ['credentialing', 'credentialling', 'credentials', 'licenses', 'npi', 'payer credentialing'],
      kind: 'path',
      path: '/admin/credentialing',
      rolesAny: ['admin', 'support', 'staff', 'super_admin'],
      requires: ['canManageCredentialing']
    },
    {
      id: 'admin-presence',
      routeName: 'PresenceTeamBoard',
      label: 'Presence Board',
      description: 'Who is in — team presence board.',
      group: 'admin',
      keywords: ['presence', 'team board', 'who is in'],
      kind: 'path',
      path: '/admin/presence',
      rolesAny: ['admin', 'support', 'super_admin']
    },
    {
      id: 'admin-provider-directory',
      routeName: 'ProviderDirectory',
      label: 'Provider Directory',
      description: 'Internal provider directory.',
      group: 'admin',
      keywords: ['provider directory', 'providers', 'provider list'],
      kind: 'path',
      path: '/admin/provider-directory',
      rolesAny: ['admin', 'support', 'staff', 'super_admin']
    }
  ];
}

/** Full unfiltered catalog (account sections + app areas). */
export function getQuickNavCatalog() {
  return [...buildAccountEntries(), ...buildAppEntries()];
}

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
 * Build access context from auth + Overview/dashboard flags.
 * @param {object} opts
 */
export function buildQuickNavContext(opts = {}) {
  const user = opts.user || null;
  const role = normalizeRole(user?.role);
  const caps = user?.capabilities || {};
  const isTrueAdmin = role === 'admin' || role === 'super_admin' || role === 'superadmin';
  const isProviderLike = [
    'provider',
    'provider_plus',
    'intern',
    'intern_plus',
    'clinical_practice_assistant'
  ].includes(role);
  const isSup = isSupervisor(user);
  const isLimitedAccessNonProvider =
    !isTrueAdmin &&
    !isProviderLike &&
    (isSup || !!caps?.canManageHiring || !!caps?.canManagePayroll);
  const isClubContext = !!opts.isClubContext;
  const isSchoolStaff = role === 'school_staff' || !!opts.isSchoolStaff;

  return {
    user,
    role,
    capabilities: caps,
    isClubContext,
    isSchoolStaff,
    isOnboardingComplete: opts.isOnboardingComplete !== false,
    isLimitedAccessNonProvider,
    flags: {
      workforce: !isClubContext && !isSchoolStaff,
      kudos: !!opts.kudosEnabled
    },
    showSchedule: opts.showSchedule !== false && !isSchoolStaff && !isClubContext,
    showPayroll: !!opts.showPayroll && !isSchoolStaff && !isClubContext,
    showClaims: !!opts.showClaims,
    showSupervision: !!opts.showSupervision,
    showMySupervision: !!opts.showMySupervision,
    showChats: opts.showChats !== false && !isLimitedAccessNonProvider,
    showLearning: !isClubContext && !isSchoolStaff,
    canManagePayroll: !!caps.canManagePayroll || isTrueAdmin,
    canManageHiring: !!caps.canManageHiring || isTrueAdmin,
    canAccessOutreach: !!caps.canAccessOutreach || isTrueAdmin,
    canManageCredentialing: !!caps.canManageCredentialing || isTrueAdmin
  };
}

function entryVisible(entry, ctx) {
  if (!ctx?.isOnboardingComplete && entry.kind === 'path') return false;
  if (ctx?.isSchoolStaff && entry.group !== 'workspace') return false;

  if (entry.visibleKey === 'workforce' && !ctx.flags?.workforce) return false;
  if (entry.visibleKey === 'kudos' && !ctx.flags?.kudos) return false;

  // Hide workforce account tabs for limited-access non-providers (mirrors overview payroll gate).
  if (
    entry.group === 'account' &&
    entry.visibleKey === 'workforce' &&
    ctx.isLimitedAccessNonProvider &&
    !ctx.showPayroll
  ) {
    return false;
  }

  if (Array.isArray(entry.rolesAny) && !roleAllowed(ctx.role, entry.rolesAny)) return false;

  if (Array.isArray(entry.requires)) {
    for (const key of entry.requires) {
      if (key === 'showSchedule' && !ctx.showSchedule) return false;
      if (key === 'showClaims' && !ctx.showClaims) return false;
      if (key === 'showSupervision' && !ctx.showSupervision) return false;
      if (key === 'showMySupervision' && !ctx.showMySupervision) return false;
      if (key === 'showChats' && !ctx.showChats) return false;
      if (key === 'showLearning' && !ctx.showLearning) return false;
      if (key === 'canManagePayroll' && !ctx.canManagePayroll) return false;
      if (key === 'canManageHiring' && !ctx.canManageHiring) return false;
      if (key === 'canAccessOutreach' && !ctx.canAccessOutreach) return false;
      if (key === 'canManageCredentialing' && !ctx.canManageCredentialing) return false;
    }
  }

  return true;
}

export function getAccessibleQuickNavEntries(ctx) {
  return getQuickNavCatalog().filter((e) => entryVisible(e, ctx));
}

function subsequenceScore(haystack, query) {
  let hi = 0;
  let matched = 0;
  for (let qi = 0; qi < query.length; qi += 1) {
    const ch = query[qi];
    let found = false;
    while (hi < haystack.length) {
      if (haystack[hi] === ch) {
        matched += 1;
        hi += 1;
        found = true;
        break;
      }
      hi += 1;
    }
    if (!found) return 0;
  }
  return matched;
}

/**
 * Fuzzy score for a query against one catalog entry. Higher is better; 0 = no match.
 */
export function scoreQuickNavEntry(query, entry) {
  const q = String(query || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  if (!q || !entry) return 0;

  const label = String(entry.label || '').toLowerCase();
  const desc = String(entry.description || '').toLowerCase();
  const keywords = (entry.keywords || []).map((k) => String(k || '').toLowerCase());

  if (label === q) return 200;
  if (label.startsWith(q)) return 160;
  if (keywords.some((k) => k === q)) return 150;
  if (keywords.some((k) => k.startsWith(q))) return 130;
  if (label.includes(q)) return 110;
  if (keywords.some((k) => k.includes(q))) return 90;
  if (desc.includes(q)) return 60;

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const allInLabel = tokens.every((t) => label.includes(t) || keywords.some((k) => k.includes(t)));
    if (allInLabel) return 85;
  }

  const sub = subsequenceScore(label.replace(/\s+/g, ''), q.replace(/\s+/g, ''));
  if (sub >= q.replace(/\s+/g, '').length && q.length >= 2) {
    return 40 + Math.min(20, sub);
  }

  return 0;
}

/**
 * Search accessible entries; returns scored results grouped for UI.
 * @param {object} [opts.surface] – active command surface (boosts matching groups/keywords)
 * @returns {{ flat: Array, groups: Array<{ group, label, items }> }}
 */
export function searchQuickNav(query, ctx, { limit = 24, surface = null } = {}) {
  const accessible = getAccessibleQuickNavEntries(ctx);
  const q = String(query || '').trim();
  if (!q) {
    return { flat: [], groups: [] };
  }

  const scored = accessible
    .map((entry) => {
      const base = scoreQuickNavEntry(q, entry);
      if (!base) return null;
      return {
        ...entry,
        groupLabel: QUICK_NAV_GROUP_LABELS[entry.group] || entry.group,
        score: base + surfaceBoostForQuickNavEntry(entry, surface)
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.label).localeCompare(String(b.label));
    })
    .slice(0, limit);

  const byGroup = new Map();
  for (const item of scored) {
    if (!byGroup.has(item.group)) byGroup.set(item.group, []);
    byGroup.get(item.group).push(item);
  }

  const groups = QUICK_NAV_GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
    group: g,
    label: QUICK_NAV_GROUP_LABELS[g] || g,
    items: byGroup.get(g)
  }));

  return { flat: scored, groups };
}

/**
 * Resolve a catalog entry to a vue-router location.
 * Dashboard destinations keep the current path and merge tab/my into query.
 * Pass `dashboardPath` when jumping from a non-dashboard surface (e.g. Ask Assistant).
 */
export function resolveQuickNavLocation(entry, { currentPath, orgSlug, currentQuery, dashboardPath } = {}) {
  if (!entry) return null;

  if (entry.kind === 'dashboard') {
    const query = { tab: entry.tab };
    if (entry.my) query.my = entry.my;
    const basePath = String(dashboardPath || currentPath || '/dashboard').trim() || '/dashboard';
    return {
      path: basePath,
      query
    };
  }

  if (entry.kind === 'path' && entry.path) {
    const raw = String(entry.path);
    const [pathname, search = ''] = raw.split('?');
    const adminPath = pathname.startsWith('/admin');
    const routeSlug = String(orgSlug || '').trim();
    let slug = routeSlug;
    if (adminPath) {
      slug = resolveOrgSlugForNavigation({
        orgSlug: routeSlug || undefined,
        preferNonDemo: true
      });
    }
    const path = slug ? `/${slug}${pathname}` : pathname;
    if (!search) return path;
    const query = Object.fromEntries(new URLSearchParams(search));
    return { path, query };
  }

  return null;
}

/** Router location for any catalog entry (dashboard, path, or named route). */
export function resolveQuickNavRoute(entry, opts = {}) {
  const loc = resolveQuickNavLocation(entry, opts);
  if (loc) return loc;
  const name = String(entry?.routeName || '').trim();
  if (!name) return null;
  const slug = String(opts.orgSlug || '').trim();
  if (name === 'OrganizationTasks') {
    return slug
      ? { name, params: { organizationSlug: slug } }
      : { name: 'Tasks' };
  }
  if (slug && name.startsWith('Organization')) {
    return { name, params: { organizationSlug: slug } };
  }
  return { name };
}
