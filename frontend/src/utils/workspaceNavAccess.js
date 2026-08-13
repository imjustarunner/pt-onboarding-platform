import { canAccessSchoolPortalsSurfaces } from './schoolPortalsAccess.js';
import { isSummitPlatformRouteSlug } from './summitPlatformSlugs.js';
import { hubPathPrefix } from './orgScopedPath.js';

function normRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isAdminRole(role) {
  const r = normRole(role);
  return r === 'admin' || r === 'support' || r === 'super_admin';
}

function isTruthyFlag(v) {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true;
  return false;
}

function resolveHiringFeature(opts = {}) {
  if (opts.hasHiringFeature != null) return !!opts.hasHiringFeature;
  const flags = opts.agencyFeatureFlags || {};
  return isTruthyFlag(flags.hiringEnabled);
}

function resolvePeopleOpsFeature(opts = {}) {
  if (opts.hasPeopleOpsFeature != null) return !!opts.hasPeopleOpsFeature;
  const flags = opts.agencyFeatureFlags || {};
  return isTruthyFlag(flags.peopleOpsEnabled);
}

function hasCapability(user, key) {
  return !!(user?.capabilities || {})[key];
}

/** Management dashboard (TenantAdminDashboard) — admin, super_admin, and support. */
export function canAccessManagementDashboard(opts = {}) {
  const r = normRole(opts.role);
  if (r === 'club_manager' || r === 'assistant_manager') {
    return !!opts.isSscSstcTenant;
  }
  return r === 'admin' || r === 'super_admin' || r === 'support';
}

/** Operations dashboard — matches App.vue showOperationsDashboardLink. */
export function canAccessOperationsDashboard(opts = {}) {
  if (opts.isSscSstcTenant) return false;
  const r = normRole(opts.role);
  return ['provider_plus', 'clinical_practice_assistant', 'admin', 'super_admin'].includes(r);
}

/** Workforce Operations hub — matches App.vue canSeeWorkforceOperationsNav. */
export function canAccessWorkforceOperationsHub(opts = {}) {
  if (opts.isSscSstcTenant || opts.isAffiliationContext) return false;
  const r = normRole(opts.role);
  return ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff', 'provider_plus'].includes(r);
}

/** School Operations hub — route + feature gate; CPA/Provider+ can enter, cards filtered inside. */
export function canAccessSchoolOperationsHub(opts = {}) {
  if (opts.hideGlobalNavForSchoolStaff || opts.isSummitStatsChallengeChrome) return false;
  if (opts.isSscSstcTenant || opts.isAffiliationContext) return false;

  const r = normRole(opts.role);
  const featureOk = canAccessSchoolPortalsSurfaces({
    userRole: opts.role,
    agencyFeatureFlags: opts.agencyFeatureFlags,
    platformAvailableAgencyFeaturesJson: opts.platformAvailableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson: opts.tenantAvailableAgencyFeaturesOverrideJson
  });
  if (!featureOk) return false;

  return [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider_plus'
  ].includes(r);
}

/**
 * People Operations hub — mirrors App.vue People Ops visibility loosely:
 * not SSC/SSTC, not affiliation, and (hiring or peopleOps feature) for admin-like /
 * canManageHiring users.
 */
export function canAccessPeopleOperationsHub(opts = {}) {
  if (opts.isSscSstcTenant || opts.isAffiliationContext) return false;

  const hasHiringFeature = resolveHiringFeature(opts);
  const hasPeopleOpsFeature = resolvePeopleOpsFeature(opts);
  if (!hasHiringFeature && !hasPeopleOpsFeature) return false;

  const r = normRole(opts.role);
  const user = opts.user || {};
  if (isAdminRole(r) || r === 'super_admin') return true;
  if (hasCapability(user, 'canManageHiring')) return true;
  if (r === 'staff' && (hasHiringFeature || hasPeopleOpsFeature)) return true;
  return false;
}

/** Roles that can open most school ops hub cards (matches common school route meta). */
export function canSeeSchoolOpsHubCards(opts = {}) {
  return canAccessSchoolOperationsHub(opts);
}

/** School Clients card — admin/staff only (not CPA/Provider+). */
export function canSeeSchoolClientsHubCard(opts = {}) {
  if (!canAccessSchoolOperationsHub(opts)) return false;
  const r = normRole(opts.role);
  return r === 'super_admin' || isAdminRole(r) || r === 'staff';
}

function canManagePayrollForAgency(user, agencyId) {
  const role = normRole(user?.role);
  if (role === 'super_admin') return true;
  const caps = user?.capabilities || {};
  if (!caps.canManagePayroll) return false;
  const ids = Array.isArray(user?.payrollAgencyIds) ? user.payrollAgencyIds : [];
  const id = Number(agencyId);
  if (!id) return false;
  return ids.includes(id);
}

/**
 * Whether an At a Glance metric card should render for the current user.
 * Keys align with TenantAdminDashboard glanceCards.
 */
export function canSeeDashboardGlanceCard(cardKey, opts = {}) {
  const r = normRole(opts.role);
  const user = opts.user || {};
  const isOpsMode = !!opts.isOperationsMode;

  switch (cardKey) {
    case 'office_requests':
      return ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff'].includes(r);
    case 'new_hires':
    case 'applications':
      return hasCapability(user, 'canManageHiring');
    case 'in_onboarding':
    case 'completed_onboarding':
      return isAdminRole(r) || r === 'clinical_practice_assistant';
    case 'messages':
      return true;
    case 'training':
      return hasCapability(user, 'canViewTraining') || isAdminRole(r) || r === 'super_admin';
    case 'support_tickets':
      return isAdminRole(r) || r === 'staff';
    case 'tasks':
      return true;
    case 'late_notes':
    case 'payroll':
      return canManagePayrollForAgency(user, opts.agencyId);
    case 'escalations':
      return ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(r)
        && !isOpsMode;
    default:
      return true;
  }
}

export function filterDashboardGlanceCards(cards, opts = {}) {
  return (cards || []).filter((card) => canSeeDashboardGlanceCard(card.key, opts));
}

export function managementDashboardPath(prefix, opts = {}) {
  const r = normRole(opts.role);
  if ((r === 'club_manager' || r === 'assistant_manager') && opts.isSscSstcTenant) {
    return `${prefix}/club_manager_dashboard`;
  }
  return `${prefix}/admin-dashboard`;
}

export function resolveWorkspaceAccess(opts = {}) {
  return {
    management: canAccessManagementDashboard(opts),
    operations: canAccessOperationsDashboard(opts),
    workforce: canAccessWorkforceOperationsHub(opts),
    school: canAccessSchoolOperationsHub(opts),
    people: canAccessPeopleOperationsHub(opts)
  };
}

/** Quick-access tiles on Management / Operations dashboards (max 4, admin/ops swap). */
export function buildDashboardQuickAccessLinks(opts = {}) {
  const prefix = opts.prefix || '';
  const currentSurface = opts.currentSurface || 'management';
  const access = resolveWorkspaceAccess(opts);
  const links = [];

  links.push({
    key: 'my',
    label: 'My Dashboard',
    sub: 'Personal',
    to: `${prefix}/dashboard`,
    icon: 'my'
  });

  if (currentSurface === 'operations') {
    if (access.management) {
      links.push({
        key: 'admin',
        label: 'Admin',
        sub: 'Management',
        to: managementDashboardPath(prefix, opts),
        icon: 'admin'
      });
    }
  } else if (access.operations) {
    links.push({
      key: 'ops',
      label: 'Ops Dashboard',
      sub: 'Operations',
      to: `${prefix}/operations-dashboard`,
      icon: 'ops'
    });
  }

  if (access.workforce) {
    links.push({
      key: 'workforce',
      label: 'Workforce Ops',
      sub: 'Staff',
      to: `${prefix}/workforce-operations`,
      icon: 'workforce'
    });
  }

  if (access.school) {
    links.push({
      key: 'school',
      label: 'School Ops',
      sub: 'Schools',
      to: `${prefix}/school-operations`,
      icon: 'school'
    });
  }

  if (access.people) {
    links.push({
      key: 'people',
      label: 'People Ops',
      sub: 'Hiring',
      to: `${prefix}/people-operations`,
      icon: 'people'
    });
  }

  return links;
}

/** Hub page header switcher — only destinations the user can open. */
export function buildHubSwitcherLinks(opts = {}) {
  const prefix = opts.prefix || '';
  const currentSurface = opts.currentSurface;
  const access = resolveWorkspaceAccess(opts);

  const defs = [
    { key: 'my', label: 'My Dashboard', to: `${prefix}/dashboard`, icon: 'my', show: true },
    {
      key: 'management',
      label: 'Admin',
      to: managementDashboardPath(prefix, opts),
      icon: 'admin',
      show: access.management
    },
    {
      key: 'operations',
      label: 'Ops Dashboard',
      to: `${prefix}/operations-dashboard`,
      icon: 'ops',
      show: access.operations
    },
    {
      key: 'workforce',
      label: 'Workforce Ops',
      to: `${prefix}/workforce-operations`,
      icon: 'workforce',
      show: access.workforce
    },
    {
      key: 'school',
      label: 'School Ops',
      to: `${prefix}/school-operations`,
      icon: 'school',
      show: access.school
    },
    {
      key: 'people',
      label: 'People Ops',
      to: `${prefix}/people-operations`,
      icon: 'people',
      show: access.people
    }
  ];

  return defs
    .filter((item) => item.show)
    .map((item) => ({
      ...item,
      isActive: item.key === currentSurface
    }));
}

export function isSscSstcTenantFromSlug(slug) {
  return isSummitPlatformRouteSlug(String(slug || '').trim().toLowerCase());
}

const OPS_CYCLE_SURFACES = [
  { key: 'operations', segment: '/operations-dashboard', label: 'Operations Dashboard' },
  { key: 'workforce', segment: '/workforce-operations', label: 'Workforce Ops' },
  { key: 'school', segment: '/school-operations', label: 'School Ops' }
];

/** Destinations CPA / Provider+ can rotate through via the top-bar ops link. */
export function getOpsCycleDestinations(ctx = {}) {
  const prefix = ctx.prefix || '';
  const access = resolveWorkspaceAccess(ctx);
  return OPS_CYCLE_SURFACES
    .filter((item) => {
      if (item.key === 'operations') return access.operations;
      if (item.key === 'workforce') return access.workforce;
      if (item.key === 'school') return access.school;
      return false;
    })
    .map((item) => ({ ...item, path: `${prefix}${item.segment}` }));
}

export function getNextOpsCycleDestination(ctx = {}, currentPath = '') {
  const destinations = getOpsCycleDestinations(ctx);
  if (!destinations.length) return null;
  const pathNorm = String(currentPath || '');
  const idx = destinations.findIndex((d) => pathNorm.includes(d.segment));
  const nextIdx = idx < 0 ? 0 : (idx + 1) % destinations.length;
  return destinations[nextIdx];
}

export function isOpsCycleNavRole(role) {
  const r = normRole(role);
  return r === 'clinical_practice_assistant' || r === 'provider_plus';
}

export function workspaceNavContextFromStores({
  role,
  slug,
  agency,
  branding,
  user = null,
  isAffiliationContext = false,
  hasHiringFeature = null,
  hasPeopleOpsFeature = null
}) {
  const agencyRecord = agency?.value ?? agency ?? {};
  const pb = branding?.platformBranding ?? branding ?? {};
  const slugNorm = String(slug || agencyRecord.slug || agencyRecord.portal_url || '').trim();
  const flags = agencyRecord.feature_flags ?? agencyRecord.featureFlags ?? {};

  return {
    role,
    user: user?.value ?? user ?? null,
    prefix: hubPathPrefix({
      routeSlug: slug,
      agency: agencyRecord,
      branding
    }),
    isAffiliationContext,
    isSscSstcTenant: isSscSstcTenantFromSlug(slugNorm),
    agencyFeatureFlags: flags,
    hasHiringFeature: hasHiringFeature != null ? !!hasHiringFeature : isTruthyFlag(flags?.hiringEnabled),
    hasPeopleOpsFeature:
      hasPeopleOpsFeature != null ? !!hasPeopleOpsFeature : isTruthyFlag(flags?.peopleOpsEnabled),
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      agencyRecord.tenant_available_agency_features_json ?? agencyRecord.tenantAvailableAgencyFeaturesJson
  };
}
