/**
 * Full app page index (paths + labels + keywords).
 * Vue-free — shared by Command Palette, Quick Nav, and Ask Assistant.
 * Keep descriptions concrete; paths are unscoped (no org slug prefix).
 */

export const APP_PAGES = [
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
    title: 'Provider Fall Update (Tab)',
    section: 'Workforce Ops › Staff & Scheduling › School Management',
    path: '/admin/caseload-hub/schools-staff?tab=provider-year-update',
    keywords: ['provider fall update', 'fall update tab', 'campaign update', 'year update'],
    desc: 'Provider year-update campaign within School Management.'
  },
  {
    title: 'Users',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/users',
    keywords: ['users', 'members', 'staff', 'roster', 'accounts', 'employees', 'providers', 'people'],
    desc: 'All user accounts and staff members.'
  },
  {
    title: 'Announcements',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/announcements',
    keywords: ['announcements', 'splash', 'splashes', 'banner', 'birthday', 'anniversary', 'quick announcement'],
    desc: 'Agency splashes, banners, engagement, and auto birthday / anniversary queue.'
  },
  {
    title: 'Provider Fall Update',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/provider-year-update',
    keywords: ['provider fall update', 'fall update', 'campaign', 'annual update', 'year update'],
    desc: 'Launch and track provider year-update campaigns.'
  },
  {
    title: 'Provider Update',
    section: 'Workforce Ops › Staff & Scheduling',
    path: '/admin/provider-update',
    keywords: ['provider update', 'handbook', 'people ops', 'workplace handbook', 'staff update'],
    desc: 'Modular Provider Update pushes, handbook, export, and payroll submit.'
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
    title: 'Gear, Equipment & Materials',
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
    keywords: ['credentialing', 'credentialling', 'credentials', 'licenses', 'verification', 'certifications', 'npi'],
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
    keywords: ['school', 'caseload', 'coverage', 'portal', 'events', 'staffing', 'outreach', 'reports'],
    desc: 'Main School Operations hub — caseloads, portals, events, reports, and requests.'
  },

  // School Reports
  {
    title: 'School Reports',
    section: 'School Ops › School Reports',
    path: '/admin/school-reports',
    keywords: ['school reports', 'caseload reports', 'provider day', 'unassigned clients', 'district counts', 'slots', 'sessions seen'],
    desc: 'Year-scoped school reports: assignment buckets, students seen, sessions, and provider slots.'
  },
  {
    title: 'Unfinished Digital Forms',
    section: 'School Ops › School Reports',
    path: '/admin/unfinished-digital-forms',
    keywords: [
      'unfinished digital forms',
      'enrollment packet',
      'incomplete intake',
      'reminder sequence',
      'draft expiry',
      'office enrollment'
    ],
    desc: 'Active unfinished school and office enrollment packets with reminder timeline and CSV export.'
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
    title: 'Provider Fall Update',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/provider-year-update',
    keywords: ['provider fall update', 'annual update', 'fall update', 'provider campaign', 'year update'],
    desc: 'Launch and track provider year-update campaigns across schools.'
  },
  {
    title: 'Provider Update',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/provider-update',
    keywords: ['provider update', 'handbook', 'workplace handbook', 'people ops'],
    desc: 'Modular Provider Update pushes with section toggles and payroll submit.'
  },
  {
    title: 'Collaborative Year Update',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/schools/overview?orgType=school&yearUpdate=1',
    keywords: ['collaborative year update', 'year update', 'school progress', 'scores', 'addendums', 'push update', 'school update'],
    desc: 'Track school progress, scores, and addendums. Push updates to all affiliated schools.'
  },
  {
    title: 'Materials Requests',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/materials-requests',
    keywords: [
      'materials requests',
      'materials',
      'packets',
      'paper packets',
      'trifold',
      'carts',
      'shirts',
      'delivery',
      'fulfillment',
      'inventory',
      'onboarding materials'
    ],
    desc: 'See onboarding, collaborative update, and provider fall-update materials in one place. Assign, check off, and issue carts/shirts/bags from inventory.'
  },
  {
    title: 'Approve School Requests',
    section: 'School Ops › Caseloads & Staffing',
    path: '/admin/school-approvals',
    keywords: ['approve school requests', 'school approvals', 'schedule adjustments', 'additional hours', 'school requests'],
    desc: 'Review and approve schedule adjustments and extra school-hour requests.'
  },

  // Events & Outreach
  {
    title: 'School Events',
    section: 'School Ops › Events & Outreach',
    path: '/admin/caseload-hub/events',
    keywords: ['school events', 'events', 'provider assignments', 'event list', 'program events'],
    desc: 'Manage school events and provider assignments.'
  },
  {
    title: 'School Events Calendar',
    section: 'School Ops › Events & Outreach',
    path: '/admin/caseload-hub/calendar',
    keywords: ['school calendar', 'calendar', 'events calendar', 'monthly view', 'week view'],
    desc: 'Month, week, and list views of school events.'
  },
  {
    title: 'Outreach Hub',
    section: 'School Ops › Events & Outreach',
    path: '/admin/outreach-hub',
    keywords: ['outreach', 'visits', 'school contacts', 'partnership', 'trips', 'timeline'],
    desc: 'Track school outreach contacts, visits, and partnership stages.'
  },
  {
    title: 'Provider Requests (Events)',
    section: 'School Ops › Events & Outreach',
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
    title: 'Client Action Needed',
    section: 'School Ops › Clients & Guardians',
    path: '/admin/client-onboarding?scope=school',
    keywords: ['client action needed', 'client readiness', 'client onboarding', 'new clients', 'fall confirmation', 'intake checklist'],
    desc: 'Clients who still need a next step — fall confirmation, new-client intake, or agency clearance.'
  },
  {
    title: 'Client Action Needed (Provider)',
    section: 'Clients',
    path: '/provider/client-onboarding',
    keywords: ['client action needed', 'client readiness', 'client onboarding', 'provider onboarding', 'my steps', 'fall confirmation'],
    desc: 'Fall confirmation, new-client actions, and remaining provider next steps.'
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
    title: 'Client Action Needed',
    section: 'Workforce Ops › Clients & Guardians',
    path: '/admin/client-onboarding?scope=all',
    keywords: ['client action needed', 'client readiness', 'client onboarding', 'fall confirmation', 'office intake'],
    desc: 'Clients who still need a next step — fall confirmation, new-client intake, or agency clearance.'
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

  // ─── People Operations Hub ────────────────────────────────────────────────────
  {
    title: 'People Operations',
    section: 'Hub',
    path: '/people-operations',
    keywords: ['people ops', 'people operations', 'hiring hub', 'hr hub', 'onboarding hub'],
    desc: 'Main People Operations hub — hiring, careers, onboarding, and development.'
  },
  {
    title: 'Documents',
    section: 'People Ops › Performance & Development',
    path: '/admin/documents',
    keywords: ['documents', 'docs', 'files', 'sign documents', 'document management'],
    desc: 'Agency documents — view, sign, and manage.'
  },
  {
    title: 'Tools and Resources',
    section: 'Directory',
    path: '/library',
    keywords: [
      'library',
      'resources',
      'google docs',
      'shared files',
      'templates',
      'guides',
      'care documents',
      'handouts'
    ],
    desc: 'Organization resource library — files, links, and Google Docs.'
  },
  {
    title: 'Library Settings',
    section: 'Admin',
    path: '/admin/library-settings',
    keywords: ['library settings', 'library categories', 'archive library'],
    desc: 'Manage Library categories and archived resources.'
  },
  {
    title: 'Contract Generator',
    section: 'People Ops › Hiring',
    path: '/admin/contracts',
    keywords: ['contract', 'employment agreement', 'clauses', 'pay table', 'offer letter', 'contract generator'],
    desc: 'Build and assign employment contracts from editable clauses and pay levels.'
  },
  {
    title: 'Hiring Dashboard',
    section: 'People Ops › Hiring',
    path: '/admin/hiring',
    keywords: ['hiring', 'dashboard', 'pipeline', 'hiring overview', 'recruiting', 'hiring dashboard', 'po dashboard'],
    desc: 'Hiring overview with pipeline stats and upcoming interviews.'
  },
  {
    title: 'Applications',
    section: 'People Ops › Hiring',
    path: '/admin/hiring/applicants',
    keywords: ['applications', 'applicants', 'hiring', 'candidates', 'job applications', 'reapply'],
    desc: 'Hiring pipeline and job application management.'
  },
  {
    title: 'Applicants (Users)',
    section: 'People Ops › Users',
    path: '/admin/users?persona=applicants',
    keywords: ['applicants', 'prospective', 'applicant users', 'candidate users', 'users applicants'],
    desc: 'Find applicant accounts in the Users directory.'
  },
  {
    title: 'Interview Hub',
    section: 'People Ops › Hiring',
    path: '/admin/interview-hub',
    keywords: ['interview hub', 'interviews', 'hiring interviews', 'interview scheduling'],
    desc: 'Coordinate interviews and capture feedback.'
  },
  {
    title: 'Pre-Hire',
    section: 'People Ops › Hiring',
    path: '/admin/pre-hire',
    keywords: ['pre-hire', 'prehire', 'onboarding tasks', 'new hire', 'pre hire checklist'],
    desc: 'Pre-hire checklists and onboarding tasks.'
  },
  {
    title: 'Public careers page',
    section: 'People Ops › Careers',
    path: '/careers',
    keywords: ['public careers', 'careers page', 'live careers', 'careers site', 'open roles public'],
    desc: 'View the public careers page candidates see.'
  },
  {
    title: 'Career page settings',
    section: 'People Ops › Careers',
    path: '/admin/careers/page',
    keywords: ['careers', 'career page', 'careers settings', 'careers branding', 'page settings'],
    desc: 'Configure the public careers page branding and content.'
  },
  {
    title: 'Job postings',
    section: 'People Ops › Careers',
    path: '/admin/careers/jobs',
    keywords: ['job postings', 'job listings', 'open positions', 'careers jobs', 'job descriptions'],
    desc: 'Create and manage job postings on the careers page.'
  },
  {
    title: 'Onboarding',
    section: 'People Ops › Onboarding',
    path: '/admin/onboarding',
    keywords: ['onboarding', 'new hire onboarding', 'send invite', 'portal link', 'onboarding invite'],
    desc: 'Track onboarding progress and resend portal / login invites.'
  },
  {
    title: 'Engagement & Retention',
    section: 'People Ops › Employee Relations',
    path: '/admin/employee-relations',
    keywords: ['employee relations', 'engagement', 'retention', 'service milestones', 'anniversary', 'gifts'],
    desc: 'Service anniversary milestones, gifts owed, and acknowledgements.'
  },
  {
    title: 'Training Modules',
    section: 'People Ops › Performance & Development',
    path: '/admin/modules',
    keywords: ['training', 'modules', 'courses', 'training modules', 'course builder', 'learning'],
    desc: 'Build and manage training courses and modules.'
  },
  {
    title: 'Progress (Training)',
    section: 'People Ops › Performance & Development',
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
    title: 'Package Catalog',
    section: 'Management',
    path: '/admin/package-catalog',
    keywords: ['packages', 'package catalog', 'session packages', 'prepaid', 'tutoring packages', 'coaching packages'],
    desc: 'Unified tenant and program package catalog with Stripe checkout.'
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
    title: 'School Staff',
    section: 'School Ops › School Staff',
    path: '/admin/users?persona=school_staff',
    keywords: ['school staff', 'school staff users', 'staff directory', 'user management'],
    desc: 'Users directory scoped to school staff only.'
  },
  {
    title: 'School Staff Accounts',
    section: 'School Ops › School Staff',
    path: '/admin/school-staff-accounts',
    keywords: ['school staff accounts', 'temporary password', 'never logged in', 'bulk password', 'login setup'],
    desc: 'Bulk school staff account management — filter never-logged-in users and set temporary passwords.'
  },
  {
    title: 'Master Counseling Digital Form',
    section: 'Clients & Guardians',
    path: '/admin/master-office-form',
    keywords: ['master counseling form', 'master office form', 'office intake', 'client enrollment', 'join packet', 'documents and forms'],
    desc: 'Counseling digital intake master used by Join Client Enrollment Packet.'
  },
  {
    title: 'Master Counseling Paper',
    section: 'Clients & Guardians',
    path: '/admin/master-office-paper',
    keywords: ['master counseling paper', 'master office paper', 'printable office packet', 'client enrollment packet', 'documents and forms'],
    desc: 'Editable branded printable counseling intake packet for staff downloads.'
  },
  {
    title: 'Master Tutoring',
    section: 'Clients & Guardians',
    path: '/admin/master-channel-form/tutoring',
    keywords: ['master tutoring', 'tutoring intake', 'assessment', 'evaluation', 'nlu'],
    desc: 'Tutoring intake, assessment, and evaluation master (currently same questions as counseling).'
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
  {
    title: 'Email Settings',
    section: 'Communications',
    path: '/admin/email-settings',
    keywords: ['email settings', 'auto email', 'automated email', 'sender identity', 'from address', 'notifications@', 'fallback', 'forgot password', 'delivery settings'],
    desc: 'Tenant automated emails — From identity, triggers, and approval vs. send.'
  },
  {
    title: 'Communications Center',
    section: 'Communications',
    path: '/admin/communications',
    keywords: ['communications center', 'automation', 'pending approval', 'quality issues', 'admin update', 'newsletter'],
    desc: 'Home, messages, support, automation, Admin Update, and school alerts.'
  },

  // ─── School Portal Pages ──────────────────────────────────────────────────────
  {
    title: 'School Portal',
    section: 'School Portal',
    path: '/school',
    keywords: ['school portal', 'school view', 'portal', 'school page'],
    desc: 'School-facing portal view.'
  },
  {
    title: 'School Portal Settings',
    section: 'School Portal',
    path: '/school?sp=settings',
    keywords: ['school portal settings', 'group email', 'subscription', 'no email', 'digest', 'notification settings', 'school staff settings'],
    desc: 'Change school group email subscription and portal notification settings.'
  },
];
