import { isNoteAidEnabledForAgencyFlags, isNoteAidEmployeeRole } from '../config/noteAidAccess.js';
import { isSupervisor } from '../utils/helpers.js';
import { getAllQuickNavEntries, getQuickNavCatalog, resolveQuickNavRoute } from './quickNavCatalog.js';
import { APP_PAGES } from './appPagesData.js';
import { resolveHostImpliedPortalSlug } from '../utils/orgScopedPath.js';
import { canAccessBillingWorkspace } from '../config/medicalBillingAccess.js';
import { hasProviderMobileAccess } from '../utils/providerMobileAccess.js';
import { canAccessSchoolPortalsSurfaces } from '../utils/schoolPortalsAccess.js';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../utils/skillBuildersSchoolProgramAccess.js';
import { routeRequiresSchoolPortalsFeature, routeRequiresProgramOverviewDashboard, routeRequiresSkillBuildersSchoolProgramFeature } from './routeFeatures.js';

const normalizeRole = role => String(role || '').trim().toLowerCase().replace(/^superadmin$/, 'super_admin');
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const coordinator = user => [true, 1, '1'].includes(user?.has_skill_builder_coordinator_access);

export function quickNavEffectiveRole(user, agency) {
  const role = normalizeRole(user?.role);
  if (agency?.organization_type === 'affiliation') {
    return ['manager', 'assistant_manager'].includes(agency.club_role) ? 'club_manager' : role;
  }
  return ['club_manager', 'assistant_manager'].includes(role) ? 'provider' : role;
}

/** Match router role aliases. Discovery does not replace router or API authorization. */
export function quickNavRoleAllowed(role, required) {
  return list(required).some(r => {
    if (r === 'admin') return ['admin', 'super_admin', 'support'].includes(role);
    if (r === 'schedule_manager') return ['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'support'].includes(role);
    if (r === 'supervisor_or_cpa') return ['supervisor', 'clinical_practice_assistant', 'provider_plus'].includes(role);
    if (r === 'clinical_practice_assistant') return ['clinical_practice_assistant', 'provider_plus'].includes(role);
    return r === role;
  });
}

export function canDiscoverQuickNavRoute(route, { user, agency = {}, platformBranding = {} } = {}) {
  if (!route?.matched?.length || route.matched.some(r => /:pathMatch|:catchAll/.test(r.path))) return false;
  const meta = route.meta || {};
  if (meta.requiresAuth && !user) return false;
  if (meta.requiresGuest && user) return false;
  if (meta.blockPendingUsers && ['PENDING','pending'].includes(user?.status)) return false;
  const role = quickNavEffectiveRole(user, agency);
  const rawRole = normalizeRole(user?.role);
  if (meta.requiresBillingWorkspace && !canAccessBillingWorkspace(user)) return false;
  if (meta.requiresProviderMobileAccess && !hasProviderMobileAccess(user)) return false;
  if (meta.requiresApprovedEmployee && !(user?.type === 'approved_employee' || ['ACTIVE_EMPLOYEE', 'TERMINATED_PENDING', 'active', 'completed'].includes(user?.status))) return false;
  if (meta.blockApprovedEmployees && user?.type === 'approved_employee') return false;
  if (['ARCHIVED','INACTIVE_EMPLOYEE','INACTIVE','TERMINATED'].includes(String(user?.status || '').toUpperCase())) return false;
  if (user?.type === 'approved_employee' && !/\/(my-learning|on-demand-training)(?:\/|$)/.test(route.path)) return false;
  const employee = ['super_admin','admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant','intern','intern_plus','facilitator','tutor','clinician','assistant_admin','club_manager','assistant_manager','schedule_manager','cpa','agency_admin','backoffice_admin'].includes(rawRole);
  if (meta.requiresAuth && !employee) {
    if (['client_guardian','guardian','client','parent','family_member'].includes(rawRole)) {
      if (!/(?:^|\/)(guardian|client-dashboard)(?:\/|$)|^\/(my-records|my-portal|account-security|privacy-review)$/.test(route.path)) return false;
    } else if (rawRole === 'athlete') {
      if (!/\/(dashboard|my_club_dashboard|club-store|account-security|privacy-review)(?:\/|$)/.test(route.path)) return false;
    } else if (rawRole === 'kiosk') {
      if (!/kiosk/.test(route.path)) return false;
    } else if (!meta.requiresRole && !meta.requiresCapability && !/school-portal|\/schools?\/|account-security|privacy-review/.test(route.path)) return false;
  }
  if (/\/notifications$/.test(route.path)) {
    if (route.query?.scope === 'managed' && !['super_admin','admin','support','clinical_practice_assistant'].includes(rawRole)) return false;
    if (route.query?.scope === 'team' && !['supervisor','clinical_practice_assistant','provider_plus'].includes(rawRole)) return false;
  }
  if (/\/records-manager$/.test(route.path) && !user?.capabilities?.canAccessRecordsManager) return false;
  if (/\/finance-operations(?:\/|$)/.test(route.path) && rawRole !== 'super_admin' && !user?.capabilities?.canAccessFinanceOperations) return false;
  if (/\/(club\/(settings|seasons)|admin\/book-club)(?:\/|$)/.test(route.path)) {
    if (rawRole !== 'super_admin' && (agency.organization_type !== 'affiliation' || !['club_manager','admin'].includes(role))) return false;
  }
  if (/\/my_club_dashboard$/.test(route.path) && agency.organization_type !== 'affiliation' && !['super_admin','athlete'].includes(rawRole)) return false;
  if (/\/my-portal$/.test(route.path) && !['client_guardian','client','guardian'].includes(rawRole)) return false;
  if (/\/supervision\/agreements$/.test(route.path) && !isSupervisor(user) && !(user?.has_clinical_supervision || user?.capabilities?.hasClinicalSupervision)) return false;
  const path = route.path.replace(/^\/[^/]+(?=\/(?:admin|dashboard|workforce-operations|school-operations|people-operations|schedule)(?:\/|$))/, '');
  if (/(?:^|\/)(?:note-aid|clinical-note-generator)(?:\/|$)/.test(path)) {
    let flags = agency.feature_flags ?? agency.featureFlags ?? {};
    if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { flags = {}; } }
    if (agency.organization_type === 'affiliation' || !isNoteAidEmployeeRole(role) || !isNoteAidEnabledForAgencyFlags(flags)) return false;
  }
  if (/(?:^|\/)dashboard$/.test(path)) {
    const tab = String(route.query?.tab || 'overview');
    if (rawRole === 'athlete' && tab !== 'overview') return false;
    if (tab === 'supervision' && !isSupervisor(user)) return false;
    if (tab === 'my_supervision' && !(user?.has_clinical_supervision || user?.capabilities?.hasClinicalSupervision)) return false;
    if (tab === 'social_feeds' && rawRole !== 'super_admin') return false;
    if (tab === 'providers' && rawRole !== 'provider_plus') return false;
    if (['staff','clients','my_schedule','meetings','submit','my_supervision'].includes(tab) && ['client','client_guardian','guardian','school_staff','kiosk'].includes(rawRole)) return false;
    if (agency.organization_type === 'affiliation' && ['staff','clients','meetings','supervision','my_supervision','submit','my_schedule'].includes(tab)) return false;
  }
  if ((role === 'club_manager' || rawRole === 'club_manager') && /\/admin\/(audit-center|payroll|expenses)(\/|$)/.test(path)) return false;
  if (role === 'support' && path.includes('/admin/audit-center')) return false;
  if (['clinical_practice_assistant', 'provider_plus', 'supervisor'].includes(rawRole) && /\/admin\/(modules|documents|settings|checklist-items)(\/|$)/.test(path)) return false;
  if (role === 'school_staff' && /^\/(schedule|workforce-operations|school-operations|people-operations|dashboard|payroll)(\/|$)/.test(path)) return false;
  const owner = meta.allowIndependentPracticeOwner && Number(agency.account_owner_user_id) === Number(user?.id)
    && ['life_coach', 'consultant'].includes(agency.organization_type) && agency.slug === route.params?.organizationSlug;
  if (meta.requiresRole && !quickNavRoleAllowed(role, meta.requiresRole) && !(meta.allowSubCoordinator && coordinator(user)) && !owner) return false;
  const caps = user?.capabilities;
  if (role !== 'super_admin' && !list(meta.requiresCapability).every(key => !!caps?.[key])) return false;
  const featureContext = {
    userRole: rawRole, agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
    platformAvailableAgencyFeaturesJson: platformBranding.available_agency_features_json ?? platformBranding.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson: agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
  };
  const school = canAccessSchoolPortalsSurfaces(featureContext);
  const programs = canAccessSkillBuildersSchoolProgramSurfaces(featureContext);
  if (routeRequiresSchoolPortalsFeature(route) && !school) return false;
  if (routeRequiresProgramOverviewDashboard(route) && !school && !programs) return false;
  const toolingBypass = ['super_admin', 'admin', 'staff', 'support', 'clinical_practice_assistant', 'provider_plus'].includes(rawRole) || coordinator(user);
  if (routeRequiresSkillBuildersSchoolProgramFeature(route) && !programs && !toolingBypass && route.name !== 'SkillBuildersEventPortal') return false;
  return true;
}

export function resolveRegisteredRoute(router, location, hostPortalSlug) {
  if (!location) return null;
  try {
    let resolved = router.resolve(location);
    // Validate redirect destinations too. Preserve query/hash just as vue-router does.
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      // Match the router's dedicated-host canonicalization before recording the
      // destination. Otherwise a successful /itsco/page → /page navigation is
      // reported as an access failure by every Quick Nav surface.
      const prefix = hostPortalSlug ? `/${hostPortalSlug}` : '';
      if (prefix && (resolved.path === prefix || resolved.path.startsWith(`${prefix}/`))) {
        const path = resolved.path.slice(prefix.length) || '/';
        // The mobile shell is only registered under /:organizationSlug.
        if (path !== '/provider-mobile' && !path.startsWith('/provider-mobile/')) {
          resolved = router.resolve({ path, query: resolved.query, hash: resolved.hash });
        }
      }
      if (!resolved.matched.length || resolved.matched.some(r => /:pathMatch|:catchAll/.test(r.path))) return null;
      const redirect = resolved.matched.at(-1)?.redirect;
      if (!redirect) return resolved;
      if (seen.has(resolved.fullPath)) return null;
      seen.add(resolved.fullPath);
      const target = typeof redirect === 'function' ? redirect(resolved) : redirect;
      resolved = router.resolve(typeof target === 'string' ? target : { query: resolved.query, hash: resolved.hash, ...target });
    }
  } catch { /* Missing route parameters or removed routes are not destinations. */ }
  return null;
}

/** Prefer the selected organization's registered route; use a flat route only when it exists. */
export function resolveRegisteredQuickNav(entry, router, opts = {}) {
  if (!entry) return null;
  let location;
  try { location = resolveQuickNavRoute(entry, opts); } catch { return null; }
  const hostPortalSlug = resolveHostImpliedPortalSlug({ portalHostPortalUrl: opts.hostPortalSlug });
  let resolved = resolveRegisteredRoute(router, location, hostPortalSlug);
  if (!resolved && entry.kind === 'path' && entry.scope !== 'platform') {
    resolved = resolveRegisteredRoute(router, resolveQuickNavRoute(entry, { ...opts, orgSlug: '' }), hostPortalSlug);
  }
  return resolved;
}

const basePath = path => String(path || '').split(/[?#]/)[0].replace(/^\/:organizationSlug/, '');
const internalPage = /(?:callback|legacy|redirect|pendingcompletion|changepassword|onboardingchecklist|kioskapp|securityverified|yearupdateflow|providerupdateflow)/i;

/** Supplement hand-written labels with real, static application routes so new screens remain findable. */
export function getRegisteredQuickNavEntries(router, ctx, opts = {}) {
  const known = new Set([...APP_PAGES, ...getQuickNavCatalog()].map(e => basePath(e.path)).filter(Boolean));
  const extras = [];
  for (const route of router.getRoutes()) {
    const path = basePath(route.path);
    if (!route.meta.requiresAuth || route.meta.quickNav === false || route.meta.hideNav || route.redirect || !route.name || /:/.test(path) || internalPage.test(String(route.name)) || known.has(path)) continue;
    known.add(path);
    const label = route.meta.title || ({ OrganizationMessages: 'Messages', Messages: 'Messages', ProviderMobileNoteAid: 'Note Workspace', OrganizationPrivateVirtualOffice: 'My Virtual Office', PrivateVirtualOffice: 'My Virtual Office' }[route.name]) || String(route.name).replace(/^Organization/, '').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    extras.push({ id: `route-${path}`, kind: 'path', path, label, description: 'Open page',
      group: path.startsWith('/admin') ? 'admin' : 'workspace', keywords: path.split(/[/-]/).filter(Boolean), fromAppPages: true });
  }
  const seen = new Map();
  const context = { ...opts, user: ctx.user };
  for (const entry of [...getAllQuickNavEntries(ctx, { routeAware: true }), ...extras]) {
    if (entry.rolesAny && !quickNavRoleAllowed(ctx.role, entry.rolesAny)) continue;
    const resolved = resolveRegisteredQuickNav(entry, router, opts);
    if (!resolved || !canDiscoverQuickNavRoute(resolved, context)) continue;
    // Full destinations matter: different tabs on one page are different shortcuts.
    const key = resolved.fullPath;
    const existing = seen.get(key);
    if (existing) {
      existing.keywords = [...new Set([...(existing.keywords || []), entry.label, ...(entry.keywords || [])])];
    } else {
      let label = entry.label;
      if (/\/(?:note-aid|clinical-note-generator)(?:\/|$)/.test(resolved.path)) label = 'Note Workspace';
      if (/\/messages$/.test(resolved.path)) label = 'Messages';
      if (/\/notifications$/.test(resolved.path) && !resolved.query.scope) label = 'Notifications';
      seen.set(key, { ...entry, label, keywords: [...(entry.keywords || []), entry.label], destination: key });
    }
  }
  return [...seen.values()];
}
