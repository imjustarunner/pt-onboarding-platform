/**
 * Comprehensive navigation search index.
 *
 * Each entry represents a page, sub-page, or notable feature within the app.
 * Fields:
 *   title    – primary display name shown in results
 *   section  – parent section / hub label
 *   path     – URL path (no org slug prefix; the search bar prepends one)
 *   keywords – additional terms that should match this entry
 *   desc     – one-line description shown under the title in results
 */

import { surfaceBoostForNavItem } from './resolveCommandSurface.js';

export const NAV_SEARCH_INDEX = [
  // ─── Workforce Operations Hub ────────────────────────────────────────────────
  {
    title: 'Workforce Operations',
    section: 'Hub',
    path: '/workforce-operations',
    keywords: ['hub', 'workforce', 'operations', 'schedule', 'billing', 'staff'],
    desc: 'Main Workforce Operations hub — schedules, billing, staff, and buildings.'
  },

  // Public & Community (Workforce Ops)
  {
    title: 'Careers Page',
    section: 'Workforce Ops › Public & Community',
    path: '/careers',
    publicPath: 'careers',
    keywords: ['careers', 'jobs', 'hiring', 'apply', 'public careers', 'open roles'],
    desc: 'Public careers hub — open positions and job applications.'
  },
  {
    title: 'Office Join',
    section: 'Workforce Ops › Public & Community',
    path: '/join',
    publicPath: 'join',
    keywords: ['office join', 'join', 'adaptive intake', 'new client', 'counseling intake', 'public intake'],
    desc: 'Public adaptive intake — families choose a service and start the office join flow.'
  },
  {
    title: 'Office Appointment Request',
    section: 'Workforce Ops › Public & Community',
    path: '/office-intake',
    publicPath: 'office-intake',
    keywords: ['office intake', 'appointment request', 'schedule interest', 'public form'],
    desc: 'Lightweight public form for scheduling interest before your team follows up.'
  },

  // Staff & Scheduling
  {
    title: 'Schedule Management',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/caseload-hub/schools-staff',
    keywords: ['schedule', 'staff', 'caseloads', 'schools', 'management'],
    desc: 'School and provider schedule management.'
  },
  {
    title: 'Coverage Needs',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=coverage-needs',
    keywords: ['coverage', 'needs', 'open coverage', 'uncovered', 'school management', 'missing coverage'],
    desc: 'Schools with unfilled coverage requirements.'
  },
  {
    title: 'Open School Spots',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=open-spots',
    keywords: ['open spots', 'open days', 'available days', 'vacancies', 'school openings'],
    desc: 'Available school days that still need providers assigned.'
  },
  {
    title: 'By School (Caseloads)',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=by-school',
    keywords: ['by school', 'school caseload', 'caseloads by school', 'school staffing'],
    desc: 'View caseloads and staffing organised by school.'
  },
  {
    title: 'By Person (Caseloads)',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=by-person',
    keywords: ['by person', 'provider caseload', 'staff caseload', 'caseloads by person'],
    desc: 'View caseloads and schools organised by staff member.'
  },
  {
    title: 'Additional School Hours',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=school-availability',
    keywords: ['additional hours', 'school hours', 'availability intake', 'extra hours'],
    desc: 'Manage additional school-hour requests and availability.'
  },
  {
    title: 'Provider Year Update (Tab)',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=provider-year-update',
    keywords: ['provider year update', 'year update tab', 'campaign update'],
    desc: 'Provider year-update campaign within School Management.'
  },
  {
    title: 'Staff Roster',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/users',
    keywords: ['staff', 'roster', 'users', 'members', 'employees', 'providers'],
    desc: 'All staff members and user accounts.'
  },
  {
    title: 'Provider Year Update',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/provider-year-update',
    keywords: ['provider year update', 'year update', 'campaign', 'annual update'],
    desc: 'Launch and track provider year-update campaigns.'
  },
  {
    title: 'Provider Availability',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/provider-availability',
    keywords: ['provider availability', 'availability intake', 'availability', 'provider management'],
    desc: 'Manage provider availability and intake.'
  },
  {
    title: 'Facilitator Availability',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/facilitator-availability',
    keywords: ['facilitator', 'facilitator availability', 'group facilitator'],
    desc: 'Facilitator availability and scheduling.'
  },
  {
    title: 'Gear & Inventory',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/gear-inventory',
    keywords: ['gear', 'inventory', 'equipment', 'supplies'],
    desc: 'Track agency gear, equipment, and inventory.'
  },
  {
    title: 'Staff Schedule Compare',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/staff-schedule-compare',
    keywords: ['schedule compare', 'staff compare', 'scheduling comparison'],
    desc: 'Compare staff schedules side by side.'
  },

  // Payroll & Expenses
  {
    title: 'Payroll',
    section: 'Workforce Ops › Payroll & Expenses',
    path: '/admin/payroll',
    keywords: ['payroll', 'pay', 'payroll run', 'submissions', 'pto', 'mileage', 'reimbursement'],
    desc: 'Payroll runs, pending submissions, PTO, and mileage.'
  },
  {
    title: 'Payroll Pending Submissions',
    section: 'Workforce Ops › Payroll & Expenses',
    path: '/admin/payroll/pending',
    keywords: [
      'pending submissions',
      'payroll pending',
      'event times',
      'approve pto',
      'approve time',
      'mileage approve',
      'reimbursement approve'
    ],
    desc: 'Approve PTO, event time, mileage, reimbursements, and MedCancel.'
  },
  {
    title: 'Expense / Reimbursements',
    section: 'Workforce Ops › Payroll & Expenses',
    path: '/admin/expenses',
    keywords: ['expenses', 'reimbursements', 'expense claims', 'expense report'],
    desc: 'Review expense and reimbursement submissions.'
  },

  // Billing & Revenue
  {
    title: 'Credentialing',
    section: 'Workforce Ops › Compliance & Oversight',
    path: '/admin/credentialing',
    keywords: ['credentialing', 'credentials', 'licenses', 'verification', 'certifications'],
    desc: 'Agency credentialing workflows, licenses, and verifications.'
  },
  {
    title: 'Billing Reports',
    section: 'Workforce Ops › Billing & Revenue',
    path: '/admin/billing-reports',
    keywords: ['billing reports', 'billing', 'reports', 'finance', 'export'],
    desc: 'Generate and review billing reports for payroll and finance.'
  },
  {
    title: 'Receivables',
    section: 'Workforce Ops › Billing & Revenue',
    path: '/admin/receivables',
    keywords: ['receivables', 'outstanding', 'balances', 'accounts receivable'],
    desc: 'Track outstanding receivables and balances.'
  },
  {
    title: 'Medical Billing',
    section: 'Workforce Ops › Billing & Revenue',
    path: '/admin/medical-billing',
    keywords: ['medical billing', 'medical', 'billing', 'claims'],
    desc: 'Medical billing tools and claim management.'
  },
  {
    title: 'Psychotherapy Compliance',
    section: 'Workforce Ops › Compliance & Oversight',
    path: '/admin/psychotherapy-compliance',
    keywords: ['psychotherapy', 'compliance', 'cpt', 'billing compliance', 'therapy compliance'],
    desc: 'Psychotherapy CPT compliance tracking and uploads.'
  },
  {
    title: 'Compliance Corner',
    section: 'Workforce Ops › Compliance & Oversight',
    path: '/admin/compliance-corner',
    keywords: ['compliance corner', 'compliance', 'pending clients', 'access logs', 'inquiry'],
    desc: 'Compliance inquiry tools including pending clients and access logs.'
  },
  {
    title: 'Audit Center',
    section: 'Workforce Ops › Compliance & Oversight',
    path: '/admin/audit-center',
    keywords: ['audit', 'audit center', 'activity log', 'audit log', 'audit trail'],
    desc: 'Agency-scoped audit reporting with action and category filters.'
  },
  {
    title: 'Revenue',
    section: 'Workforce Ops › Billing & Revenue',
    path: '/admin/revenue',
    keywords: ['revenue', 'income', 'financials', 'agency revenue'],
    desc: 'Agency revenue tracking and financial performance.'
  },
  {
    title: 'Executive Report',
    section: 'Workforce Ops › Compliance & Oversight',
    path: '/admin/executive-report',
    keywords: ['executive report', 'executive summary', 'financial report', 'ops report'],
    desc: 'High-level executive summary of agency financials and performance.'
  },

  // Office & Buildings
  {
    title: 'Buildings Master Grid',
    section: 'Workforce Ops › Office & Buildings',
    path: '/admin/buildings',
    keywords: ['buildings', 'offices', 'rooms', 'facilities', 'master grid'],
    desc: 'Building-centric room schedule and facilities management.'
  },
  {
    title: 'Office Requests',
    section: 'Workforce Ops › Office & Buildings',
    path: '/admin/office-requests',
    keywords: ['office requests', 'room requests', 'booking', 'space requests'],
    desc: 'Review and manage office space requests.'
  },
  {
    title: 'Office Coverage Flags',
    section: 'Workforce Ops › Office & Buildings',
    path: '/admin/office-coverage-flags',
    keywords: ['coverage flags', 'office coverage', 'flags', 'office management'],
    desc: 'Office coverage flags and management.'
  },

  // ─── School Operations Hub ────────────────────────────────────────────────────
  {
    title: 'School Operations',
    section: 'Hub',
    path: '/school-operations',
    keywords: ['hub', 'school', 'operations', 'caseloads', 'portals', 'events'],
    desc: 'Main School Operations hub — caseloads, portals, events, and requests.'
  },

  // Caseloads & Staffing
  {
    title: 'School Management',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/caseload-hub/schools-staff',
    keywords: ['school management', 'caseloads', 'coverage', 'open spots', 'year update', 'staffing'],
    desc: 'Caseloads by school or person, coverage, and open spots.'
  },
  {
    title: 'Coverage Needs',
    section: 'School Ops › Caseloads & Staffing › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=coverage-needs',
    keywords: ['coverage needs', 'coverage', 'uncovered schools', 'missing coverage', 'school coverage'],
    desc: 'Schools with unfilled coverage — navigate here to review and assign.'
  },
  {
    title: 'Provider Year Update',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/provider-year-update',
    keywords: ['provider year update', 'annual update', 'year update', 'provider campaign'],
    desc: 'Launch and track provider year-update campaigns across schools.'
  },
  {
    title: 'Collaborative Year Update',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/schools/overview?orgType=school&yearUpdate=1',
    keywords: ['collaborative year update', 'year update', 'school progress', 'scores', 'addendums', 'push update', 'school update'],
    desc: 'Track school progress, scores, and addendums. Push updates to all affiliated schools.'
  },
  {
    title: 'Approve School Requests',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/school-approvals',
    keywords: ['approve school requests', 'school approvals', 'schedule adjustments', 'additional hours', 'school requests'],
    desc: 'Review and approve schedule adjustments and extra school-hour requests.'
  },

  // Events & Calendar
  {
    title: 'School Events',
    section: 'School Ops › Events & Calendar',
    path: '/admin/caseload-hub/events',
    keywords: ['school events', 'events', 'provider assignments', 'event list', 'program events'],
    desc: 'Manage school events and provider assignments.'
  },
  {
    title: 'School Events Calendar',
    section: 'School Ops › Events & Calendar',
    path: '/admin/caseload-hub/calendar',
    keywords: ['school calendar', 'calendar', 'events calendar', 'monthly view', 'week view'],
    desc: 'Month, week, and list views of school events.'
  },
  {
    title: 'Provider Requests (Events)',
    section: 'School Ops › Events & Calendar',
    path: '/admin/caseload-hub/events?tab=provider-requests',
    keywords: ['provider requests', 'event requests', 'provider applications', 'event approvals'],
    desc: 'Pending provider applications for school events.'
  },

  // Portals & Onboarding
  {
    title: 'School Portals Overview',
    section: 'School Ops › Portals & Onboarding',
    path: '/admin/schools/overview?orgType=school',
    keywords: ['school portals', 'portals overview', 'school overview', 'metrics', 'staffing snapshot'],
    desc: 'Overview dashboard for school portals, metrics, and staffing.'
  },
  {
    title: 'All School Portals',
    section: 'School Ops › Portals & Onboarding',
    path: '/admin/school-portals',
    keywords: ['all school portals', 'school portals list', 'browse portals', 'portals'],
    desc: 'Full list of school portals for this agency.'
  },
  {
    title: 'Onboarding',
    section: 'School Ops › Portals & Onboarding',
    path: '/admin/school-onboarding',
    keywords: ['onboarding', 'school onboarding', 'onboarding admin', 'new schools', 'onboard'],
    desc: 'Manage school onboarding workflows and track onboarding status.'
  },
  {
    title: 'School Clients',
    section: 'School Ops › Clients & Guardians',
    path: '/admin/school-clients',
    keywords: ['school clients', 'clients', 'pending clients', 'roi expiration', 'client onboarding'],
    desc: 'Track pending school clients and ROI expiration.'
  },
  {
    title: 'School Guardians',
    section: 'School Ops › Clients & Guardians',
    path: '/admin/guardians?scope=school',
    keywords: ['school guardians', 'guardians', 'parents', 'school parents'],
    desc: 'Guardians linked to school-affiliated clients.'
  },
  {
    title: 'Client Readiness',
    section: 'School Ops › Clients & Guardians',
    path: '/admin/client-onboarding?scope=school',
    keywords: ['client readiness', 'client onboarding', 'new clients', 'intake checklist', 'onboarded', 'packet docs'],
    desc: 'Staff readiness checklist for school and office intakes.'
  },
  {
    title: 'Client Readiness (Provider)',
    section: 'Clients',
    path: '/provider/client-onboarding',
    keywords: ['client readiness', 'client onboarding', 'provider onboarding', 'my steps', 'first service', 'parent contact'],
    desc: 'View staff setup progress and complete provider contact, intake, and first service.'
  },
  {
    title: 'Client Exchange',
    section: 'School Ops › Clients & Guardians',
    path: '/client-exchange',
    keywords: ['client exchange', 'reassign client', 'handoff'],
    desc: 'Exchange or reassign clients between providers.'
  },
  {
    title: 'School Staff',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/caseload-hub/schools-staff',
    keywords: ['school staff', 'scheduler', 'school admin', 'portal staff'],
    desc: 'Manage school staff accounts and School Admin / Scheduler roles.'
  },
  {
    title: 'Clients',
    section: 'Workforce Ops › Clients & Guardians',
    path: '/admin/clients',
    keywords: ['clients', 'client management', 'agency clients', 'caseload'],
    desc: 'Full agency client directory and management.'
  },
  {
    title: 'Guardians',
    section: 'Workforce Ops › Clients & Guardians',
    path: '/admin/guardians',
    keywords: ['guardians', 'parents', 'family contacts'],
    desc: 'All guardian accounts and parent contacts.'
  },
  {
    title: 'Client Readiness',
    section: 'Workforce Ops › Clients & Guardians',
    path: '/admin/client-onboarding?scope=all',
    keywords: ['client readiness', 'client onboarding', 'new clients', 'intake checklist', 'onboarded', 'office intake'],
    desc: 'Staff readiness checklist for school and office intakes.'
  },
  {
    title: 'Client Exchange',
    section: 'Workforce Ops › Clients & Guardians',
    path: '/client-exchange',
    keywords: ['client exchange', 'reassign client', 'handoff'],
    desc: 'Exchange or reassign clients between providers.'
  },

  // ─── Directory ────────────────────────────────────────────────────────────────
  {
    title: 'Users',
    section: 'Directory',
    path: '/admin/users',
    keywords: ['users', 'members', 'staff', 'accounts', 'employees', 'people'],
    desc: 'All user accounts and staff members.'
  },
  {
    title: 'Guardians',
    section: 'Directory',
    path: '/admin/guardians',
    keywords: ['guardians', 'parents', 'family', 'contacts'],
    desc: 'Guardian and parent contact management.'
  },
  {
    title: 'Client Management',
    section: 'Directory › Clients',
    path: '/admin/clients',
    keywords: ['clients', 'client management', 'client list', 'caseload clients'],
    desc: 'Full client management and caseload assignment.'
  },
  {
    title: 'Referral Directory',
    section: 'Directory',
    path: '/admin/referral-directory',
    keywords: ['referral', 'referral directory', 'provider directory', 'find providers'],
    desc: 'Referral directory for providers and services.'
  },
  {
    title: 'Provider Booking Interface',
    section: 'Directory',
    path: '/admin/find-providers',
    keywords: ['find providers', 'provider booking', 'book provider', 'provider search'],
    desc: 'Search and book available providers.'
  },
  {
    title: 'Program Overview',
    section: 'Directory',
    path: '/admin/schools/overview?orgType=program',
    keywords: ['program overview', 'programs', 'program staffing', 'overview'],
    desc: 'Overview of programs and staffing metrics.'
  },

  // ─── People Ops ───────────────────────────────────────────────────────────────
  {
    title: 'Documents',
    section: 'People Ops',
    path: '/admin/documents',
    keywords: ['documents', 'docs', 'files', 'sign documents', 'document management'],
    desc: 'Agency documents — view, sign, and manage.'
  },
  {
    title: 'Applicants',
    section: 'People Ops › Hiring',
    path: '/admin/hiring',
    keywords: ['applicants', 'hiring', 'applications', 'candidates', 'job applications'],
    desc: 'Hiring pipeline and applicant management.'
  },
  {
    title: 'Pre-Hire',
    section: 'People Ops › Hiring',
    path: '/admin/pre-hire',
    keywords: ['pre-hire', 'prehire', 'onboarding tasks', 'new hire', 'pre hire checklist'],
    desc: 'Pre-hire checklists and onboarding tasks.'
  },
  {
    title: 'Careers Page',
    section: 'People Ops › Hiring',
    path: '/admin/careers',
    keywords: ['careers', 'career page', 'job listings', 'job postings', 'open positions'],
    desc: 'Manage the agency careers page and job postings.'
  },
  {
    title: 'Training Modules',
    section: 'People Ops',
    path: '/admin/modules',
    keywords: ['training', 'modules', 'courses', 'training modules', 'course builder', 'learning'],
    desc: 'Build and manage training courses and modules.'
  },
  {
    title: 'Progress (Training)',
    section: 'People Ops',
    path: '/admin/agency-progress',
    keywords: ['progress', 'training progress', 'completion', 'staff progress', 'learning progress'],
    desc: 'Track staff training completion and progress.'
  },
  {
    title: 'My Learning',
    section: 'People Ops',
    path: '/my-learning',
    keywords: ['my learning', 'learning', 'on demand', 'online training'],
    desc: 'On-demand learning resources for staff.'
  },

  // ─── Management ───────────────────────────────────────────────────────────────
  {
    title: 'Settings',
    section: 'Management',
    path: '/admin/settings',
    keywords: ['settings', 'agency settings', 'configuration', 'preferences', 'admin settings'],
    desc: 'Agency configuration and admin settings.'
  },
  {
    title: 'Budget Management',
    section: 'Management',
    path: '/admin/budget-management',
    keywords: ['budget', 'budget management', 'financial management', 'agency budget'],
    desc: 'Agency budget tracking and management.'
  },
  {
    title: 'Learning Billing',
    section: 'Management',
    path: '/admin/learning-billing',
    keywords: ['learning billing', 'billing', 'training billing', 'course billing'],
    desc: 'Billing management for learning and training modules.'
  },
  {
    title: 'Digital Forms',
    section: 'Management',
    path: '/admin/digital-forms',
    keywords: ['digital forms', 'forms', 'electronic forms', 'online forms'],
    desc: 'Digital form management.'
  },
  {
    title: 'Master School Form',
    section: 'School Operations',
    path: '/admin/master-school-form',
    keywords: [
      'master school form',
      'school digital form',
      'school intake master',
      'school questionnaire',
      'documents and forms'
    ],
    desc: 'Agency-wide school referral questionnaire that all school links inherit.'
  },
  {
    title: 'School Referral Hub',
    section: 'School Operations',
    path: '/admin/school-referral-hub',
    keywords: ['school referral hub', 'printable packet', 'school links', 'documents and forms'],
    desc: 'Printable packet editor and per-school shareable digital/printable links.'
  },
  {
    title: 'Master Office Digital Form',
    section: 'Clients & Guardians',
    path: '/admin/master-office-form',
    keywords: ['master office form', 'office intake', 'in-depth intake', 'join packet', 'documents and forms'],
    desc: 'Agency office digital intake master used by Join In-Depth Intake Packet.'
  },
  {
    title: 'Master Office Paper',
    section: 'Clients & Guardians',
    path: '/admin/master-office-paper',
    keywords: ['master office paper', 'printable office packet', 'in-depth intake packet', 'documents and forms'],
    desc: 'Editable branded printable office intake packet for staff downloads.'
  },
  {
    title: 'Master Digital Tutoring',
    section: 'Clients & Guardians',
    path: '/admin/master-channel-form/tutoring',
    keywords: ['master digital tutoring', 'tutoring intake', 'framed master'],
    desc: 'Framed master digital form channel for tutoring (coming online).'
  },
  {
    title: 'Master Digital Consulting',
    section: 'Clients & Guardians',
    path: '/admin/master-channel-form/consulting',
    keywords: ['master digital consulting', 'consulting intake', 'framed master'],
    desc: 'Framed master digital form channel for consulting (coming online).'
  },
  {
    title: 'Master Digital Coaching',
    section: 'Clients & Guardians',
    path: '/admin/master-channel-form/coaching',
    keywords: ['master digital coaching', 'coaching intake', 'framed master'],
    desc: 'Framed master digital form channel for coaching (coming online).'
  },
  {
    title: 'Agency Admin Dashboard',
    section: 'Management',
    path: '/admin/dashboard',
    keywords: ['dashboard', 'admin dashboard', 'overview', 'agency dashboard'],
    desc: 'Agency admin overview and dashboard.'
  },
  {
    title: 'Superadmin Platform Dashboard',
    section: 'Management',
    path: '/admin/superadmin',
    keywords: ['superadmin', 'platform dashboard', 'super admin', 'platform admin'],
    desc: 'Platform-level superadmin dashboard.'
  },

  // ─── Communications / Engagement ─────────────────────────────────────────────
  {
    title: 'Notifications',
    section: 'Notifications',
    path: '/admin/notifications',
    keywords: ['notifications', 'alerts', 'announcements'],
    desc: 'View and manage notifications.'
  },
  {
    title: 'Messages',
    section: 'Communications',
    path: '/messages',
    keywords: ['messages', 'messaging', 'inbox', 'direct messages'],
    desc: 'Direct messages and communications.'
  },

  // ─── School Portal Pages ──────────────────────────────────────────────────────
  {
    title: 'School Portal',
    section: 'School Portal',
    path: '/school',
    keywords: ['school portal', 'school view', 'portal', 'school page'],
    desc: 'School-facing portal view.'
  },
];

/**
 * Fuzzy-search the index.
 * Returns items sorted by relevance (title match first, then keyword/desc match).
 *
 * @param {string} query - Search string
 * @param {{ orgSlug?: string | null, surface?: object | null, limit?: number }} opts
 * @returns {{ title: string, section: string, path: string, desc: string, fullPath: string }[]}
 */
export function searchNav(query, { orgSlug = null, surface = null, limit = 12 } = {}) {
  const q = (query || '').toLowerCase().trim();
  if (!q || q.length < 2) return [];

  const terms = q.split(/\s+/).filter(Boolean);

  const scored = NAV_SEARCH_INDEX
    .map((item) => {
      const titleLc = item.title.toLowerCase();
      const sectionLc = item.section.toLowerCase();
      const descLc = (item.desc || '').toLowerCase();
      const kwsLc = (item.keywords || []).map((k) => k.toLowerCase());
      const allText = [titleLc, sectionLc, descLc, ...kwsLc].join(' ');

      let score = 0;

      for (const term of terms) {
        if (titleLc.startsWith(term)) { score += 100; continue; }
        if (titleLc.includes(term)) { score += 60; continue; }
        if (kwsLc.some((k) => k.includes(term))) { score += 40; continue; }
        if (sectionLc.includes(term)) { score += 20; continue; }
        if (descLc.includes(term)) { score += 15; continue; }
        if (allText.includes(term)) { score += 5; continue; }
      }

      if (!score) return null;
      score += surfaceBoostForNavItem(item, surface);

      let fullPath;
      if (item.publicPath && orgSlug) {
        if (item.publicPath === 'careers') fullPath = `/careers/${orgSlug}`;
        else if (item.publicPath === 'join') fullPath = `/join/${orgSlug}`;
        else if (item.publicPath === 'office-intake') fullPath = `/office-intake/${orgSlug}`;
        else fullPath = item.path;
      } else {
        const prefix = orgSlug ? `/${orgSlug}` : '';
        fullPath = `${prefix}${item.path}`;
      }

      return { ...item, score, fullPath };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

/**
 * Popular destinations for the current surface (empty-query suggestions).
 */
export function listNavForSurface(surface, { orgSlug = null, limit = 10 } = {}) {
  if (!surface) return [];
  const scored = NAV_SEARCH_INDEX
    .map((item) => {
      const boost = surfaceBoostForNavItem(item, surface);
      if (!boost) return null;
      let fullPath;
      if (item.publicPath && orgSlug) {
        if (item.publicPath === 'careers') fullPath = `/careers/${orgSlug}`;
        else if (item.publicPath === 'join') fullPath = `/join/${orgSlug}`;
        else if (item.publicPath === 'office-intake') fullPath = `/office-intake/${orgSlug}`;
        else fullPath = item.path;
      } else {
        const prefix = orgSlug ? `/${orgSlug}` : '';
        fullPath = `${prefix}${item.path}`;
      }
      return { ...item, score: boost, fullPath };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
