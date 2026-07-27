/**
 * In-settings search jump targets (SettingsModal + hub card filter).
 * Pure data + helpers — keep Vue-free.
 *
 * Covers:
 * 1) Standalone settings screens (role-filtered catalog items)
 * 2) Company Profile tabs + inner sections still mid-migration out of AgencyManagement
 *
 * Prefer dedicated destinations when both a standalone screen and a Company Profile
 * tab match — migration is incomplete, so both stay discoverable.
 */

/** Preferred hub/card labels when they differ from the sidebar item label. */
export const SETTINGS_DISPLAY_LABELS = {
  'platform-settings': 'Platform defaults',
  'platform-billing': 'Platform billing',
  'platform-feature-catalog': 'Feature Catalog & Pricing',
  'platform-feature-audit': 'Feature audit log',
  'platform-all-agencies': 'All organizations',
  'agency-platform': 'Tenant identity & locks',
  'audit-center': 'Audit center',
  'viewport-preview': 'Viewport preview',
  'company-profile': 'Company profile',
  'team-roles': 'Team & roles',
  'tenant-ws-org-directory': 'Organizations / Affiliations / Programs / Schools',
  'tenant-ws-global-platform': 'Platform-wide defaults',
  'booking-service-types': 'Booking & service types',
  'tenant-features': 'Features'
};

/** Short descriptions used for search + hub cards. */
export const SETTINGS_SEARCH_DESCRIPTIONS = {
  'platform-settings':
    'Feature visibility grid, school portal icons, and other settings that shape what tenants see in Company Profile.',
  'platform-billing':
    'Stripe and QuickBooks readiness for tenants that should pay the platform through your merchant account.',
  'platform-feature-catalog':
    'Set the platform default tenant and per-user monthly price for every feature, plus pro-ration rules.',
  'platform-feature-audit':
    'Every tenant- and user-level enable/disable event with actor, timestamp, and notes.',
  'platform-all-agencies':
    'Full directory of tenants and orgs: search, create agencies, jump into any company profile.',
  'audit-center': 'Review activity and access trails across the platform where enabled.',
  'viewport-preview': 'Device framing and preview defaults for portal experiences.',
  'company-profile':
    'Company setup step 1 — name, contact, address, sites, notifications, announcements, and other identity settings still managed here while we finish extracting dedicated screens.',
  'team-roles': 'Company setup step 4 — who can access which areas inside a tenant.',
  billing: 'Company setup step 5 — charges, invoices, receipts, payment methods, and billing history per tenant.',
  'tenant-features':
    'Company setup step 3 — dedicated feature matrix for enablement, pricing, and a-la-carte controls (preferred over the legacy Company Profile → Features tab).',
  'tenant-overview': 'Feature matrix, visibility overrides, billing snapshot, invoices.',
  'agency-platform': 'Slug, active status, affiliation, superadmin-managed flags.',
  'booking-service-types':
    'Company setup step 2 — which verticals this tenant sells (counseling, tutoring, coaching, consulting). Moved out of Company Profile Features.',
  'tenant-ws-org-directory': 'Organizations, affiliations, programs, and schools for this tenant.',
  'tenant-ws-global-platform': 'Platform-wide defaults that apply until a tenant overrides them.',
  'client-settings': 'Programs, paths, and client catalog for this tenant.',
  'school-settings': 'School catalog and portal links — tenant-scoped.',
  'provider-settings': 'Provider records and catalog — tenant-scoped.',
  'provider-scheduling': 'Scheduling templates and rules — tenant-scoped.',
  'availability-intake': 'Provider availability and intake.',
  'shift-programs': 'Shift programs and publishing.',
  'payroll-schedule':
    'Pay & workforce — pay schedules plus payroll policies (PTO, mileage, Med Cancel, holidays). Preferred over Company Profile → Payroll.',
  departments: 'Pay & workforce — org departments with budget management.',
  'hiring-prehire': 'Pay & workforce — hiring and pre-hire setup (dedicated; not a Company Profile tab).',
  packages: 'Onboarding packages.',
  'digital-forms': 'Intake and digital form links.',
  'challenge-management': 'Seasons and challenges — Learning or Affiliation orgs.',
  'checklist-items': 'Platform-wide checklist templates (superadmin).',
  'checklist-items-agency': 'Tenant checklist assignments.',
  'field-definitions': 'Platform-wide profile field catalog (superadmin).',
  'field-definitions-agency': 'Tenant profile field assignments.',
  'branding-config': 'Dedicated branding configuration (colors, fonts, logos). Company Profile still has Branding / Theme / Icons tabs.',
  'branding-templates': 'Email and document templates.',
  assets: 'Icons, fonts, and shared creative assets.',
  'note-aid-kb': 'Note Aid knowledge base.',
  'tenant-support': 'Organization help desk and Plot Twist HQ platform tickets.',
  communications: 'Transactional email templates.',
  'sms-numbers': 'Texting numbers — tenant-scoped.',
  'email-settings': 'SMTP and platform email defaults.',
  integrations: 'Third-party connections and API-related settings.',
  'management-team-config': 'Executive visibility for agency organizations.',
  archive: 'Soft-deleted records and restore tools.'
};

/** Extra search aliases beyond label / description / item id. */
export const SETTINGS_SEARCH_ALIASES = {
  'platform-settings': [
    'platform defaults',
    'feature visibility',
    'available agency features',
    'school portal icons',
    'company profile defaults',
    'global settings',
    'what tenants see'
  ],
  'platform-billing': ['stripe', 'quickbooks', 'merchant', 'platform stripe', 'qb'],
  'platform-feature-catalog': [
    'pricing',
    'feature pricing',
    'catalog',
    'pro-ration',
    'proration',
    'monthly price',
    'per user price'
  ],
  'platform-feature-audit': ['feature log', 'enable disable', 'feature history', 'feature audit'],
  'platform-all-agencies': [
    'all tenants',
    'agencies',
    'create agency',
    'organization directory',
    'manage agencies',
    'create tenant'
  ],
  'audit-center': ['audit log', 'activity trail', 'access trail', 'compliance', 'who did what'],
  'viewport-preview': ['device preview', 'mobile preview', 'portal preview', 'framing', 'iphone preview'],
  'company-profile': [
    'org profile',
    'organization profile',
    'company settings',
    'agency profile',
    'agency settings',
    'tenant profile',
    'company setup',
    'setup step 1',
    'onboard company',
    'new company'
  ],
  'team-roles': [
    'roles',
    'permissions',
    'access control',
    'admins',
    'team',
    'assign admin',
    'assign support',
    'setup step 4'
  ],
  billing: [
    'invoices',
    'charges',
    'receipts',
    'payment methods',
    'stripe billing',
    'payment history',
    'setup step 5'
  ],
  'tenant-features': [
    'feature matrix',
    'feature flags',
    'a la carte',
    'enable features',
    'dedicated features',
    'feature enablement',
    'tenant features',
    'setup step 3',
    'company setup features'
  ],
  'tenant-overview': ['overview', 'tenant hub', 'feature matrix', 'visibility overrides', 'tenant snapshot'],
  'agency-platform': ['tenant identity', 'slug', 'locks', 'affiliation', 'active status', 'identity locks'],
  'booking-service-types': [
    'booking',
    'service types',
    'verticals',
    'counseling',
    'tutoring',
    'coaching',
    'consulting',
    'booking types',
    'session types',
    'setup step 2',
    'what we sell'
  ],
  'client-settings': ['clients', 'client catalog', 'programs', 'paths', 'client paths'],
  'school-settings': ['schools', 'school catalog', 'school portal', 'school directory'],
  'provider-settings': ['providers', 'provider catalog', 'clinicians', 'therapists'],
  'provider-scheduling': ['scheduling', 'schedule templates', 'provider schedule', 'booking templates'],
  'availability-intake': ['availability', 'intake', 'provider management', 'availability intake'],
  'shift-programs': ['shifts', 'shift publishing', 'shift program'],
  'payroll-schedule': [
    'pay schedule',
    'pay periods',
    'payroll schedule',
    'pay calendar',
    'pay and workforce',
    'payroll policies',
    'pto',
    'mileage',
    'med cancel',
    'holidays'
  ],
  departments: ['department', 'budget', 'org chart', 'budget management', 'pay and workforce'],
  'hiring-prehire': [
    'hiring',
    'pre-hire',
    'prehire',
    'candidates',
    'onboarding hiring',
    'hiring settings',
    'applicant',
    'pay and workforce'
  ],
  packages: ['onboarding packages', 'packet', 'onboarding packet'],
  'digital-forms': ['forms', 'intake links', 'digital forms', 'form links'],
  'challenge-management': ['challenges', 'seasons', 'weekly challenges', 'learning challenges'],
  'checklist-items': ['checklist', 'checklist templates', 'momentum', 'platform checklist'],
  'checklist-items-agency': ['checklist', 'tenant checklist', 'agency checklist'],
  'field-definitions': ['profile fields', 'user info fields', 'field catalog', 'platform fields'],
  'field-definitions-agency': ['profile fields', 'tenant fields', 'agency fields'],
  'branding-config': ['brand config', 'branding configuration', 'logo colors', 'brand settings'],
  'branding-templates': ['templates', 'email templates', 'document templates', 'branding templates'],
  assets: ['creative assets', 'shared assets', 'asset library', 'icon library'],
  'note-aid-kb': ['note aid', 'noteaid', 'knowledge base', 'kb', 'ai notes'],
  'tenant-support': ['support', 'help desk', 'tickets', 'hq support', 'plot twist support'],
  communications: ['email templates', 'transactional email', 'message templates'],
  'sms-numbers': ['sms', 'texting', 'text numbers', 'phone numbers', 'twilio'],
  'email-settings': ['smtp', 'mail settings', 'outgoing email', 'email server'],
  integrations: ['api', 'third party', 'connections', 'webhooks', 'zapier'],
  'management-team-config': ['management team', 'executives', 'leadership', 'exec visibility'],
  archive: ['deleted', 'restore', 'soft delete', 'trash', 'archived records'],
  'tenant-ws-org-directory': [
    'organizations',
    'affiliations',
    'programs',
    'schools directory',
    'org structure',
    'affiliated orgs'
  ],
  'tenant-ws-global-platform': ['platform defaults', 'global platform', 'platform-wide']
};

/**
 * Nested Company Profile targets (AgencyManagement tabs + important inner sections).
 * Deep-link via agencyTab on company-profile.
 * kind: 'tab' | 'section'
 * superadminOnly: hide for non-superadmin search
 * prefersStandaloneId: when set, standalone screen should outrank this for overlapping queries
 */
export const COMPANY_PROFILE_SEARCH_TARGETS = [
  // —— Tabs ——
  {
    id: 'cp-tab-general',
    itemId: 'company-profile',
    agencyTab: 'general',
    kind: 'tab',
    label: 'General',
    pathLabel: 'Company profile → General',
    description: 'Org type, name, slug, intake retention, session timeout, feedback prompt, activate/deactivate.',
    aliases: [
      'general tab',
      'org type',
      'organization type',
      'slug',
      'portal url',
      'intake retention',
      'data retention',
      'session timeout',
      'timedown',
      'feedback prompt',
      'review prompt',
      'activate',
      'deactivate',
      'archive organization'
    ]
  },
  {
    id: 'cp-tab-branding',
    itemId: 'company-profile',
    agencyTab: 'branding',
    kind: 'tab',
    prefersStandaloneId: 'branding-config',
    label: 'Branding',
    pathLabel: 'Company profile → Branding',
    description: 'Portal brand source, logo, colors, extended colors, portal configuration (still in Company Profile).',
    aliases: [
      'branding tab',
      'logo',
      'brand colors',
      'extended colors',
      'portal brand',
      'portal configuration',
      'partner link'
    ]
  },
  {
    id: 'cp-tab-features',
    itemId: 'company-profile',
    agencyTab: 'features',
    kind: 'tab',
    prefersStandaloneId: 'tenant-features',
    label: 'Features (legacy tab)',
    pathLabel: 'Company profile → Features',
    description:
      'Legacy feature-flag toggles still in Company Profile. Prefer the dedicated Features screen when possible.',
    aliases: [
      'features tab',
      'legacy features',
      'feature toggles',
      'portal variant',
      'feature blueprint',
      'workspace provisioning',
      'google sso',
      'guardian waivers',
      'medical billing',
      'school portals enabled',
      'kudos enabled',
      'note aid enabled',
      'payroll enabled',
      'budget management',
      'momentum list',
      'games platform'
    ]
  },
  {
    id: 'cp-tab-contact',
    itemId: 'company-profile',
    agencyTab: 'contact',
    kind: 'tab',
    label: 'Contact',
    pathLabel: 'Company profile → Contact',
    description: 'Onboarding, notifications, and sender email contacts for the organization.',
    aliases: ['contact tab', 'contact email', 'sender email', 'onboarding email', 'primary contact']
  },
  {
    id: 'cp-tab-address',
    itemId: 'company-profile',
    agencyTab: 'address',
    kind: 'tab',
    label: 'Address',
    pathLabel: 'Company profile → Address',
    description: 'Street, city, state, and postal address for the organization.',
    aliases: ['address tab', 'street', 'city', 'zip', 'postal', 'mailing address', 'org address']
  },
  {
    id: 'cp-tab-sites',
    itemId: 'company-profile',
    agencyTab: 'sites',
    kind: 'tab',
    label: 'Sites',
    pathLabel: 'Company profile → Sites',
    description: 'Office/site locations and mileage rate tiers used for school mileage.',
    aliases: ['sites tab', 'offices', 'office locations', 'site addresses', 'building sites', 'locations']
  },
  {
    id: 'cp-tab-notifications',
    itemId: 'company-profile',
    agencyTab: 'notifications',
    kind: 'tab',
    label: 'Notifications',
    pathLabel: 'Company profile → Notifications',
    description:
      'Notification sender email, ticketing notifications, tier system, agency defaults, program reminders, triggers.',
    aliases: [
      'notifications tab',
      'notification defaults',
      'ticketing notifications',
      'program reminders',
      'notification triggers',
      'agency notifications'
    ]
  },
  {
    id: 'cp-tab-announcements',
    itemId: 'company-profile',
    agencyTab: 'announcements',
    kind: 'tab',
    label: 'Announcements',
    pathLabel: 'Company profile → Announcements',
    description: 'Agency announcements and scheduled announcements.',
    aliases: ['announcements tab', 'agency announcements', 'scheduled announcements', 'bulletin']
  },
  {
    id: 'cp-tab-company-events',
    itemId: 'company-profile',
    agencyTab: 'company_events',
    kind: 'tab',
    label: 'Company Events',
    pathLabel: 'Company profile → Company Events',
    description: 'Company-wide events managed for this agency.',
    aliases: ['company events', 'events tab', 'org events', 'agency events']
  },
  {
    id: 'cp-tab-social-feeds',
    itemId: 'company-profile',
    agencyTab: 'social_feeds',
    kind: 'tab',
    superadminOnly: true,
    label: 'Social feeds',
    pathLabel: 'Company profile → Social feeds',
    description: 'Platform-managed social feed configuration for the agency.',
    aliases: ['social feeds', 'social feed', 'feed admin', 'instagram feed']
  },
  {
    id: 'cp-tab-theme',
    itemId: 'company-profile',
    agencyTab: 'theme',
    kind: 'tab',
    prefersStandaloneId: 'branding-config',
    label: 'Theme',
    pathLabel: 'Company profile → Theme',
    description: 'Font, login background, public website URL, and active theme flags.',
    aliases: ['theme tab', 'login background', 'login bg', 'public website', 'theme font']
  },
  {
    id: 'cp-tab-terminology',
    itemId: 'company-profile',
    agencyTab: 'terminology',
    kind: 'tab',
    label: 'Terminology',
    pathLabel: 'Company profile → Terminology',
    description: 'Agency terminology overrides and custom email template parameters.',
    aliases: [
      'terminology tab',
      'terminology overrides',
      'wording',
      'labels override',
      'custom email parameters',
      'template parameters'
    ]
  },
  {
    id: 'cp-tab-icons',
    itemId: 'company-profile',
    agencyTab: 'icons',
    kind: 'tab',
    prefersStandaloneId: 'assets',
    label: 'Icons',
    pathLabel: 'Company profile → Icons',
    description:
      'Icon templates, organization icon, chat, default icons, dashboard action icons, My Dashboard cards, school portal cards, notification icons.',
    aliases: [
      'icons tab',
      'icon templates',
      'dashboard icons',
      'school portal icons',
      'notification icons',
      'action icons',
      'my dashboard card icons',
      'chat icon'
    ]
  },
  {
    id: 'cp-tab-kudos',
    itemId: 'company-profile',
    agencyTab: 'kudos',
    kind: 'tab',
    label: 'Kudos',
    pathLabel: 'Company profile → Kudos',
    description: 'Kudos tiers and recognition configuration for the agency.',
    aliases: ['kudos tab', 'kudos tiers', 'recognition', 'shoutouts', 'appreciation']
  },
  {
    id: 'cp-tab-payroll',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'tab',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Payroll policies (legacy tab)',
    pathLabel: 'Company profile → Payroll',
    description:
      'Legacy copy of Med Cancel, mileage, PTO, holidays, and related policies. Prefer Tenant home → Pay & workforce → Payroll.',
    aliases: [
      'payroll tab',
      'payroll policies',
      'agency payroll',
      'pay policies',
      'legacy payroll'
    ]
  },
  {
    id: 'cp-tab-school-providers',
    itemId: 'company-profile',
    agencyTab: 'school_providers',
    kind: 'tab',
    label: 'School Providers',
    pathLabel: 'Company profile → Providers',
    description: 'Affiliated providers for a school organization.',
    aliases: ['school providers', 'affiliated providers', 'school provider tab']
  },
  {
    id: 'cp-tab-school-staff',
    itemId: 'company-profile',
    agencyTab: 'school_staff',
    kind: 'tab',
    label: 'School Staff',
    pathLabel: 'Company profile → School Staff',
    description: 'School staff accounts and contacts.',
    aliases: ['school staff', 'school staff accounts', 'school contacts']
  },

  // —— Important inner sections (still only in Company Profile) ——
  {
    id: 'cp-sec-session-timeout',
    itemId: 'company-profile',
    agencyTab: 'general',
    kind: 'section',
    label: 'Session timeout (Timedown)',
    pathLabel: 'Company profile → General',
    description: 'Idle session / timedown settings for the organization.',
    aliases: ['session timeout', 'timedown', 'idle timeout', 'auto logout']
  },
  {
    id: 'cp-sec-intake-retention',
    itemId: 'company-profile',
    agencyTab: 'general',
    kind: 'section',
    label: 'Intake data retention',
    pathLabel: 'Company profile → General',
    description: 'How long intake data is retained.',
    aliases: ['intake retention', 'data retention', 'retention policy']
  },
  {
    id: 'cp-sec-mileage-rates',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Mileage rates (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy mileage tiers — prefer Pay & workforce → Payroll.',
    aliases: ['mileage', 'mileage rates', 'per mile', 'school mileage', 'tier 1', 'tier 2', 'tier 3']
  },
  {
    id: 'cp-sec-sites-mileage',
    itemId: 'company-profile',
    agencyTab: 'sites',
    kind: 'section',
    label: 'Sites mileage rates',
    pathLabel: 'Company profile → Sites',
    description: 'Mileage tiers managed alongside office/site locations.',
    aliases: ['site mileage', 'office mileage']
  },
  {
    id: 'cp-sec-med-cancel',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Med Cancel policy (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy Med Cancel — prefer Pay & workforce → Payroll.',
    aliases: ['med cancel', 'medcancel', 'missed service', 'cancellation pay']
  },
  {
    id: 'cp-sec-pto',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'PTO policy (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy PTO policy — prefer Pay & workforce → Payroll.',
    aliases: ['pto', 'pto policy', 'paid time off', 'time off policy', 'vacation policy']
  },
  {
    id: 'cp-sec-supervision-tracking',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Supervision tracking (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy supervision tracking — prefer Pay & workforce → Payroll.',
    aliases: ['supervision tracking', 'supervision pay', 'supervision policy']
  },
  {
    id: 'cp-sec-holidays',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Agency holidays (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy holiday calendar — prefer Pay & workforce → Payroll.',
    aliases: ['holidays', 'agency holidays', 'holiday pay', 'holiday calendar']
  },
  {
    id: 'cp-sec-excess-time',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Excess time compensation (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy excess time rules — prefer Pay & workforce → Payroll.',
    aliases: ['excess time', 'excess compensation', 'overtime policy']
  },
  {
    id: 'cp-sec-percent-pay',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Percent-of-client-paid pay (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy percent-pay rules — prefer Pay & workforce → Payroll.',
    aliases: ['percent of charge', 'percent of client paid', 'percentage pay', 'percent pay']
  },
  {
    id: 'cp-sec-service-codes',
    itemId: 'company-profile',
    agencyTab: 'payroll',
    kind: 'section',
    prefersStandaloneId: 'payroll-schedule',
    label: 'Payroll service codes (legacy)',
    pathLabel: 'Company profile → Payroll',
    description: 'Legacy service codes — prefer Pay & workforce → Payroll.',
    aliases: ['service codes', 'payroll codes', 'rate titles', 'other rate titles']
  },
  {
    id: 'cp-sec-tier-system',
    itemId: 'company-profile',
    agencyTab: 'notifications',
    kind: 'section',
    label: 'Tier system (payroll notifications)',
    pathLabel: 'Company profile → Notifications',
    description: 'Tier system configuration under Notifications.',
    aliases: ['tier system', 'payroll tiers', 'notification tiers']
  },
  {
    id: 'cp-sec-portal-config',
    itemId: 'company-profile',
    agencyTab: 'branding',
    kind: 'section',
    label: 'Portal configuration',
    pathLabel: 'Company profile → Branding',
    description: 'Portal URL and public/program branding options inside the Branding tab.',
    aliases: ['portal configuration', 'portal config', 'program public events', 'partner link requests']
  }
];

const HUB_SHELL_ITEM_IDS = new Set(['platform-ws-home', 'tenant-ws-home']);

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Enrich a live settings item into a search target.
 * @param {{ id: string, label?: string, categoryId: string, categoryLabel?: string, description?: string }} item
 */
export function enrichSettingsSearchTarget(item) {
  if (!item?.id) return null;
  const id = String(item.id);
  if (HUB_SHELL_ITEM_IDS.has(id)) return null;
  const label =
    SETTINGS_DISPLAY_LABELS[id] ||
    String(item.label || id)
      .replace(/\s+/g, ' ')
      .trim();
  const description = item.description || SETTINGS_SEARCH_DESCRIPTIONS[id] || '';
  return {
    id,
    itemId: id,
    categoryId: item.categoryId,
    categoryLabel: item.categoryLabel || '',
    pathLabel: '',
    label,
    description,
    aliases: SETTINGS_SEARCH_ALIASES[id] || [],
    agencyTab: null,
    kind: 'standalone'
  };
}

/** Normalize a Company Profile nested target for scoring / jump. */
export function enrichCompanyProfileSearchTarget(target) {
  if (!target?.id) return null;
  return {
    id: target.id,
    itemId: 'company-profile',
    categoryId: 'general',
    categoryLabel: 'COMPANY PROFILE',
    pathLabel: target.pathLabel || `Company profile → ${target.label}`,
    label: target.label,
    description: target.description || '',
    aliases: target.aliases || [],
    agencyTab: target.agencyTab || 'general',
    kind: target.kind === 'section' ? 'company-profile-section' : 'company-profile-tab',
    prefersStandaloneId: target.prefersStandaloneId || null,
    superadminOnly: !!target.superadminOnly
  };
}

/**
 * Build the full searchable target list for the current user context.
 * @param {object} opts
 * @param {Array} opts.catalogItems - [{ id, label, categoryId, categoryLabel, description? }]
 * @param {boolean} [opts.isSuperAdmin]
 * @param {boolean} [opts.includeCompanyProfile=true]
 */
export function buildSettingsSearchTargets({
  catalogItems = [],
  isSuperAdmin = false,
  includeCompanyProfile = true
} = {}) {
  const byId = new Map();
  const push = (t) => {
    if (!t?.id || byId.has(t.id)) return;
    byId.set(t.id, t);
  };

  for (const item of catalogItems) {
    push(enrichSettingsSearchTarget(item));
  }

  if (includeCompanyProfile) {
    // Ensure the top-level company-profile card is present even if filtered oddly.
    if (![...byId.values()].some((t) => t.itemId === 'company-profile' && !t.agencyTab)) {
      push(
        enrichSettingsSearchTarget({
          id: 'company-profile',
          label: 'Company Profile',
          categoryId: 'general',
          categoryLabel: 'GENERAL'
        })
      );
    }
    for (const raw of COMPANY_PROFILE_SEARCH_TARGETS) {
      if (raw.superadminOnly && !isSuperAdmin) continue;
      push(enrichCompanyProfileSearchTarget(raw));
    }
  }

  return [...byId.values()];
}

/**
 * Rank a settings search hit. Higher score = better.
 */
export function scoreSettingsSearchTarget(query, target) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !target) return 0;
  const label = String(target.label || '').toLowerCase();
  const description = String(target.description || '').toLowerCase();
  const pathLabel = String(target.pathLabel || '').toLowerCase();
  const aliases = (target.aliases || []).map((a) => String(a).toLowerCase());
  const hay = [
    label,
    description,
    pathLabel,
    target.itemId,
    target.categoryId,
    target.categoryLabel,
    target.agencyTab,
    ...aliases
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[-_]/g, ' ');

  const parts = q.split(/\s+/).filter(Boolean);
  const allParts = parts.every((part) => hay.includes(part));
  if (!hay.includes(q) && !allParts) return 0;

  let score = 10;
  if (aliases.some((a) => a === q)) score += 120;
  else if (label === q) score += 110;
  else if (aliases.some((a) => a.startsWith(q) || q.startsWith(a))) score += 70;
  else if (label.startsWith(q)) score += 60;
  else if (label.includes(q)) score += 45;
  else if (pathLabel.includes(q)) score += 35;
  else if (description.includes(q)) score += 28;
  else if (allParts) score += 30;

  // Depth / destination preference during the Company Profile → dedicated migration
  if (target.kind === 'standalone') score += 18;
  if (target.kind === 'company-profile-tab') score += 24;
  if (target.kind === 'company-profile-section') score += 32;

  // Penalty when a dedicated screen is the preferred home for this concept (mid-migration)
  if (target.prefersStandaloneId) score -= 28;

  for (const a of aliases) {
    if (a.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(a)}\\b`);
    if (re.test(q) || (re.test(hay) && q.includes(a))) score += 8;
  }
  return score;
}

/**
 * @param {string} query
 * @param {Array} targets - enriched targets
 * @param {number} [limit=14]
 */
export function filterSettingsSearchTargets(query, targets = [], limit = 14) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return (targets || [])
    .map((t) => ({ ...t, score: scoreSettingsSearchTarget(q, t) }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)))
    .slice(0, limit);
}

/** True when a hub card/item should remain visible under an active filter query. */
export function settingsCardMatchesQuery(query, card) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const itemId = card.item || card.id || card.itemId;
  const target = enrichSettingsSearchTarget({
    id: itemId,
    label: card.label,
    categoryId: card.category || card.categoryId || '',
    description: card.description || ''
  });
  if (target && scoreSettingsSearchTarget(q, target) > 0) return true;

  // Keep Company Profile card visible when a nested tab/section matches.
  if (itemId === 'company-profile') {
    return COMPANY_PROFILE_SEARCH_TARGETS.some((raw) => {
      const nested = enrichCompanyProfileSearchTarget(raw);
      return nested && scoreSettingsSearchTarget(q, nested) > 0;
    });
  }
  return false;
}
