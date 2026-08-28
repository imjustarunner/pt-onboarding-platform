import { createRouter, createWebHistory } from 'vue-router';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import { getDashboardRoute } from '../utils/router';
import { extractAdminPageFromPath } from '../utils/normalizeAdminPageKey.js';
import { useIndirectTimeSessionStore } from '../store/indirectTimeSession';
import { getLoginUrl, getCurrentPortalSlugFromHostCache } from '../utils/loginRedirect';
import { buildOrgLoginPath } from '../utils/orgLoginPath';
import { guessPortalSlugFromHostname } from '../utils/orgScopedPath';
import { isQuickViewHost } from '../utils/subdomain';
import { isSupervisor } from '../utils/helpers';
import { hasProviderMobileAccess } from '../utils/providerMobileAccess';
import { isLikelyMobileViewport, isStandalonePwa } from '../utils/pwa';
import { getSchoolStaffWaiverStatus } from '../utils/schoolStaffWaiverGate';
import {
  isSchoolOnboardingDemoActive,
  isSchoolOnboardingDemoRoute
} from '../utils/schoolOnboardingDemoContext.js';
import api from '../services/api';
import { isSummitPlatformRouteSlug, NATIVE_APP_ORG_SLUG } from '../utils/summitPlatformSlugs.js';
import { userChoseWorkOverSummitFromStores } from '../utils/sstcSurfaceChoice.js';
import { isSstcTenantSlug } from '../config/tenantAppProfiles.js';
import { canAccessSchoolPortalsSurfaces } from '../utils/schoolPortalsAccess.js';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../utils/skillBuildersSchoolProgramAccess.js';
import { getSchoolStaffPortalSlugs as getSchoolStaffPortalSlugsFromAgencies } from '../utils/schoolStaffPortal.js';
import { isBookClubAgency, getBookClubParentSlug } from '../utils/bookClubAgency.js';
import { isLikelyDemoTenant, pickFirstNonDemoTenant, pickOrgSlug } from '../utils/demoTenant.js';
import { signalFreshLogin } from '../composables/useReminderSnooze.js';
import {
  isTenantOrganizationType,
  isNestedOrganizationType,
  getParentAgencyFromOrg,
  getOrgSlug
} from '../utils/organizationTypes.js';

/** Host-implied portal slug (app.itsco.health → itsco), even when /agencies/resolve is empty. */
const resolveHostPortalSlug = (brandingStore = null) => {
  const fromStore = String(brandingStore?.portalHostPortalUrl || '').trim().toLowerCase();
  if (fromStore) return fromStore;
  const fromCache = String(getCurrentPortalSlugFromHostCache() || '').trim().toLowerCase();
  if (fromCache) return fromCache;
  return String(guessPortalSlugFromHostname() || '').trim().toLowerCase() || '';
};

const SCHEDULE_HUB_ROLES = ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff', 'provider_plus'];
/** Hub landing + Staff Schedules busy overlay (providers cannot open buildings/approvals from hub). */
const SCHEDULE_HUB_VIEW_ROLES = [...SCHEDULE_HUB_ROLES, 'provider'];
const STAFF_SCHEDULE_COMPARE_ROLES = ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'provider', 'staff'];

/** School Overview (orgType=school) + All portals + hub + school clients + school digital intakes — not Program Overview (orgType=program). */
function routeRequiresSchoolPortalsFeature(to) {
  const n = String(to?.name || '');
  if (n === 'SchoolPortals' || n === 'OrganizationSchoolPortals') return true;
  if (n === 'SchoolPortalsHub' || n === 'OrganizationSchoolPortalsHub') return true;
  if (n === 'SchoolOperations' || n === 'OrganizationSchoolOperations') return true;
  if (n === 'SchoolClients' || n === 'OrganizationSchoolClients') return true;
  if (n === 'SchoolPortalDigitalIntakes' || n === 'OrganizationSchoolPortalDigitalIntakes') return true;
  if (n === 'SchoolReferralHub' || n === 'OrganizationSchoolReferralHub') return true;
  if (n === 'SchoolOverviewDashboard' || n === 'OrganizationSchoolOverviewDashboard') {
    return String(to.query?.orgType || 'school').toLowerCase() === 'school';
  }
  return false;
}

/** School overview “Program” tab — either school portals or Skill Builders school program must be provisioned. */
function routeRequiresProgramOverviewDashboard(to) {
  const n = String(to?.name || '');
  if (n !== 'SchoolOverviewDashboard' && n !== 'OrganizationSchoolOverviewDashboard') return false;
  return String(to.query?.orgType || '').toLowerCase() === 'program';
}

/** Authenticated Skill Builders school-program admin + event portal (not public/guardian SB pages). */
function routeRequiresSkillBuildersSchoolProgramFeature(to) {
  const n = String(to?.name || '');
  if (n === 'SkillBuildersEventPortal') return true;
  if (n === 'OrganizationSkillBuildersAvailability' || n === 'SkillBuildersAvailability') return true;
  if (n === 'OrganizationSkillBuildersProgramsEvents' || n === 'SkillBuildersProgramsEvents') return true;
  if (n === 'OrganizationSkillBuildersClientManagement' || n === 'SkillBuildersClientManagement') return true;
  if (n === 'OrganizationSkillBuildersMyAvailability' || n === 'SkillBuildersMyAvailability') return true;
  return false;
}
/** Matches Directory “Programs & events” access (nav + dedicated page). */
const SKILL_BUILDERS_PROGRAM_EVENTS_ROLES = [
  'admin',
  'staff',
  'support',
  'super_admin',
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant'
];
const PROVIDER_PLUS_EXPERIENCE_ROLES = ['provider_plus', 'clinical_practice_assistant'];
/** Client Exchange (office clients): providers browse/post/request, admin/support resolve requests. */
const CLIENT_EXCHANGE_ROLES = [
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
];
/** Full client record / client list — assigned providers, CPAs, and backoffice. */
const CLIENT_RECORD_ROLES = [
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant',
  'super_admin'
];
const NOTE_AID_EMPLOYEE_ROLES = [
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
];
/** Broad employee gate; SessionRecordingView enforces ITSCO/NLU role + feature flag. */
const SESSION_RECORDING_ROUTE_ROLES = NOTE_AID_EMPLOYEE_ROLES;
const TOOLS_AIDS_ROUTE_SEGMENTS = [
  '/tools-aids',
  '/note-aid',
  '/admin/tools-aids',
  '/admin/note-aid',
  '/admin/clinical-note-generator',
  '/admin/session-recording'
];
const isSscPortalSlug = isSummitPlatformRouteSlug;

const isAllowedSscAuthenticatedPath = (path) => {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return false;
  // Org-scoped admin subtree (each route enforces role). A single `admin(?:/|$)` alternative does not match `/sstc/admin/surveys`.
  if (/^\/[^/]+\/admin(\/|$)/.test(normalized)) return true;
  // Notifications hub lives outside `/admin` (still org-scoped).
  if (/^\/[^/]+\/notifications(\/|$)/.test(normalized)) return true;
  // Summit tenant: member surfaces + club manager dashboard + operations.
  // `home` = participant portal (not "weekly challenges"); `season` = one season workspace. Legacy `challenges` redirects.
  const allowedOrgScoped =
    /^\/[^/]+\/(home(?:\/|$)|my_club_dashboard(?:\/|$)|season(?:\/|$)|challenges(?:\/|$)|messages(?:\/|$)|clubs(?:\/[^/]+(?:\/(?:members|records))?)?(?:\/|$)|join(?:\/|$)|club\/settings(?:\/|$)|club\/seasons(?:\/|$)|dashboard(?:\/|$)|preferences(?:\/|$)|credentials(?:\/|$)|account-info(?:\/|$)|change-password(?:\/|$)|logout(?:\/|$)|club_manager_dashboard(?:\/|$)|operations-dashboard(?:\/|$)|admin-update(?:\/|$))/;
  const allowedGlobal = /^\/(dashboard|preferences|credentials|account-info|change-password|logout|admin-update)(?:\/|$)/;
  return allowedOrgScoped.test(normalized) || allowedGlobal.test(normalized);
};

const isNonAgencyOrgType = (value) => {
  const t = String(value || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning' || t === 'affiliation';
};

/** Bare /:slug/dashboard → Summit club home (no personal HR tabs in query). */
const SSTC_DASHBOARD_PERSONAL_QUERY_KEYS = [
  'tab', 'my', 'sp', 'sso', 'scheduleMode', 'superviseeId', 'employeeId', 'scheduleViewAs', 'programHub', 'sbPrograms', 'programId'
];
const shouldRedirectSscDashboardToMyClub = (query) => {
  const q = query || {};
  return !SSTC_DASHBOARD_PERSONAL_QUERY_KEYS.some((k) => q[k] != null && String(q[k]).length > 0);
};
/** Keep classic personal dashboard for internal staff roles (schedule rail, payroll, etc.). */
const SSTC_ROLES_SKIP_MY_CLUB_DASH_REDIRECT = new Set([
  'provider_plus',
  'clinical_practice_assistant',
  'admin',
  'support',
  'super_admin',
  'superadmin',
  'staff',
  'supervisor'
]);

const isToolsAidsRoute = (to) => {
  const path = String(to?.path || '');
  return TOOLS_AIDS_ROUTE_SEGMENTS.some((segment) => path.includes(segment));
};

const getDefaultOrganizationSlug = () => {
  try {
    const agencyStore = useAgencyStore();
    const authStore = useAuthStore();
    const brandingStore = useBrandingStore();

    const roleNorm = String(authStore.user?.role || '').toLowerCase();
    const isSchoolStaff = roleNorm === 'school_staff';

    const pickSlug = (org) => {
      if (!org) return null;
      return org.portal_url || org.portalUrl || org.slug || null;
    };
    const isPortalOrg = (org) => {
      const t = String(org?.organization_type || org?.organizationType || '').toLowerCase();
      return t === 'school' || t === 'program' || t === 'learning';
    };

    // School staff should default to a SCHOOL portal slug (never the parent agency slug).
    if (isSchoolStaff) {
      const fromCurrent = agencyStore.currentAgency;
      if (fromCurrent && isPortalOrg(fromCurrent)) {
        const s = pickSlug(fromCurrent);
        if (s) return s;
      }

      const fromStoredUserAgenciesRaw = JSON.parse(localStorage.getItem('userAgencies') || '[]');
      const fromStoredUserAgencies = Array.isArray(fromStoredUserAgenciesRaw) ? fromStoredUserAgenciesRaw : [];
      const firstPortal = fromStoredUserAgencies.find((o) => isPortalOrg(o) && pickSlug(o));
      if (firstPortal) return pickSlug(firstPortal);

      const fromLocal = JSON.parse(localStorage.getItem('currentAgency') || 'null');
      if (fromLocal && isPortalOrg(fromLocal) && pickSlug(fromLocal)) return pickSlug(fromLocal);
    }

    const curAgency = agencyStore.currentAgency;
    const storedList = JSON.parse(localStorage.getItem('userAgencies') || '[]');
    const storedArr = Array.isArray(storedList) ? storedList : [];
    const membershipPool = [
      ...storedArr,
      ...(Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []),
      ...(Array.isArray(authStore.user?.agencies) ? authStore.user.agencies : [])
    ];
    const fromStore = curAgency?.slug || curAgency?.portal_url;
    if (fromStore) {
      if (!isSchoolStaff && isPortalOrg(curAgency)) {
        const p = String(curAgency.parent_slug || curAgency.parentSlug || '').trim();
        if (p) return p;
      }
      if (isBookClubAgency(curAgency)) {
        const parentSlug = getBookClubParentSlug(curAgency, storedArr);
        if (parentSlug) return parentSlug;
      }
      if (isLikelyDemoTenant(curAgency)) {
        const preferred = pickFirstNonDemoTenant(membershipPool);
        const preferredSlug = preferred ? pickOrgSlug(preferred) : '';
        if (preferredSlug) return preferredSlug;
      }
      return fromStore;
    }

    const isAffiliation = (org) => String(org?.organization_type || org?.organizationType || '').toLowerCase() === 'affiliation';
    const isTenant = (org) => {
      const t = String(org?.organization_type || org?.organizationType || '').toLowerCase();
      return !t || t === 'agency' || t === 'life_coach' || t === 'consultant';
    };
    const tenantPool = storedArr.filter((o) => isTenant(o) && pickSlug(o) && !isBookClubAgency(o));
    const firstTenant = pickFirstNonDemoTenant(tenantPool) || tenantPool[0] || null;
    if (firstTenant) return pickSlug(firstTenant);

    // Prefer Summit affiliations (not book clubs) when picking from stored user agencies
    const firstAffiliation = storedArr.find((o) => isAffiliation(o) && !isBookClubAgency(o) && pickSlug(o));
    if (firstAffiliation) return pickSlug(firstAffiliation);

    const fromUserAgencies = authStore.user?.agencies?.[0]?.slug;
    if (fromUserAgencies) return fromUserAgencies;

    const fromStoredUserAgencies = storedArr[0] || null;
    const storedSlug = fromStoredUserAgencies?.slug || fromStoredUserAgencies?.portal_url || fromStoredUserAgencies?.portalUrl || null;
    if (storedSlug) return storedSlug;

    const fromLocal = JSON.parse(localStorage.getItem('currentAgency') || 'null');
    const localSlug = fromLocal?.slug || fromLocal?.portal_url || fromLocal?.portalUrl || null;
    if (localSlug) return localSlug;

    // Custom-domain portals: host resolves to portalUrl (portal_url or slug).
    const fromPortalHost = brandingStore.portalHostPortalUrl;
    if (fromPortalHost) return fromPortalHost;
  } catch (e) {
    // ignore
  }
  return null;
};

/** True when hostname already identifies this portal slug (custom domain or subdomain); path must stay flat (no /{slug}/…). */
const isPortalHostSlugRedundantInPath = (brandingStore, segmentSlug) => {
  const h = resolveHostPortalSlug(brandingStore);
  const s = String(segmentSlug || '').trim().toLowerCase();
  return Boolean(h && s && h === s);
};

/** Strip /{hostPortal} prefix on dedicated app hosts (app.itsco.health → flat /dashboard). */
const flattenPathForHostPortal = (targetPath, brandingStore) => {
  const raw = String(targetPath || '/').trim() || '/';
  const hostPortal = resolveHostPortalSlug(brandingStore);
  if (!hostPortal) return raw;
  const prefix = `/${hostPortal}`;
  if (raw === prefix || raw.startsWith(`${prefix}/`)) {
    return raw === prefix ? '/' : raw.slice(prefix.length) || '/';
  }
  return raw;
};

const routes = [
  // Public school finder (no auth). Must be before "/:organizationSlug".
  {
    path: '/schools',
    name: 'SchoolFinder',
    component: () => import('../views/school/SchoolFinderView.vue'),
    meta: { requiresGuest: false }
  },
  // Public school referral packet finder (tenant-branded). Must be before catch-all org routes.
  {
    path: '/:organizationSlug/school-referral',
    name: 'PublicSchoolReferralFinder',
    component: () => import('../views/school/PublicSchoolReferralFinderView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicSchoolReferral: true }
  },
  {
    path: '/:organizationSlug/district-schedule/:districtSlug?',
    name: 'PublicDistrictSchedule',
    component: () => import('../views/school/PublicDistrictScheduleView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicDistrictSchedule: true }
  },
  // Public marketing hub — optional markdown subpages (must be before single-segment /p/:hubSlug).
  {
    path: '/p/:hubSlug/:subPageSlug',
    name: 'PublicMarketingHubSubPage',
    component: () => import('../views/public/PublicMarketingHubSubPageView.vue'),
    meta: { requiresGuest: false, publicMarketingHub: true }
  },
  // Public marketing hub — namespace /p/:hubSlug (multi-agency events + hub branding). Must stay before /:organizationSlug.
  {
    path: '/p/:hubSlug',
    name: 'PublicMarketingHub',
    component: () => import('../views/public/PublicMarketingHubView.vue'),
    meta: { requiresGuest: false, publicMarketingHub: true }
  },
  {
    path: '/intake/:publicKey',
    name: 'PublicIntakeSigning',
    component: () => import('../views/PublicIntakeSigningView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/preferences-form/:publicKey',
    name: 'PublicPreferencesForm',
    component: () => import('../views/PublicPreferencesFormView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/quick-view/d/:token',
    name: 'QuickViewDeliveryAccess',
    component: () => import('../views/QuickViewAccessView.vue'),
    meta: { requiresGuest: false, publicQuickView: true, quickViewDelivery: true, hideNav: true }
  },
  {
    path: '/d/:token',
    name: 'QuickViewDeliveryShort',
    component: () => import('../views/QuickViewAccessView.vue'),
    meta: { requiresGuest: false, publicQuickView: true, quickViewDelivery: true, hideNav: true }
  },
  {
    path: '/quick-view',
    name: 'QuickViewLauncher',
    component: () => import('../views/QuickViewLauncherView.vue'),
    meta: { requiresGuest: false, publicQuickView: true, hideNav: true }
  },
  {
    path: '/qv',
    name: 'QuickViewHomeAlias',
    component: () => import('../views/QuickViewLauncherView.vue'),
    meta: { requiresGuest: false, publicQuickView: true, hideNav: true }
  },
  {
    path: '/t/:token',
    name: 'QuickViewTokenShort',
    component: () => import('../views/QuickViewAccessView.vue'),
    meta: { requiresGuest: false, publicQuickView: true, hideNav: true }
  },
  {
    path: '/quick-view/:token',
    name: 'QuickViewAccess',
    component: () => import('../views/QuickViewAccessView.vue'),
    meta: { requiresGuest: false, publicQuickView: true, hideNav: true }
  },
  {
    path: '/secure-message/:token',
    name: 'SecureMessageClaim',
    component: () => import('../views/SecureMessageClaimView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/values-alignment',
    name: 'ValuesAlignmentGuest',
    component: () => import('../views/valuesAlignment/ValuesAlignmentAssessmentView.vue'),
    meta: { requiresGuest: false, guestValuesAlignment: true }
  },
  {
    path: '/athlete-readiness',
    name: 'AthleteReadinessGuest',
    component: () => import('../views/athleteReadiness/AthleteReadinessAssessmentView.vue'),
    meta: { requiresGuest: false, guestAthleteReadiness: true }
  },
  {
    path: '/student-success',
    name: 'StudentSuccessGuest',
    component: () => import('../views/studentSuccess/StudentSuccessAssessmentView.vue'),
    meta: { requiresGuest: false, guestStudentSuccess: true }
  },
  {
    path: '/college-readiness',
    name: 'CollegeReadinessGuest',
    component: () => import('../views/collegeReadiness/CollegeReadinessAssessmentView.vue'),
    meta: { requiresGuest: false, guestCollegeReadiness: true }
  },
  {
    path: '/relationship-health',
    name: 'RelationshipHealthGuest',
    component: () => import('../views/relationshipHealth/RelationshipHealthAssessmentView.vue'),
    meta: { requiresGuest: false, guestRelationshipHealth: true }
  },
  {
    path: '/teen-wellbeing',
    name: 'TeenWellBeingGuest',
    component: () => import('../views/teenWellBeing/TeenWellBeingAssessmentView.vue'),
    meta: { requiresGuest: false, guestTeenWellBeing: true }
  },
  {
    path: '/personal-fulfillment',
    name: 'PersonalFulfillmentGuest',
    component: () => import('../views/personalFulfillment/PersonalFulfillmentAssessmentView.vue'),
    meta: { requiresGuest: false, guestPersonalFulfillment: true }
  },
  {
    path: '/digital-wellness',
    name: 'DigitalWellnessGuest',
    component: () => import('../views/digitalWellness/DigitalWellnessAssessmentView.vue'),
    meta: { requiresGuest: false, guestDigitalWellness: true }
  },
  {
    path: '/mens-life',
    name: 'MensLifeGuest',
    component: () => import('../views/mensLife/MensLifeAssessmentView.vue'),
    meta: { requiresGuest: false, guestMensLife: true }
  },
  {
    path: '/marriage-alignment',
    name: 'MarriageAlignmentGuest',
    component: () => import('../views/marriageAlignment/MarriageAlignmentAssessmentView.vue'),
    meta: { requiresGuest: false, guestMarriageAlignment: true }
  },
  {
    path: '/parenting-confidence',
    name: 'ParentingConfidenceGuest',
    component: () => import('../views/parentingConfidence/ParentingConfidenceAssessmentView.vue'),
    meta: { requiresGuest: false, guestParentingConfidence: true }
  },
  {
    path: '/burden-purpose',
    name: 'BurdenPurposeGuest',
    component: () => import('../views/burdenPurpose/BurdenPurposeAssessmentView.vue'),
    meta: { requiresGuest: false, guestBurdenPurpose: true }
  },
  {
    path: '/family-functioning',
    name: 'FamilyFunctioningGuest',
    component: () => import('../views/familyFunctioning/FamilyFunctioningAssessmentView.vue'),
    meta: { requiresGuest: false, guestFamilyFunctioning: true }
  },
  {
    path: '/savage-blueprint',
    name: 'SavageBlueprintGuest',
    component: () => import('../views/savageBlueprint/SavageBlueprintAssessmentView.vue'),
    meta: { requiresGuest: false, guestSavageBlueprint: true }
  },
  {
    path: '/reward-regulation',
    name: 'RewardRegulationGuest',
    component: () => import('../views/rewardRegulation/RewardRegulationAssessmentView.vue'),
    meta: { requiresGuest: false, guestRewardRegulation: true }
  },
  {
    path: '/life-balance',
    name: 'LifeBalanceGuest',
    component: () => import('../views/lifeBalance/LifeBalanceAssessmentView.vue'),
    meta: { requiresGuest: false, guestLifeBalance: true }
  },
  {
    path: '/life-balance-form/:publicKey',
    name: 'LifeBalanceIntakeStart',
    component: () => import('../views/lifeBalance/LifeBalanceAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/lbw/:accessToken',
    name: 'LifeBalancePublicShort',
    component: () => import('../views/lifeBalance/LifeBalanceAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/life-balance/:accessToken',
    name: 'LifeBalancePublic',
    component: () => import('../views/lifeBalance/LifeBalanceAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/life-balance/assessment/:assessmentId',
    name: 'LifeBalanceAuthAssessmentGlobal',
    component: () => import('../views/lifeBalance/LifeBalanceAssessmentView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/:organizationSlug/life-balance/assessment/:assessmentId',
    name: 'LifeBalanceAuthAssessment',
    component: () => import('../views/lifeBalance/LifeBalanceAssessmentView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },

  // Assessment Deliverables Hub — assigned token routes (all 16 families)
  {
    path: '/values-alignment/:accessToken',
    name: 'ValuesAlignmentToken',
    component: () => import('../views/valuesAlignment/ValuesAlignmentAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/values-alignment/:accessToken',
    name: 'ValuesAlignmentTokenOrg',
    component: () => import('../views/valuesAlignment/ValuesAlignmentAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/teen-wellbeing/:accessToken',
    name: 'TeenWellBeingToken',
    component: () => import('../views/teenWellBeing/TeenWellBeingAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/teen-wellbeing/:accessToken',
    name: 'TeenWellBeingTokenOrg',
    component: () => import('../views/teenWellBeing/TeenWellBeingAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/personal-fulfillment/:accessToken',
    name: 'PersonalFulfillmentToken',
    component: () => import('../views/personalFulfillment/PersonalFulfillmentAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/personal-fulfillment/:accessToken',
    name: 'PersonalFulfillmentTokenOrg',
    component: () => import('../views/personalFulfillment/PersonalFulfillmentAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/digital-wellness/:accessToken',
    name: 'DigitalWellnessToken',
    component: () => import('../views/digitalWellness/DigitalWellnessAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/digital-wellness/:accessToken',
    name: 'DigitalWellnessTokenOrg',
    component: () => import('../views/digitalWellness/DigitalWellnessAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/mens-life/:accessToken',
    name: 'MensLifeToken',
    component: () => import('../views/mensLife/MensLifeAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/mens-life/:accessToken',
    name: 'MensLifeTokenOrg',
    component: () => import('../views/mensLife/MensLifeAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/marriage-alignment/:accessToken',
    name: 'MarriageAlignmentToken',
    component: () => import('../views/marriageAlignment/MarriageAlignmentAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/marriage-alignment/:accessToken',
    name: 'MarriageAlignmentTokenOrg',
    component: () => import('../views/marriageAlignment/MarriageAlignmentAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/parenting-confidence/:accessToken',
    name: 'ParentingConfidenceToken',
    component: () => import('../views/parentingConfidence/ParentingConfidenceAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/parenting-confidence/:accessToken',
    name: 'ParentingConfidenceTokenOrg',
    component: () => import('../views/parentingConfidence/ParentingConfidenceAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/burden-purpose/:accessToken',
    name: 'BurdenPurposeToken',
    component: () => import('../views/burdenPurpose/BurdenPurposeAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/burden-purpose/:accessToken',
    name: 'BurdenPurposeTokenOrg',
    component: () => import('../views/burdenPurpose/BurdenPurposeAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/family-functioning/:accessToken',
    name: 'FamilyFunctioningToken',
    component: () => import('../views/familyFunctioning/FamilyFunctioningAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/family-functioning/:accessToken',
    name: 'FamilyFunctioningTokenOrg',
    component: () => import('../views/familyFunctioning/FamilyFunctioningAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/savage-blueprint/:accessToken',
    name: 'SavageBlueprintToken',
    component: () => import('../views/savageBlueprint/SavageBlueprintAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/savage-blueprint/:accessToken',
    name: 'SavageBlueprintTokenOrg',
    component: () => import('../views/savageBlueprint/SavageBlueprintAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/reward-regulation/:accessToken',
    name: 'RewardRegulationToken',
    component: () => import('../views/rewardRegulation/RewardRegulationAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/reward-regulation/:accessToken',
    name: 'RewardRegulationTokenOrg',
    component: () => import('../views/rewardRegulation/RewardRegulationAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/athlete-readiness/:accessToken',
    name: 'AthleteReadinessToken',
    component: () => import('../views/athleteReadiness/AthleteReadinessAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/athlete-readiness/:accessToken',
    name: 'AthleteReadinessTokenOrg',
    component: () => import('../views/athleteReadiness/AthleteReadinessAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/student-success/:accessToken',
    name: 'StudentSuccessToken',
    component: () => import('../views/studentSuccess/StudentSuccessAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/student-success/:accessToken',
    name: 'StudentSuccessTokenOrg',
    component: () => import('../views/studentSuccess/StudentSuccessAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/college-readiness/:accessToken',
    name: 'CollegeReadinessToken',
    component: () => import('../views/collegeReadiness/CollegeReadinessAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/college-readiness/:accessToken',
    name: 'CollegeReadinessTokenOrg',
    component: () => import('../views/collegeReadiness/CollegeReadinessAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/relationship-health/:accessToken',
    name: 'RelationshipHealthToken',
    component: () => import('../views/relationshipHealth/RelationshipHealthAssessmentView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/relationship-health/:accessToken',
    name: 'RelationshipHealthTokenOrg',
    component: () => import('../views/relationshipHealth/RelationshipHealthAssessmentView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/careers',
    name: 'PublicCareersHost',
    component: () => import('../views/public/PublicCareersView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/careers/jobs/:jobId',
    name: 'PublicJobDescriptionHost',
    component: () => import('../views/public/PublicJobDescriptionView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/careers/:agencySlug/jobs/:jobId',
    name: 'PublicJobDescription',
    component: () => import('../views/public/PublicJobDescriptionView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/careers/:agencySlug',
    name: 'PublicCareers',
    component: () => import('../views/public/PublicCareersView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/public/hiring/reference/:token',
    name: 'HiringReferenceForm',
    component: () => import('../views/public/HiringReferenceFormView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/i/:publicKey',
    name: 'PublicIntakeSigningShort',
    component: () => import('../views/PublicIntakeSigningView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/registration-receipt/:submissionId',
    name: 'RegistrationReceipt',
    component: () => import('../views/public/RegistrationReceiptView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/school-onboarding/start/:token',
    name: 'SchoolOnboardingStart',
    component: () => import('../views/schoolOnboarding/SchoolOnboardingStartView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/school-onboarding/login',
    redirect: '/login'
  },
  {
    path: '/school-onboarding/demo',
    name: 'SchoolOnboardingStandaloneDemo',
    component: () => import('../views/schoolOnboarding/SchoolOnboardingDemoView.vue'),
    meta: { requiresGuest: false, schoolOnboardingStandaloneDemo: true }
  },
  {
    path: '/school-onboarding/:token/demo',
    name: 'SchoolOnboardingDemo',
    component: () => import('../views/schoolOnboarding/SchoolOnboardingDemoView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/school-onboarding/:token/:step?',
    name: 'SchoolOnboarding',
    component: () => import('../views/schoolOnboarding/SchoolOnboardingShellView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/school-reinit/:token',
    name: 'SchoolReinitPublic',
    component: () => import('../views/public/SchoolReinitPublicView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/school-reinit/:token',
    name: 'OrganizationSchoolReinitPublic',
    component: () => import('../views/public/SchoolReinitPublicView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/provider-year-update/:token',
    name: 'ProviderYearUpdatePublic',
    component: () => import('../views/public/ProviderYearUpdatePublicView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/client-renewal/:token',
    name: 'PublicClientRenewal',
    component: () => import('../views/public/PublicClientRenewalView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/client-renewal/:token',
    name: 'OrganizationPublicClientRenewal',
    component: () => import('../views/public/PublicClientRenewalView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/client-action/:token',
    name: 'ProviderActionPublic',
    component: () => import('../views/public/ProviderActionPublicView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/ca/:token',
    name: 'ProviderActionPublicShort',
    component: () => import('../views/public/ProviderActionPublicView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/client-action/:token',
    name: 'OrganizationProviderActionPublic',
    component: () => import('../views/public/ProviderActionPublicView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/provider-year-update/:token',
    name: 'OrganizationProviderYearUpdatePublic',
    component: () => import('../views/public/ProviderYearUpdatePublicView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },

  {
    path: '/provider-update/:token',
    name: 'ProviderUpdatePublic',
    component: () => import('../views/public/ProviderUpdatePublicView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/provider-update/:token',
    name: 'OrganizationProviderUpdatePublic',
    component: () => import('../views/public/ProviderUpdatePublicView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/admin-update/:token',
    name: 'AdminUpdatePublic',
    component: () => import('../views/public/AdminUpdatePublicView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/:organizationSlug/admin-update/:token',
    name: 'OrganizationAdminUpdatePublic',
    component: () => import('../views/public/AdminUpdatePublicView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/event-rsvp/:token',
    name: 'CompanyEventRsvp',
    component: () => import('../views/public/CompanyEventRsvpView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/company-events/:eventId',
    name: 'CompanyEventPublic',
    component: () => import('../views/public/CompanyEventPublicView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/find-provider/:agencyId',
    name: 'PublicProviderFinder',
    component: () => import('../views/PublicProviderFinderView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/supervision/sessions/:sessionId/presentation',
    name: 'SupervisionPresentation',
    component: () => import('../views/supervision/SupervisionPresentationBuilderView.vue'),
    meta: { requiresAuth: true }
  },
  // Join supervision (no org slug): resolve session → redirect to /{slug}/join/supervision/:id
  {
    path: '/join/supervision/:sessionId',
    name: 'JoinSupervision',
    component: () => import('../views/supervision/JoinSupervisionView.vue'),
    meta: { requiresGuest: false }
  },
  // Join team meeting (no org slug): resolve event → redirect to /{slug}/join/team-meeting/:id
  {
    path: '/join/team-meeting/:eventId',
    name: 'JoinTeamMeeting',
    component: () => import('../views/teamMeeting/JoinTeamMeetingView.vue'),
    meta: { requiresGuest: false }
  },
  // Public upcoming event listings (no auth; agency slug must match agencies.slug)
  {
    path: '/open-events/:agencySlug',
    name: 'PublicAgencyEventsOpen',
    component: () => import('../views/public/PublicAgencyEventsView.vue'),
    meta: { requiresGuest: false, publicAgencyEventsOpen: true }
  },
  {
    path: '/open-events/:agencySlug/enroll',
    name: 'PublicAgencyEnrollOpen',
    component: () => import('../views/public/PublicAgencyEnrollView.vue'),
    meta: { requiresGuest: false, publicAgencyEnrollOpen: true }
  },
  {
    path: '/open-events/:agencySlug/skill-builders',
    name: 'PublicOpenEventsLegacySkillBuilders',
    component: () => import('../views/public/PublicOpenEventsLegacyRedirectView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/open-events/:agencySlug/programs/:programSlug/events',
    name: 'PublicProgramEventsOpen',
    component: () => import('../views/public/PublicSkillBuildersProgramEventsView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/open-events/:agencySlug/programs/:programSlug/enroll',
    name: 'PublicProgramEnrollOpen',
    component: () => import('../views/public/PublicProgramEnrollHubView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/open-events/:agencySlug/kiosk',
    redirect: (to) => `/${to.params.agencySlug}/kiosk`,
    meta: { requiresGuest: false }
  },
  {
    path: '/terms',
    name: 'LegalTerms',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'terms' }
  },
  {
    path: '/privacypolicy',
    name: 'LegalPrivacyPolicy',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'privacypolicy' }
  },
  {
    path: '/publicproof',
    name: 'LegalPublicProof',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'publicproof' }
  },
  {
    path: '/platformhipaa',
    name: 'LegalPlatformHipaa',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'platformhipaa' }
  },
  {
    path: '/support',
    name: 'PublicSupport',
    // Dedicated tenant hosts (app.itsco.health) flatten /itsco/support → /support.
    // That flat path is the SSTC/platform page only on Summit hosts — not counseling tenants.
    component: () => {
      const host = resolveHostPortalSlug();
      if (host && !isSummitPlatformRouteSlug(host) && !isSstcTenantSlug(host)) {
        return import('../views/public/AgencyPublicSupportView.vue');
      }
      return import('../views/public/SupportView.vue');
    },
    meta: { requiresGuest: false }
  },
  {
    path: '/support/:agencySlug',
    name: 'AgencyPublicSupportAlias',
    component: () => import('../views/public/AgencyPublicSupportView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/terms',
    name: 'OrganizationLegalTerms',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'terms', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/privacypolicy',
    name: 'OrganizationLegalPrivacyPolicy',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'privacypolicy', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/publicproof',
    name: 'OrganizationLegalPublicProof',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'publicproof', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/platformhipaa',
    name: 'OrganizationLegalPlatformHipaa',
    component: () => import('../views/public/LegalDocumentView.vue'),
    meta: { requiresGuest: false, legalDocType: 'platformhipaa', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/support',
    name: 'OrganizationPublicSupport',
    component: () => import('../views/public/AgencyPublicSupportView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/communications',
    name: 'PublicCommunicationsProof',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/communications',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/admin/communications/feed`,
      query: { ...to.query, tab: to.query?.tab || 'proof' }
    }),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  // Branded program events (portal slug = agencies.slug on the program org)
  {
    path: '/:organizationSlug/programs/:programSlug/events',
    name: 'PublicProgramEvents',
    component: () => import('../views/public/PublicSkillBuildersProgramEventsView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicSkillBuildersEventsBranding: true }
  },
  {
    path: '/:organizationSlug/programs/:programSlug/enroll',
    name: 'PublicProgramEnroll',
    component: () => import('../views/public/PublicProgramEnrollHubView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicSkillBuildersProgramEnrollBranding: true }
  },
  {
    path: '/:organizationSlug/kiosk',
    name: 'OrganizationSkillBuildersEventKioskEntry',
    component: () => import('../views/KioskEntryView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/skill-builders/kiosk/:eventId',
    name: 'OrganizationSkillBuildersEventKioskStation',
    component: () => import('../views/public/PublicSkillBuildersEventKioskStationView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    // Program-event kiosk station (non–Skill Builders events). Reached
    // automatically from the shared /:organizationSlug/kiosk PIN entry
    // when the unlocked event's `kind` is `program_event`. Has its own
    // path so a coordinator can also bookmark / scan-QR straight into a
    // station for a specific event.
    path: '/:organizationSlug/program-event/kiosk/:eventId',
    name: 'OrganizationProgramEventKioskStation',
    component: () => import('../views/public/PublicProgramEventKioskStationView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/event-day-kiosk',
    name: 'OrganizationEventDayKiosk',
    component: () => import('../views/public/PublicEventDayKioskView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/school-events/kiosk',
    name: 'OrganizationSchoolEventsKiosk',
    component: () => import('../views/public/PublicSchoolEventsKioskView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/school-events/kiosk',
    name: 'FlatSchoolEventsKiosk',
    component: () => import('../views/public/PublicSchoolEventsKioskView.vue'),
    meta: { requiresGuest: false, flatEventKiosk: true }
  },
  // Public services hub + finder pages (counseling, tutoring)
  {
    path: '/:organizationSlug/services',
    name: 'PublicAgencyServicesHub',
    component: () => import('../views/public/PublicAgencyServicesHubView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/find-counselor',
    name: 'PublicCounselorFinder',
    component: () => import('../views/public/PublicCounselorFinderView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/choose-provider',
    name: 'PublicChooseProvider',
    component: () => import('../views/public/PublicChooseProviderView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/find-tutor',
    name: 'PublicTutorFinder',
    component: () => import('../views/public/PublicTutorFinderView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/find-coach',
    name: 'PublicCoachFinder',
    component: () => import('../views/public/PublicCoachFinderGate.vue'),
    meta: { requiresGuest: false, organizationSlug: true, serviceType: 'coaching' }
  },
  {
    path: '/:organizationSlug/find-consultant',
    name: 'PublicConsultantFinder',
    component: () => import('../views/public/PublicPractitionerBookingView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, serviceType: 'consulting' }
  },
  {
    path: '/:organizationSlug/book/:providerId',
    name: 'PublicProviderBook',
    component: () => import('../views/public/PublicPractitionerBookingView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicProviderBook: true }
  },
  {
    path: '/:organizationSlug/book-session',
    name: 'PublicUnifiedBooking',
    component: () => import('../views/public/PublicUnifiedBookingView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicUnifiedBooking: true }
  },

  {
    path: '/:organizationSlug/discovery/:token',
    name: 'PublicDiscoverySession',
    component: () => import('../views/public/PublicDiscoverySessionView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicDiscovery: true }
  },
  // Short public URL: /{agencySlug}/events (same data as /open-events/{agencySlug})
  {
    path: '/:organizationSlug/events',
    name: 'PublicAgencyEventsBranded',
    component: () => import('../views/public/PublicAgencyEventsView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicAgencyEventsBranding: true }
  },
  {
    path: '/:organizationSlug/enroll',
    name: 'PublicAgencyEnrollBranded',
    component: () => import('../views/public/PublicAgencyEnrollView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicAgencyEnrollBranding: true }
  },
  // Flat event kiosk routes for custom-domain portals (app.{agency}.health strips /{slug} prefix).
  // Must stay before /:organizationSlug so /kiosk is not mistaken for org slug "kiosk" → /kiosk/login.
  {
    path: '/kiosk',
    name: 'FlatEventKioskEntry',
    component: () => import('../views/KioskEntryView.vue'),
    meta: { requiresGuest: false, flatEventKiosk: true }
  },
  {
    path: '/skill-builders/kiosk/:eventId',
    name: 'FlatSkillBuildersEventKioskStation',
    component: () => import('../views/public/PublicSkillBuildersEventKioskStationView.vue'),
    meta: { requiresGuest: false, flatEventKiosk: true }
  },
  {
    path: '/program-event/kiosk/:eventId',
    name: 'FlatProgramEventKioskStation',
    component: () => import('../views/public/PublicProgramEventKioskStationView.vue'),
    meta: { requiresGuest: false, flatEventKiosk: true }
  },
  {
    path: '/school-referral',
    name: 'FlatPublicSchoolReferralFinder',
    component: () => import('../views/school/PublicSchoolReferralFinderView.vue'),
    meta: { requiresGuest: false, flatSchoolReferral: true, publicSchoolReferral: true }
  },
  {
    path: '/district-schedule/:districtSlug?',
    name: 'FlatPublicDistrictSchedule',
    component: () => import('../views/school/PublicDistrictScheduleView.vue'),
    meta: { requiresGuest: false, flatDistrictSchedule: true, publicDistrictSchedule: true }
  },
  // Organization-specific routes (supports Agency, School, Program, Learning)
  // Root org path redirects directly to the branded login page — splash was removed.
  {
    path: '/:organizationSlug',
    redirect: (to) => ({ path: `/${to.params.organizationSlug}/login` })
  },
  // Child portal login under agency path: /itsco/rudy/login (matches before flat /:slug/login).
  {
    path: '/:parentOrgSlug/:organizationSlug/login',
    name: 'ParentOrganizationLogin',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true, organizationSlug: true, parentOrgSlug: true }
  },
  {
    path: '/:organizationSlug/login',
    name: 'OrganizationLogin',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/signup',
    name: 'OrganizationParticipantSignup',
    component: () => import('../views/ParticipantSignupView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/signup/club-manager',
    name: 'OrganizationClubManagerSignup',
    component: () => import('../views/ClubManagerSignupView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/clubs/:clubId',
    name: 'SscPublicClub',
    component: () => import('../views/SstcPublicClubView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/clubs/:clubId/members',
    name: 'SscClubMembersDirectory',
    component: () => import('../views/SstcClubMembersDirectoryView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/clubs/:clubId/records',
    name: 'SscClubTeamRecords',
    component: () => import('../views/SstcClubTeamRecordsView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/clubs',
    name: 'OrganizationClubSearch',
    component: () => import('../views/ClubSearchView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/messages',
    name: 'OrganizationMessages',
    component: () => import('../views/admin/PlatformChatsView.vue'),
    meta: {
      requiresAuth: true,
      organizationSlug: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'provider_plus', 'staff', 'school_staff', 'intern', 'intern_plus', 'supervisor']
    }
  },
  {
    path: '/:organizationSlug/join',
    name: 'SscMemberApplication',
    component: () => import('../views/SstcMemberApplicationView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/verify-club-manager-email',
    name: 'OrganizationVerifyClubManagerEmail',
    component: () => import('../views/VerifyClubManagerEmailView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/upload',
    name: 'ReferralUpload',
    component: () => import('../components/school/ReferralUpload.vue'),
    meta: { organizationSlug: true }
  },
  // Legacy office kiosk login URL → unified /kiosk entry (office tab)
  {
    path: '/kiosk/login',
    name: 'KioskLogin',
    redirect: (to) => ({ path: '/kiosk', query: { ...to.query, mode: 'office' } })
  },
  // Kiosk app (authenticated kiosk users – agency/location selector, then KioskView)
  {
    path: '/kiosk/app',
    name: 'KioskApp',
    component: () => import('../views/KioskAppView.vue'),
    meta: { requiresAuth: true, requiresRole: 'kiosk' }
  },
  // Public kiosk (no auth – backward compatibility)
  {
    path: '/kiosk/:locationId',
    name: 'Kiosk',
    component: () => import('../views/KioskView.vue'),
    meta: { requiresGuest: false }
  },
  // Provider-First Welcome Kiosk (public lobby splash screen)
  {
    path: '/kiosk-welcome/:locationId',
    name: 'KioskWelcome',
    component: () => import('../views/KioskWelcomeView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/new_account/:token',
    name: 'NewAccount',
    component: () => import('../views/InitialSetupView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/passwordless-login/:token',
    name: 'OrganizationPasswordlessTokenLogin',
    component: () => import('../views/PasswordlessTokenLoginView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/reset-password/:token',
    name: 'OrganizationResetPassword',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/change-password',
    name: 'OrganizationChangePassword',
    component: () => import('../views/ChangePasswordView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/join/supervision/:sessionId',
    name: 'OrganizationJoinSupervision',
    component: () => import('../views/supervision/JoinSupervisionView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/supervision/sessions/:sessionId/presentation',
    name: 'OrganizationSupervisionPresentation',
    component: () => import('../views/supervision/SupervisionPresentationBuilderView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/join/team-meeting/:eventId',
    name: 'OrganizationJoinTeamMeeting',
    component: () => import('../views/teamMeeting/JoinTeamMeetingView.vue'),
    // Match supervision join: allow the view to hydrate session / redirect to login
    // with ?redirect= so email & calendar app links do not force a hard logout loop.
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/dashboard',
    name: 'OrganizationDashboard',
    component: () => import('../views/OrganizationDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/client-dashboard',
    name: 'OrganizationPractitionerClientDashboard',
    component: () => import('../views/PractitionerClientDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true, requiresRole: ['client_guardian', 'admin', 'super_admin', 'support'] }
  },
  {
    path: '/:organizationSlug/my_club_dashboard',
    name: 'OrganizationMyClubDashboard',
    component: () => import('../views/SummitStatsDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  // Must be registered before public `/:organizationSlug/bookclub`; otherwise `/admin/book-club` is parsed as
  // organizationSlug "admin" and loads the public reader page (wrong API → "Book Club not found").
  {
    path: '/admin/book-club',
    name: 'AdminBookClubManagementUnscoped',
    component: () => import('../views/admin/BookClubManagementView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/bookclub',
    redirect: '/admin/book-club'
  },
  {
    path: '/:organizationSlug/bookclub',
    name: 'OrganizationBookClubPublic',
    component: () => import('../views/BookClubPublicView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/book-club',
    redirect: (to) => ({ path: `/${to.params.organizationSlug}/bookclub`, query: to.query, hash: to.hash })
  },
  {
    path: '/provider-mobile',
    name: 'ProviderMobileLegacy',
    redirect: () => {
      const slug = getDefaultOrganizationSlug();
      return slug ? `/${slug}/provider-mobile` : '/dashboard';
    },
    meta: { requiresAuth: true }
  },
  {
    path: '/:organizationSlug/provider-mobile',
    component: () => import('../views/provider/ProviderMobileShellView.vue'),
    meta: { requiresAuth: true, organizationSlug: true, requiresProviderMobileAccess: true },
    children: [
      {
        path: '',
        name: 'OrganizationProviderMobile',
        redirect: (to) => `/${to.params.organizationSlug}/provider-mobile/schedule`,
        meta: { requiresAuth: true, organizationSlug: true, requiresProviderMobileAccess: true }
      },
      {
        path: 'schedule',
        name: 'OrganizationProviderMobileSchedule',
        component: () => import('../views/provider/ProviderMobileScheduleView.vue'),
        meta: { requiresAuth: true, organizationSlug: true, requiresProviderMobileAccess: true }
      },
      {
        path: 'payroll',
        name: 'OrganizationProviderMobilePayroll',
        component: () => import('../views/provider/ProviderMobilePayrollView.vue'),
        meta: { requiresAuth: true, organizationSlug: true, requiresProviderMobileAccess: true }
      },
      {
        path: 'note-aid',
        name: 'OrganizationProviderMobileNoteAid',
        component: () => import('../views/provider/ProviderMobileNoteAidView.vue'),
        meta: { requiresAuth: true, organizationSlug: true, requiresProviderMobileAccess: true }
      },
      {
        path: 'communications',
        name: 'OrganizationProviderMobileCommunications',
        component: () => import('../views/provider/ProviderMobileCommunicationsView.vue'),
        meta: { requiresAuth: true, organizationSlug: true, requiresProviderMobileAccess: true }
      }
    ]
  },
  {
    path: '/:organizationSlug/provider/kiosk-questionnaires',
    name: 'OrganizationProviderKioskQuestionnaires',
    component: () => import('../views/provider/ProviderKioskQuestionnairesView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['provider', 'provider_plus', 'intern', 'supervisor', 'clinical_practice_assistant'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/operations-dashboard',
    name: 'OrganizationOperationsDashboard',
    component: () => import('../views/ProviderPlusDashboardView.vue'),
    meta: { requiresAuth: true, requiresRole: [...PROVIDER_PLUS_EXPERIENCE_ROLES, 'admin', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/provider-plus-dashboard',
    name: 'OrganizationProviderPlusDashboardLegacy',
    redirect: (to) => `/${to.params.organizationSlug}/operations-dashboard`,
    meta: { requiresAuth: true, requiresRole: [...PROVIDER_PLUS_EXPERIENCE_ROLES, 'admin', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/providers/:providerUserId',
    name: 'OrganizationSchoolProviderProfile',
    component: () => import('../views/school/ProviderSchoolProfileView.vue'),
    meta: { requiresAuth: true, organizationSlug: true, requiresRole: ['school_staff', 'provider', 'admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'] }
  },
  {
    path: '/:organizationSlug/mydashboard',
    name: 'OrganizationMyDashboardLegacy',
    redirect: (to) => `/${to.params.organizationSlug}/dashboard`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/challenges/:id',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/season/${to.params.id}`,
      query: to.query,
      hash: to.hash
    })
  },
  {
    path: '/:organizationSlug/challenges',
    redirect: (to) => ({ path: `/${to.params.organizationSlug}/my_club_dashboard`, query: to.query, hash: to.hash })
  },
  {
    path: '/:organizationSlug/season/:id',
    name: 'OrganizationSeasonDashboard',
    component: () => import('../views/ChallengeDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/season/:id/team/:teamId',
    name: 'OrganizationTeamDashboard',
    component: () => import('../views/ChallengeTeamDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/season/:classId/draft',
    name: 'ChallengeDraftRoom',
    component: () => import('../components/challenge/ChallengeLiveDraft.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/home',
    name: 'OrganizationSummitHome',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/my_club_dashboard`,
      query: to.query,
      hash: to.hash
    }),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/learning/classes/:classId',
    name: 'OrganizationLearningClassWorkspace',
    component: () => import('../views/learning/LearningClassWorkspaceView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/class-presentation-builder',
    name: 'OrganizationClassPresentationTemplateStudio',
    component: () => import('../views/classroom/ClassPresentationBuilderView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/class-presentation-builder/:eventId',
    name: 'OrganizationClassPresentationBuilder',
    component: () => import('../views/classroom/ClassPresentationBuilderView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/class-presentation-dashboard/:eventId',
    name: 'OrganizationClassPresentationDashboard',
    component: () => import('../views/classroom/ClassPresentationDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/in-person-tutoring-builder/:sessionId?',
    name: 'OrganizationInPersonTutoringBuilder',
    component: () => import('../views/tutoring/InPersonTutoringBuilderView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/in-person-tutoring-session/:sessionId',
    name: 'OrganizationInPersonTutoringSession',
    component: () => import('../views/tutoring/InPersonTutoringSessionView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tutoring-session/:sessionId',
    name: 'OrganizationVirtualTutoringSession',
    component: () => import('../views/tutoring/VirtualTutoringSessionView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/counseling',
    name: 'OrganizationCounselingLobby',
    component: () => import('../views/counseling/CounselingLobbyView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/counseling/practice/:activityId',
    name: 'OrganizationActivityPractice',
    component: () => import('../views/counseling/ActivityPracticeView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/counseling/session/:sessionId',
    name: 'OrganizationCounselingSession',
    component: () => import('../views/counseling/CounselingSessionView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/counseling/join/:sessionId',
    name: 'OrganizationCounselingJoin',
    component: () => import('../views/counseling/CounselingSessionView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/counseling/invite/:token',
    name: 'OrganizationCounselingInvite',
    component: () => import('../views/counseling/CounselingInviteView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/guardian',
    name: 'OrganizationGuardianPortal',
    component: () => import('../views/guardian/GuardianPortalView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/guardian/skill-builders/event/:eventId',
    name: 'OrganizationGuardianSkillBuilderEvent',
    component: () => import('../views/guardian/GuardianSkillBuildersEventView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/guardian/program-event/:eventId',
    name: 'OrganizationGuardianProgramEvent',
    component: () => import('../views/guardian/GuardianSkillBuildersEventView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/guardian/waivers',
    name: 'OrganizationGuardianWaivers',
    component: () => import('../views/guardian/GuardianWaiversView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian', organizationSlug: true }
  },
  // Slug-prefixed authenticated routes (branded portal)
  {
    path: '/:organizationSlug/note-aid',
    name: 'OrganizationNoteAid',
    // Note Aid now runs the Clinical Director Agent note generator.
    component: () => import('../views/admin/ClinicalNoteGeneratorView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: NOTE_AID_EMPLOYEE_ROLES,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/note-aid',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/note-aid`,
      query: to.query,
      hash: to.hash
    }),
    meta: {
      requiresAuth: true,
      requiresRole: NOTE_AID_EMPLOYEE_ROLES,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/session-recording',
    name: 'OrganizationSessionRecording',
    component: () => import('../views/admin/SessionRecordingView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: SESSION_RECORDING_ROUTE_ROLES,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/medical-billing',
    name: 'OrganizationMedicalBilling',
    component: () => import('../views/admin/MedicalBillingView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'super_admin',
        'clinical_practice_assistant',
        'provider_plus',
        'provider',
        'support',
        'staff'
      ],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/preferences',
    name: 'OrganizationPreferences',
    redirect: (to) => `/${to.params.organizationSlug}/dashboard?tab=my&my=preferences`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/credentials',
    name: 'OrganizationCredentials',
    redirect: (to) => `/${to.params.organizationSlug}/dashboard?tab=my&my=credentials`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/buildings',
    component: () => import('../views/OfficeShellView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true },
    children: [
      {
        path: '',
        name: 'OrganizationBuildings',
        redirect: (to) => `/${to.params.organizationSlug}/buildings/schedule`
      },
      {
        path: 'schedule',
        name: 'OrganizationBuildingsSchedule',
        component: () => import('../views/OfficeScheduleView.vue'),
        meta: { requiresAuth: true, organizationSlug: true }
      },
      {
        path: 'review',
        name: 'OrganizationBuildingsReview',
        component: () => import('../views/OfficeReviewView.vue'),
        meta: { requiresAuth: true, organizationSlug: true }
      },
      {
        path: 'settings',
        name: 'OrganizationBuildingsSettings',
        component: () => import('../views/OfficeSettingsView.vue'),
        meta: { requiresAuth: true, organizationSlug: true }
      }
    ]
  },
  // Redirect old office URLs (backward-compatible)
  {
    path: '/:organizationSlug/office',
    name: 'OrganizationOfficeLegacy',
    redirect: (to) => `/${to.params.organizationSlug}/buildings`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/office/schedule',
    name: 'OrganizationOfficeScheduleLegacy2',
    redirect: (to) => `/${to.params.organizationSlug}/buildings/schedule`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/office/settings',
    name: 'OrganizationOfficeSettingsLegacy2',
    redirect: (to) => `/${to.params.organizationSlug}/buildings/settings`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/office/review',
    name: 'OrganizationOfficeReviewLegacy2',
    redirect: (to) => `/${to.params.organizationSlug}/buildings/review`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/my-schedule',
    name: 'OrganizationMySchedule',
    component: () => import('../views/MyScheduleView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/workforce-operations',
    name: 'OrganizationWorkforceOperations',
    component: () => import('../views/ScheduleHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_VIEW_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/school-operations',
    name: 'OrganizationSchoolOperations',
    component: () => import('../views/SchoolOperationsHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/people-operations',
    name: 'OrganizationPeopleOperations',
    component: () => import('../views/PeopleOperationsHubView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  // Legacy redirect: /schedule → /workforce-operations
  {
    path: '/:organizationSlug/schedule',
    name: 'OrganizationScheduleHub',
    redirect: (to) => `/${to.params.organizationSlug}/workforce-operations`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  // Legacy redirect: /admin/caseload-hub (no sub-path) → /school-operations
  {
    path: '/:organizationSlug/admin/caseload-hub',
    name: 'OrganizationCaseloadHubIndex',
    redirect: (to) => `/${to.params.organizationSlug}/school-operations`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/schedule/event-staffing',
    name: 'OrganizationEventStaffingRequests',
    component: () => import('../views/EventStaffingRequestsView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/schedule/staff',
    name: 'OrganizationStaffScheduleCompare',
    component: () => import('../views/StaffScheduleCompareView.vue'),
    meta: { requiresAuth: true, organizationSlug: true, requiresRole: STAFF_SCHEDULE_COMPARE_ROLES }
  },
  {
    path: '/:organizationSlug/schedule/board/:locationId',
    name: 'OrganizationOfficeScheduleBoard',
    component: () => import('../views/OfficeScheduleBoardView.vue'),
    meta: { requiresGuest: false, organizationSlug: true } // public (access-key protected via backend)
  },
  {
    path: '/:organizationSlug/module/:id',
    name: 'OrganizationModule',
    component: () => import('../views/ModuleView.vue'),
    meta: { requiresAuth: true, blockPendingUsers: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tracks',
    name: 'OrganizationTracks',
    redirect: (to) => `/${to.params.organizationSlug}/my-learning`
  },
  {
    path: '/:organizationSlug/my-learning',
    name: 'OrganizationMyLearning',
    component: () => import('../views/MyLearningView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canViewTraining', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/training-focuses/:id',
    name: 'OrganizationTrainingFocusLaunch',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/my-learning`,
      query: { focusId: to.params.id }
    })
  },
  {
    path: '/:organizationSlug/tasks',
    name: 'OrganizationTasks',
    component: () => import('../views/TasksView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tasks/projects/:projectId',
    name: 'OrganizationTaskProject',
    component: () => import('../views/ProjectWorkspaceView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tasks/lists/:listId',
    name: 'OrganizationSharedListWorkspace',
    component: () => import('../views/SharedListWorkspaceView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tasks/documents/:taskId/sign',
    name: 'OrganizationDocumentSigning',
    component: () => import('../views/DocumentSigningView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tasks/documents/:taskId/review',
    name: 'OrganizationDocumentReview',
    component: () => import('../views/DocumentSigningView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tasks/documents/:taskId/print',
    name: 'OrganizationDocumentPrint',
    component: () => import('../views/LetterPrintView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/onboarding',
    name: 'OrganizationOnboardingChecklist',
    component: () => import('../views/OnboardingChecklistView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/account-info',
    name: 'OrganizationAccountInfo',
    redirect: (to) => `/${to.params.organizationSlug}/dashboard?tab=my&my=account`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/on-demand-training',
    name: 'OrganizationOnDemandTrainingLibrary',
    redirect: (to) => `/${to.params.organizationSlug}/my-learning`
  },
  {
    path: '/:organizationSlug/on-demand-training/modules/:id',
    name: 'OrganizationOnDemandModuleView',
    component: () => import('../components/on-demand/OnDemandModuleViewer.vue'),
    meta: { requiresAuth: true, requiresApprovedEmployee: true, requiresCapability: 'canViewTraining', organizationSlug: true }
  },
  // Slug-prefixed admin routes
  {
    path: '/:organizationSlug/club_manager_dashboard',
    name: 'OrganizationClubManagerDashboard',
    component: () => import('../views/admin/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['club_manager', 'assistant_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin',
    name: 'OrganizationAdminDashboard',
    component: () => import('../views/admin/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'club_manager', 'provider_plus', 'clinical_practice_assistant'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin-dashboard',
    name: 'OrganizationTenantAdminDashboard',
    component: () => import('../views/admin/TenantAdminDashboard.vue'),
    meta: { 
      requiresAuth: true, 
      requiresRole: ['admin', 'support', 'super_admin', 'club_manager', 'provider_plus', 'clinical_practice_assistant'], 
      organizationSlug: true 
    }
  },
  {
    path: '/admin-dashboard',
    name: 'TenantAdminDashboard',
    component: () => import('../views/admin/AdminDashboardBetaRouter.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'club_manager', 'provider_plus', 'clinical_practice_assistant'],
      platformCommandCenter: true
    }
  },
  {
    path: '/:organizationSlug/admin/modules',
    name: 'OrganizationModuleManager',
    component: () => import('../views/admin/ModuleManager.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], requiresCapability: 'canViewTraining', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/checklist-items',
    name: 'OrganizationChecklistItems',
    component: () => import('../views/admin/ChecklistItemsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/modules/:id/builder',
    name: 'OrganizationCourseBuilder',
    component: () => import('../views/admin/CourseBuilderView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], requiresCapability: 'canViewTraining', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/modules/:id/content-editor',
    name: 'OrganizationModuleContentEditor',
    redirect: (to) => ({
      name: 'OrganizationCourseBuilder',
      params: { organizationSlug: to.params.organizationSlug, id: to.params.id }
    })
  },
  {
    path: '/:organizationSlug/admin/digital-forms',
    name: 'OrganizationDigitalForms',
    component: () => import('../views/admin/IntakeLinksView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/surveys',
    name: 'OrganizationSurveyBuilder',
    component: () => import('../views/admin/SurveyBuilderView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'club_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/book-club',
    name: 'OrganizationBookClubManagement',
    component: () => import('../views/admin/BookClubManagementView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/company-events',
    name: 'OrganizationCompanyEvents',
    component: () => import('../views/admin/CompanyEventsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'club_manager', 'provider', 'intern'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/admin-meetings',
    name: 'OrganizationAdminMeetingsLog',
    component: () => import('../views/admin/AdminMeetingsLogView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'assistant_admin', 'clinical_practice_assistant'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/facilitator-availability',
    name: 'OrganizationFacilitatorAvailability',
    component: () => import('../views/admin/FacilitatorAvailabilityView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/facilitator-availability/:requestId',
    name: 'OrganizationFacilitatorAvailabilityForm',
    component: () => import('../views/FacilitatorAvailabilityFormView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/surveys/:id/results',
    name: 'OrganizationSurveyResults',
    component: () => import('../views/admin/SurveyResultsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'club_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/intake-links',
    redirect: (to) => ({ path: `/${to.params.organizationSlug}/admin/digital-forms` })
  },
  {
    path: '/:organizationSlug/admin/users/:userId',
    name: 'OrganizationUserProfile',
    component: () => import('../views/admin/UserProfileView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'club_manager', 'clinical_practice_assistant'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/users',
    name: 'OrganizationUserManager',
    component: () => import('../views/admin/UserManager.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'club_manager', 'clinical_practice_assistant'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/announcements',
    name: 'OrganizationAnnouncementsHub',
    component: () => import('../views/admin/AnnouncementsHubView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'staff', 'club_manager', 'clinical_practice_assistant'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/guardians',
    name: 'OrganizationGuardiansManagement',
    component: () => import('../views/admin/GuardiansView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/clients/:clientId(\\d+)',
    name: 'OrganizationClientProfile',
    component: () => import('../views/admin/ClientProfileView.vue'),
    meta: { requiresAuth: true, requiresRole: CLIENT_RECORD_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/clients',
    name: 'OrganizationClientManagement',
    component: () => import('../views/admin/ClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: CLIENT_RECORD_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/referral-directory',
    name: 'OrganizationReferralDirectory',
    component: () => import('../views/admin/ReferralDirectoryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/clinical-note-generator',
    name: 'OrganizationClinicalNoteGenerator',
    redirect: (to) => `/${to.params.organizationSlug}/note-aid`,
    meta: {
      requiresAuth: true,
      requiresRole: NOTE_AID_EMPLOYEE_ROLES,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/schools/import',
    name: 'OrganizationSchoolContactsImport',
    component: () => import('../views/admin/SchoolContactsImportView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/schools/overview',
    name: 'OrganizationSchoolOverviewDashboard',
    component: () => import('../views/admin/SchoolOverviewDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-reinit/:schoolOrganizationId',
    name: 'OrganizationSchoolReinitAdmin',
    component: () => import('../views/admin/SchoolReinitAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-portals',
    name: 'OrganizationSchoolPortals',
    component: () => import('../views/admin/SchoolOverviewDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-portals-hub',
    name: 'OrganizationSchoolPortalsHub',
    component: () => import('../views/admin/SchoolPortalsHubView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/provider-year-update',
    name: 'OrganizationProviderYearUpdateAdmin',
    component: () => import('../views/admin/ProviderYearUpdateAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },

  {
    path: '/:organizationSlug/admin/provider-update',
    name: 'OrganizationProviderUpdateAdmin',
    component: () => import('../views/admin/ProviderUpdateAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-reports',
    name: 'OrganizationSchoolReports',
    component: () => import('../views/admin/SchoolReportsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/unfinished-digital-forms',
    name: 'OrganizationUnfinishedDigitalForms',
    component: () => import('../views/admin/UnfinishedDigitalFormsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-onboarding',
    name: 'OrganizationSchoolOnboardingAdmin',
    component: () => import('../views/admin/SchoolOnboardingAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/client-exchange',
    name: 'OrganizationClientExchange',
    component: () => import('../views/ClientExchangeView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: CLIENT_EXCHANGE_ROLES,
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/office-intake-queue',
    name: 'OrganizationOfficeIntakeQueue',
    component: () => import('../views/admin/OfficeIntakeQueueView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/office-intake',
    name: 'OrganizationPublicOfficeIntake',
    component: () => import('../views/public/PublicOfficeIntakeView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/join-intake',
    name: 'OrganizationAdaptiveJoinAlt',
    component: () => import('../views/public/AdaptiveJoinHubView.vue'),
    meta: { requiresGuest: false, hideNav: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/materials-requests',
    name: 'OrganizationMaterialsRequests',
    component: () => import('../views/admin/MaterialsRequestsView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/caseload-hub/schools-staff',
    name: 'OrganizationCaseloadHubSchoolsStaff',
    component: () => import('../views/admin/caseload-hub/CaseloadHubSchoolsStaffView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider_plus',
        'provider',
        'clinical_practice_assistant',
        'schedule_manager',
        'supervisor'
      ],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/caseload-hub/events',
    name: 'OrganizationCaseloadHubEvents',
    component: () => import('../views/admin/caseload-hub/CaseloadHubEventsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider_plus',
        'provider',
        'clinical_practice_assistant'
      ],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/caseload-hub/calendar',
    name: 'OrganizationCaseloadHubCalendar',
    component: () => import('../views/admin/caseload-hub/CaseloadHubCalendarView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider_plus',
        'provider',
        'clinical_practice_assistant'
      ],
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/outreach-hub',
    name: 'OrganizationOutreachHub',
    component: () => import('../views/admin/OutreachHubView.vue'),
    meta: {
      requiresAuth: true,
      requiresCapability: 'canAccessOutreach',
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/settings',
    name: 'OrganizationSettings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/public-services',
    name: 'OrganizationPublicServices',
    component: () => import('../views/admin/PublicServicesAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/session-packages',
    name: 'OrganizationSessionPackages',
    component: () => import('../views/admin/PractitionerPackagesAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/package-catalog',
    name: 'OrganizationPackageCatalog',
    component: () => import('../views/admin/PackageCatalogAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/packet/:token',
    name: 'PublicPractitionerPacket',
    component: () => import('../views/public/PublicPractitionerPacketView.vue'),
    meta: { requiresGuest: false, organizationSlug: true, publicPacket: true }
  },
  {
    path: '/:organizationSlug/admin/club-settings',
    name: 'OrganizationClubSettings',
    component: () => import('../views/admin/ClubSettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/club/settings',
    name: 'OrganizationClubSettingsScoped',
    component: () => import('../views/admin/ClubSettingsView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/club/seasons',
    name: 'OrganizationClubSeasonManagement',
    component: () => import('../components/admin/ChallengeManagement.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications',
    name: 'OrganizationCommunicationsHub',
    component: () => import('../views/admin/CommunicationsCenterView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/email-settings',
    name: 'OrganizationAutomatedEmailSettings',
    component: () => import('../views/admin/AutomatedEmailSettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'super_admin', 'support'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/communications/feed',
    name: 'OrganizationCommunicationsFeed',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff'],
      organizationSlug: true
    }
  },
  {
    // Legacy SMS hub → unified Home (SMS channel + deep link)
    path: '/:organizationSlug/admin/communications/sms',
    name: 'OrganizationCommunicationsSms',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/admin/communications`,
      query: {
        mode: 'home',
        channel: 'sms',
        ...(to.query.clientId ? { smsClientId: to.query.clientId } : {}),
        ...(to.query.contactId ? { smsContactId: to.query.contactId } : {})
      }
    }),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/tools-aids',
    name: 'OrganizationToolsAids',
    component: () => import('../views/admin/ToolsAidsView.vue'),
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/tools-aids',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/tools-aids`,
      query: to.query,
      hash: to.hash
    }),
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications/messages',
    name: 'OrganizationAdminMessages',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/messages`,
      query: { ...to.query }
    })
  },
  {
    path: '/:organizationSlug/admin/communications/chats',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/messages`,
      query: { ...to.query }
    })
  },
  {
    path: '/:organizationSlug/admin/communications/campaigns',
    name: 'OrganizationAgencyCampaigns',
    component: () => import('../views/admin/AgencyCampaignsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'school_staff', 'provider', 'clinical_practice_assistant', 'supervisor', 'schedule_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications/thread/:userId/:clientId',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/admin/communications`,
      query: { mode: 'home', channel: 'sms', smsClientId: to.params.clientId }
    })
  },
  {
    path: '/:organizationSlug/admin/contacts',
    name: 'OrganizationContacts',
    component: () => import('../views/admin/ContactsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider', 'provider_plus', 'clinical_practice_assistant', 'schedule_manager'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/schedule-approvals',
    name: 'OrganizationOfficeScheduleApprovals',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/admin/availability-intake`,
      query: { ...to.query, tab: to.query?.tab || 'booking' }
    })
  },
  {
    path: '/:organizationSlug/admin/external-calendar-audit',
    name: 'OrganizationExternalCalendarAudit',
    component: () => import('../views/admin/ExternalCalendarAuditView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/booking-conflict-resolver',
    name: 'OrganizationOfficeBookingConflictResolver',
    component: () => import('../views/admin/OfficeBookingConflictResolverView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/schedule-audit',
    name: 'OrganizationOfficeScheduleAudit',
    component: () => import('../views/admin/OfficeScheduleAuditView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/office-coverage-flags',
    name: 'OrganizationOfficeCoverageFlags',
    component: () => import('../views/admin/OfficeCoverageFlagsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/provider-availability',
    name: 'OrganizationProviderAvailabilityDashboard',
    component: () => import('../views/admin/ProviderAvailabilityDashboardView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider_plus'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/school-clients',
    name: 'OrganizationSchoolClients',
    component: () => import('../views/admin/SchoolClientsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'staff', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/client-onboarding',
    name: 'OrganizationClientOnboardingWorkspace',
    component: () => import('../views/admin/ClientOnboardingWorkspaceView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'staff', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/provider/client-onboarding',
    name: 'OrganizationProviderClientOnboarding',
    component: () => import('../views/provider/ProviderClientOnboardingView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['provider', 'provider_plus', 'intern', 'supervisor'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-digital-intakes',
    name: 'OrganizationSchoolPortalDigitalIntakes',
    component: () => import('../views/admin/SchoolPortalDigitalIntakesView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/school-staff-accounts',
    name: 'OrganizationSchoolStaffAccounts',
    component: () => import('../views/admin/SchoolStaffAccountsView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/school-referral-hub',
    name: 'OrganizationSchoolReferralHub',
    component: () => import('../views/school/SchoolReferralHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/master-school-form',
    name: 'OrganizationMasterSchoolForm',
    component: () => import('../views/school/MasterSchoolFormView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/master-office-form',
    name: 'OrganizationMasterOfficeForm',
    component: () => import('../views/admin/MasterOfficeFormView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/master-office-paper',
    name: 'OrganizationMasterOfficePaper',
    component: () => import('../views/admin/MasterOfficePaperView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/master-channel-form/:channel',
    name: 'OrganizationMasterChannelForm',
    component: () => import('../views/admin/MasterChannelFormView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/skill-builders-availability',
    name: 'OrganizationSkillBuildersAvailability',
    component: () => import('../views/admin/SkillBuildersAvailabilityView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', allowSubCoordinator: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/skill-builders-program-events',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/admin/program-events`,
      query: to.query,
      hash: to.hash
    }),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/program-events',
    name: 'OrganizationSkillBuildersProgramsEvents',
    component: () => import('../views/admin/SkillBuildersProgramsEventsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/skill-builders-client-management',
    name: 'OrganizationSkillBuildersClientManagement',
    component: () => import('../views/admin/SkillBuildersClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', allowSubCoordinator: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/skill-builders-my-availability',
    name: 'OrganizationSkillBuildersMyAvailability',
    component: () => import('../views/admin/SkillBuildersProviderAvailabilityView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/documents',
    name: 'OrganizationDocumentsLibrary',
    component: () => import('../views/admin/DocumentsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/contracts',
    name: 'OrganizationContractGenerator',
    component: () => import('../views/admin/ContractGeneratorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/unassigned-documents',
    name: 'OrganizationUnassignedDocuments',
    component: () => import('../views/admin/UnassignedDocumentsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'staff'], requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/documents/new',
    name: 'OrganizationDocumentTemplateCreate',
    component: () => import('../views/admin/DocumentTemplateEditorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/documents/:templateId/edit',
    name: 'OrganizationDocumentTemplateEdit',
    component: () => import('../views/admin/DocumentTemplateEditorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/letterheads',
    name: 'OrganizationLetterheadsLibrary',
    component: () => import('../views/admin/LetterheadsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/agency-progress',
    name: 'OrganizationAgencyProgress',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/audit-center',
    name: 'OrganizationAuditCenter',
    component: () => import('../views/admin/AuditCenterView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/agencies/:agencyId/progress',
    name: 'OrganizationAgencyProgressById',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/agencies',
    name: 'OrganizationAgencies',
    redirect: (to) => `/${to.params.organizationSlug}/admin/settings?tab=agencies`
  },
  {
    path: '/:organizationSlug/admin/notifications',
    name: 'OrganizationNotifications',
    redirect: (to) => ({
      path: '/notifications',
      query: { ...to.query, scope: 'managed' }
    }),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'provider', 'staff', 'school_staff', 'club_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/payroll/reports',
    name: 'OrganizationPayrollReports',
    component: () => import('../views/admin/PayrollReportsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/receivables',
    name: 'OrganizationReceivables',
    component: () => import('../views/admin/ReceivablesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/billing-reports',
    name: 'OrganizationBillingReports',
    component: () => import('../views/admin/BillingReportsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/learning-billing',
    name: 'OrganizationLearningBillingDesk',
    component: () => import('../views/admin/LearningBillingDeskView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/billing-policy-rules',
    name: 'OrganizationBillingPolicyRulesEngine',
    component: () => import('../views/admin/BillingPolicyRulesEngineView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/psychotherapy-compliance',
    name: 'OrganizationPsychotherapyCompliance',
    component: () => import('../views/admin/PsychotherapyComplianceView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/payroll/wizard/:periodId?',
    name: 'OrganizationPayrollWizard',
    component: () => import('../views/admin/PayrollWizardView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/payroll/pending',
    name: 'OrganizationPayrollPendingSubmissions',
    component: () => import('../views/admin/PayrollPendingSubmissionsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/payroll',
    name: 'OrganizationPayroll',
    component: () => import('../views/admin/PayrollView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/expenses',
    name: 'OrganizationExpenses',
    component: () => import('../views/admin/ExpensesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/budget-management',
    name: 'OrganizationBudgetManagement',
    component: () => import('../views/admin/BudgetManagementView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canAccessBudgetManagement', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/gear-inventory',
    name: 'OrganizationGearInventory',
    component: () => import('../views/admin/GearInventoryView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/event/:eventSlug',
    name: 'BudgetEventPortal',
    component: () => import('../views/budget/BudgetEventPortalView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canAccessBudgetManagement', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/skill-builders/event/:eventId',
    alias: '/:organizationSlug/program/event/:eventId',
    name: 'SkillBuildersEventPortal',
    component: () => import('../views/skillBuilders/SkillBuildersEventPortalView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true,
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/providers',
    name: 'OrganizationProviderDirectory',
    component: () => import('../views/admin/ProviderDirectoryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/credentialing',
    name: 'OrganizationAgencyCredentialing',
    component: () => import('../views/admin/AgencyCredentialingView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff'], requiresCapability: 'canManageCredentialing', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/hiring',
    name: 'OrganizationHiringDashboard',
    component: () => import('../views/admin/HiringDashboardView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/hiring/applicants',
    name: 'OrganizationHiringCandidates',
    component: () => import('../views/admin/HiringCandidatesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/pre-hire',
    name: 'OrganizationPreHire',
    component: () => import('../views/admin/PreHireView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/onboarding',
    name: 'OrganizationOnboardingAdmin',
    component: () => import('../views/admin/OnboardingAdminView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/careers',
    name: 'OrganizationCareers',
    redirect: (to) => `/${to.params.organizationSlug}/admin/careers/jobs`,
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/careers/page',
    name: 'OrganizationCareersPageSettings',
    component: () => import('../views/admin/CareersPageSettingsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/careers/jobs',
    name: 'OrganizationJobPostings',
    component: () => import('../views/admin/JobPostingsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/employee-relations',
    name: 'OrganizationEmployeeRelations',
    component: () => import('../views/admin/EmployeeRelationsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/employee-evaluations',
    name: 'OrganizationEmployeeEvaluations',
    component: () => import('../views/admin/EmployeeEvaluationsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/interview-hub',
    name: 'OrganizationInterviewHub',
    component: () => import('../views/admin/InterviewHubView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/availability-intake',
    name: 'OrganizationAvailabilityIntake',
    component: () => import('../views/admin/AvailabilityIntakeView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/office-approvals',
    name: 'OrganizationOfficeApprovals',
    component: () => import('../views/admin/OfficeApprovalsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff', 'schedule_manager'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/school-approvals',
    name: 'OrganizationSchoolApprovals',
    component: () => import('../views/admin/SchoolApprovalsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff', 'schedule_manager'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/notifications',
    name: 'OrganizationSupervisorNotifications',
    redirect: (to) => ({
      path: '/notifications',
      query: { ...to.query }
    }),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/notifications/team',
    name: 'OrganizationTeamNotifications',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/notifications`,
      query: { ...to.query, scope: 'team' }
    }),
    meta: { requiresAuth: true, requiresRole: 'supervisor_or_cpa', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/find-providers',
    name: 'OrganizationAdminFindProviders',
    component: () => import('../views/SupervisorAvailabilityLabView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'supervisor'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/supervisor/availability-lab',
    name: 'OrganizationSupervisorAvailabilityLab',
    component: () => import('../views/SupervisorAvailabilityLabView.vue'),
    meta: { requiresAuth: true, requiresRole: ['supervisor'], organizationSlug: true }
  },
  // Legacy agency slug route (backward compatibility)
  {
    path: '/:agencySlug/login',
    name: 'AgencyLogin',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true, agencySlug: true }
  },
  // Platform default routes
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/session-ended',
    name: 'SessionEnded',
    component: () => import('../views/SessionEndedView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/:organizationSlug/session-ended',
    name: 'OrganizationSessionEnded',
    component: () => import('../views/SessionEndedView.vue'),
    meta: { requiresGuest: true, agencySlug: true }
  },
  {
    path: '/signup/club-manager',
    name: 'ClubManagerSignup',
    component: () => import('../views/ClubManagerSignupView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/verify-club-manager-email',
    name: 'VerifyClubManagerEmail',
    component: () => import('../views/VerifyClubManagerEmailView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/initial-setup/:token',
    name: 'InitialSetup',
    component: () => import('../views/InitialSetupView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: () => import('../views/ChangePasswordView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/messages',
    name: 'Messages',
    component: () => import('../views/admin/PlatformChatsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'provider_plus', 'staff', 'school_staff', 'intern', 'intern_plus', 'supervisor']
    }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true, blockApprovedEmployees: true }
  },
  {
    path: '/provider/year-update',
    name: 'ProviderYearUpdateHub',
    redirect: (to) => ({
      path: '/provider/year-update/flow',
      query: to.query,
      hash: to.hash,
    }),
  },
  {
    path: '/provider/year-update/flow',
    name: 'ProviderYearUpdateFlow',
    component: () => import('../views/provider/ProviderYearUpdateFlowView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'admin',
        'super_admin',
        'support',
        'clinical_practice_assistant',
        'supervisor'
      ]
    }
  },
  {
    path: '/:organizationSlug/provider/year-update',
    name: 'OrganizationProviderYearUpdateHub',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/provider/year-update/flow`,
      query: to.query,
      hash: to.hash,
    }),
  },
  {
    path: '/:organizationSlug/provider/year-update/flow',
    name: 'OrganizationProviderYearUpdateFlow',
    component: () => import('../views/provider/ProviderYearUpdateFlowView.vue'),
    meta: {
      requiresAuth: true,
      organizationSlug: true,
      requiresRole: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'admin',
        'super_admin',
        'support',
        'clinical_practice_assistant',
        'supervisor'
      ]
    }
  },

  {
    path: '/provider/update',
    name: 'ProviderUpdateFlow',
    component: () => import('../views/provider/ProviderUpdateFlowView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'admin',
        'super_admin',
        'support',
        'clinical_practice_assistant',
        'supervisor'
      ]
    }
  },
  {
    path: '/:organizationSlug/provider/update',
    name: 'OrganizationProviderUpdateFlow',
    component: () => import('../views/provider/ProviderUpdateFlowView.vue'),
    meta: {
      requiresAuth: true,
      organizationSlug: true,
      requiresRole: [
        'provider',
        'provider_plus',
        'intern',
        'intern_plus',
        'admin',
        'super_admin',
        'support',
        'clinical_practice_assistant',
        'supervisor'
      ]
    }
  },
  {
    path: '/operations-dashboard',
    name: 'OperationsDashboard',
    component: () => import('../views/ProviderPlusDashboardView.vue'),
    meta: { requiresAuth: true, requiresRole: [...PROVIDER_PLUS_EXPERIENCE_ROLES, 'admin', 'super_admin'] }
  },
  {
    path: '/provider-plus-dashboard',
    name: 'ProviderPlusDashboardLegacy',
    redirect: '/operations-dashboard',
    meta: { requiresAuth: true, requiresRole: [...PROVIDER_PLUS_EXPERIENCE_ROLES, 'admin', 'super_admin'] }
  },
  {
    path: '/mydashboard',
    name: 'MyDashboardLegacy',
    redirect: '/dashboard',
    meta: { requiresAuth: true }
  },
  {
    path: '/challenges',
    redirect: () => `/${NATIVE_APP_ORG_SLUG}/my_club_dashboard`
  },
  {
    path: '/challenges/:id',
    redirect: (to) => `/${NATIVE_APP_ORG_SLUG}/season/${to.params.id}`
  },
  {
    path: '/learning/classes/:classId',
    name: 'LearningClassWorkspace',
    component: () => import('../views/learning/LearningClassWorkspaceView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/class-presentation-builder',
    name: 'ClassPresentationTemplateStudio',
    component: () => import('../views/classroom/ClassPresentationBuilderView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/class-presentation-builder/:eventId',
    name: 'ClassPresentationBuilder',
    component: () => import('../views/classroom/ClassPresentationBuilderView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/class-presentation-dashboard/:eventId',
    name: 'ClassPresentationDashboard',
    component: () => import('../views/classroom/ClassPresentationDashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/in-person-tutoring-builder/:sessionId?',
    name: 'InPersonTutoringBuilder',
    component: () => import('../views/tutoring/InPersonTutoringBuilderView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/in-person-tutoring-session/:sessionId',
    name: 'InPersonTutoringSession',
    component: () => import('../views/tutoring/InPersonTutoringSessionView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/tutoring-session/:sessionId',
    name: 'VirtualTutoringSession',
    component: () => import('../views/tutoring/VirtualTutoringSessionView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/counseling',
    name: 'CounselingLobby',
    component: () => import('../views/counseling/CounselingLobbyView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/counseling/practice/:activityId',
    name: 'ActivityPractice',
    component: () => import('../views/counseling/ActivityPracticeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/counseling/session/:sessionId',
    name: 'CounselingSession',
    component: () => import('../views/counseling/CounselingSessionView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/counseling/join/:sessionId',
    name: 'CounselingJoin',
    component: () => import('../views/counseling/CounselingSessionView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/counseling/invite/:token',
    name: 'CounselingInvite',
    component: () => import('../views/counseling/CounselingInviteView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/club-store/:orgId',
    name: 'ClubStore',
    component: () => import('../views/ClubStoreView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/guardian',
    name: 'GuardianPortal',
    component: () => import('../views/guardian/GuardianPortalView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian' }
  },
  {
    path: '/guardian/skill-builders/event/:eventId',
    name: 'GuardianSkillBuilderEvent',
    component: () => import('../views/guardian/GuardianSkillBuildersEventView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian' }
  },
  {
    path: '/guardian/program-event/:eventId',
    name: 'GuardianProgramEvent',
    component: () => import('../views/guardian/GuardianSkillBuildersEventView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian' }
  },
  {
    path: '/guardian/waivers',
    name: 'GuardianWaivers',
    component: () => import('../views/guardian/GuardianWaiversView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian' }
  },
  {
    path: '/preferences',
    name: 'Preferences',
    redirect: '/dashboard?tab=my&my=preferences',
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'MySettings',
    redirect: '/dashboard?tab=my&my=preferences',
    meta: { requiresAuth: true }
  },
  {
    path: '/:organizationSlug/settings',
    name: 'OrganizationMySettings',
    redirect: (to) => `/${to.params.organizationSlug}/dashboard?tab=my&my=preferences`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/credentials',
    name: 'Credentials',
    redirect: '/dashboard?tab=my&my=credentials',
    meta: { requiresAuth: true }
  },
  {
    path: '/buildings',
    component: () => import('../views/OfficeShellView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES },
    children: [
      { path: '', name: 'Buildings', redirect: '/buildings/schedule' },
      {
        path: 'schedule',
        name: 'BuildingsSchedule',
        component: () => import('../views/OfficeScheduleView.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'review',
        name: 'BuildingsReview',
        component: () => import('../views/OfficeReviewView.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'settings',
        name: 'BuildingsSettings',
        component: () => import('../views/OfficeSettingsView.vue'),
        meta: { requiresAuth: true }
      }
    ]
  },
  // Redirect old office URLs (backward-compatible)
  {
    path: '/office',
    name: 'OfficeLegacy',
    redirect: '/buildings',
    meta: { requiresAuth: true }
  },
  {
    path: '/office/schedule',
    name: 'OfficeScheduleLegacy2',
    redirect: '/buildings/schedule',
    meta: { requiresAuth: true }
  },
  {
    path: '/office/settings',
    name: 'OfficeSettingsLegacy2',
    redirect: '/buildings/settings',
    meta: { requiresAuth: true }
  },
  {
    path: '/office/review',
    name: 'OfficeReviewLegacy2',
    redirect: '/buildings/review',
    meta: { requiresAuth: true }
  },
  {
    path: '/my-schedule',
    name: 'MySchedule',
    component: () => import('../views/MyScheduleView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/workforce-operations',
    name: 'WorkforceOperations',
    component: () => import('../views/ScheduleHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_VIEW_ROLES }
  },
  {
    path: '/school-operations',
    name: 'SchoolOperations',
    component: () => import('../views/SchoolOperationsHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/people-operations',
    name: 'PeopleOperations',
    component: () => import('../views/PeopleOperationsHubView.vue'),
    meta: { requiresAuth: true }
  },
  // Legacy redirect: /schedule → /workforce-operations
  {
    path: '/schedule',
    name: 'OfficeScheduleLegacy',
    redirect: '/workforce-operations'
  },
  // Legacy redirect: /admin/caseload-hub → /school-operations
  {
    path: '/admin/caseload-hub',
    name: 'CaseloadHubIndex',
    redirect: '/school-operations'
  },
  {
    path: '/schedule/event-staffing',
    name: 'EventStaffingRequests',
    component: () => import('../views/EventStaffingRequestsView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/schedule/staff',
    name: 'StaffScheduleCompare',
    component: () => import('../views/StaffScheduleCompareView.vue'),
    meta: { requiresAuth: true, requiresRole: STAFF_SCHEDULE_COMPARE_ROLES }
  },
  {
    path: '/schedule/board/:locationId',
    name: 'OfficeScheduleBoard',
    component: () => import('../views/OfficeScheduleBoardView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/module/:id',
    name: 'Module',
    component: () => import('../views/ModuleView.vue'),
    meta: { requiresAuth: true, blockPendingUsers: true }
  },
  {
    path: '/admin',
    name: 'AdminDashboard',
    component: () => import('../views/admin/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], platformCommandCenter: true }
  },
  {
    path: '/admin/modules',
    name: 'ModuleManager',
    component: () => import('../views/admin/ModuleManager.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], requiresCapability: 'canViewTraining' }
  },
  {
    path: '/admin/checklist-items',
    name: 'ChecklistItems',
    component: () => import('../views/admin/ChecklistItemsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/modules/:id/builder',
    name: 'CourseBuilder',
    component: () => import('../views/admin/CourseBuilderView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], requiresCapability: 'canViewTraining' }
  },
  {
    path: '/admin/modules/:id/content-editor',
    name: 'ModuleContentEditor',
    redirect: (to) => ({ name: 'CourseBuilder', params: { id: to.params.id } })
  },
  {
    path: '/admin/digital-forms',
    name: 'DigitalForms',
    component: () => import('../views/admin/IntakeLinksView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'] }
  },
  {
    path: '/admin/surveys',
    name: 'SurveyBuilder',
    component: () => import('../views/admin/SurveyBuilderView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus'] }
  },
  {
    path: '/admin/company-events',
    name: 'CompanyEvents',
    component: () => import('../views/admin/CompanyEventsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus'] }
  },
  {
    path: '/admin/surveys/:id/results',
    name: 'SurveyResults',
    component: () => import('../views/admin/SurveyResultsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus'] }
  },
  {
    path: '/admin/facilitator-availability',
    name: 'FacilitatorAvailability',
    component: () => import('../views/admin/FacilitatorAvailabilityView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'] }
  },
  {
    path: '/facilitator-availability/:requestId',
    name: 'FacilitatorAvailabilityForm',
    component: () => import('../views/FacilitatorAvailabilityFormView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/intake-links',
    redirect: '/admin/digital-forms'
  },
  {
    path: '/admin/users/:userId',
    name: 'UserProfile',
    component: () => import('../views/admin/UserProfileView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant']
    }
  },
  {
    path: '/admin/users',
    name: 'UserManager',
    component: () => import('../views/admin/UserManager.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant']
    }
  },
  {
    path: '/admin/mailbox-import',
    name: 'MboxMailboxImport',
    component: () => import('../views/admin/MboxMailboxImportView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['super_admin']
    }
  },
  {
    path: '/admin/announcements',
    name: 'AnnouncementsHub',
    component: () => import('../views/admin/AnnouncementsHubView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant']
    }
  },
  {
    path: '/admin/guardians',
    name: 'GuardiansManagement',
    component: () => import('../views/admin/GuardiansView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/clients/:clientId(\\d+)',
    name: 'ClientProfile',
    component: () => import('../views/admin/ClientProfileView.vue'),
    meta: { requiresAuth: true, requiresRole: CLIENT_RECORD_ROLES }
  },
  {
    path: '/admin/clients',
    name: 'ClientManagement',
    component: () => import('../views/admin/ClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: CLIENT_RECORD_ROLES }
  },
  {
    path: '/admin/referral-directory',
    name: 'ReferralDirectory',
    component: () => import('../views/admin/ReferralDirectoryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] }
  },
  {
    path: '/note-aid',
    name: 'NoteAid',
    // Note Aid now runs the Clinical Director Agent note generator.
    component: () => import('../views/admin/ClinicalNoteGeneratorView.vue'),
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES }
  },
  {
    path: '/admin/note-aid',
    redirect: (to) => ({ path: '/note-aid', query: to.query, hash: to.hash }),
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES }
  },
  {
    path: '/admin/session-recording',
    name: 'SessionRecording',
    component: () => import('../views/admin/SessionRecordingView.vue'),
    meta: { requiresAuth: true, requiresRole: SESSION_RECORDING_ROUTE_ROLES }
  },
  {
    path: '/admin/compliance-corner',
    redirect: '/workforce-operations',
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/presence',
    name: 'PresenceTeamBoard',
    component: () => import('../views/admin/PresenceTeamBoardView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'] }
  },
  {
    path: '/admin/beta-feedback',
    name: 'BetaFeedbackAdmin',
    component: () => import('../views/admin/BetaFeedbackAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/ask-assistant-review',
    name: 'AskAssistantReviewAdmin',
    component: () => import('../views/admin/AskAssistantReviewAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/public-marketing-pages',
    name: 'PublicMarketingPagesAdmin',
    component: () => import('../views/admin/PublicMarketingPagesAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/sstc/clubs',
    name: 'SstcClubsAdmin',
    component: () => import('../views/admin/SstcClubsAdmin.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/management-team',
    name: 'AgencyManagementTeam',
    component: () => import('../views/admin/AgencyManagementTeamView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'] }
  },
  // Backward compatible: old route now redirects to Note Aid.
  {
    path: '/admin/clinical-note-generator',
    name: 'ClinicalNoteGenerator',
    redirect: '/note-aid',
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES }
  },
  {
    path: '/admin/schools/import',
    name: 'SchoolContactsImport',
    component: () => import('../views/admin/SchoolContactsImportView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/schools/overview',
    name: 'SchoolOverviewDashboard',
    component: () => import('../views/admin/SchoolOverviewDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/school-reinit/:schoolOrganizationId',
    name: 'SchoolReinitAdmin',
    component: () => import('../views/admin/SchoolReinitAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/school-portals',
    name: 'SchoolPortals',
    component: () => import('../views/admin/SchoolOverviewDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/school-portals-hub',
    name: 'SchoolPortalsHub',
    component: () => import('../views/admin/SchoolPortalsHubView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/provider-year-update',
    name: 'ProviderYearUpdateAdmin',
    component: () => import('../views/admin/ProviderYearUpdateAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },

  {
    path: '/admin/provider-update',
    name: 'ProviderUpdateAdmin',
    component: () => import('../views/admin/ProviderUpdateAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/school-reports',
    name: 'SchoolReports',
    component: () => import('../views/admin/SchoolReportsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/unfinished-digital-forms',
    name: 'UnfinishedDigitalForms',
    component: () => import('../views/admin/UnfinishedDigitalFormsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/school-onboarding',
    name: 'SchoolOnboardingAdmin',
    component: () => import('../views/admin/SchoolOnboardingAdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/client-exchange',
    name: 'ClientExchange',
    component: () => import('../views/ClientExchangeView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: CLIENT_EXCHANGE_ROLES,
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/office-intake-queue',
    name: 'OfficeIntakeQueue',
    component: () => import('../views/admin/OfficeIntakeQueueView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'clinical_practice_assistant'],
      allowSubCoordinator: true
    }
  },
  {
    path: '/office-intake/:agencySlug',
    name: 'PublicOfficeIntake',
    component: () => import('../views/public/PublicOfficeIntakeView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/join/:agencySlug',
    name: 'AdaptiveJoinHub',
    component: () => import('../views/public/AdaptiveJoinHubView.vue'),
    meta: { requiresGuest: false, hideNav: true }
  },
  {
    path: '/join/:agencySlug/:serviceType(counseling|tutoring|coaching|consulting)/co-guardian/:token',
    name: 'CoGuardianInvite',
    component: () => import('../views/public/CoGuardianInviteView.vue'),
    meta: { requiresGuest: false, hideNav: true }
  },
  {
    path: '/join/:agencySlug/:serviceType(counseling|tutoring|coaching|consulting)',
    name: 'AdaptiveJoinService',
    component: () => import('../views/public/AdaptiveJoinView.vue'),
    meta: { requiresGuest: false, hideNav: true }
  },
  {
    path: '/join/:agencySlug/join_counseling',
    redirect: (to) => ({ path: `/join/${to.params.agencySlug}/counseling`, query: to.query, hash: to.hash })
  },
  {
    path: '/join/:agencySlug/join_tutoring',
    redirect: (to) => ({ path: `/join/${to.params.agencySlug}/tutoring`, query: to.query, hash: to.hash })
  },
  {
    path: '/:organizationSlug/join_counseling',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/join/counseling`,
      query: to.query,
      hash: to.hash
    })
  },
  {
    path: '/:organizationSlug/join_tutoring',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/join/tutoring`,
      query: to.query,
      hash: to.hash
    })
  },
  {
    path: '/:organizationSlug/join/:serviceType(counseling|tutoring|coaching|consulting)/co-guardian/:token',
    name: 'OrganizationCoGuardianInvite',
    component: () => import('../views/public/CoGuardianInviteView.vue'),
    meta: { requiresGuest: false, hideNav: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/join/:serviceType(counseling|tutoring|coaching|consulting)',
    name: 'OrganizationAdaptiveJoinService',
    component: () => import('../views/public/AdaptiveJoinView.vue'),
    meta: { requiresGuest: false, hideNav: true, organizationSlug: true }
  },
  {
    path: '/admin/materials-requests',
    name: 'MaterialsRequests',
    component: () => import('../views/admin/MaterialsRequestsView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/caseload-hub/schools-staff',
    name: 'CaseloadHubSchoolsStaff',
    component: () => import('../views/admin/caseload-hub/CaseloadHubSchoolsStaffView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider_plus',
        'provider',
        'clinical_practice_assistant',
        'schedule_manager',
        'supervisor'
      ],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/caseload-hub/events',
    name: 'CaseloadHubEvents',
    component: () => import('../views/admin/caseload-hub/CaseloadHubEventsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider_plus',
        'provider',
        'clinical_practice_assistant'
      ],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/caseload-hub/calendar',
    name: 'CaseloadHubCalendar',
    component: () => import('../views/admin/caseload-hub/CaseloadHubCalendarView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'staff',
        'super_admin',
        'provider_plus',
        'provider',
        'clinical_practice_assistant'
      ],
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/outreach-hub',
    name: 'OutreachHub',
    component: () => import('../views/admin/OutreachHubView.vue'),
    meta: {
      requiresAuth: true,
      requiresCapability: 'canAccessOutreach'
    }
  },
  {
    path: '/admin/settings',
    name: 'Settings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/support-tickets',
    name: 'SupportTicketsQueue',
    component: () => import('../views/admin/SupportTicketsQueueView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'],
      platformCommandCenter: true
    }
  },
  {
    path: '/:organizationSlug/admin/support-tickets',
    name: 'OrganizationSupportTicketsQueueLegacy',
    redirect: (to) => `/${to.params.organizationSlug}/tickets`,
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'], organizationSlug: true }
  },
  {
    path: '/tickets',
    name: 'TicketsQueue',
    component: () => import('../views/admin/SupportTicketsQueueView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'],
      platformCommandCenter: true
    }
  },
  {
    path: '/:organizationSlug/tickets',
    name: 'OrganizationTicketsQueue',
    component: () => import('../views/admin/SupportTicketsQueueView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'], organizationSlug: true }
  },
  {
    path: '/admin/escalations',
    name: 'EscalationsDesk',
    component: () => import('../views/admin/EscalationsDeskView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'super_admin',
        'staff',
        'clinical_practice_assistant',
        'provider_plus'
      ]
    }
  },
  {
    path: '/:organizationSlug/admin/escalations',
    name: 'OrganizationEscalationsDesk',
    component: () => import('../views/admin/EscalationsDeskView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'super_admin',
        'staff',
        'clinical_practice_assistant',
        'provider_plus'
      ],
      organizationSlug: true
    }
  },
  {
    path: '/admin/planned-outs',
    name: 'PlannedOuts',
    component: () => import('../views/admin/PlannedOutsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'super_admin',
        'staff',
        'clinical_practice_assistant',
        'provider_plus',
        'provider'
      ]
    }
  },
  {
    path: '/:organizationSlug/admin/planned-outs',
    name: 'OrganizationPlannedOuts',
    component: () => import('../views/admin/PlannedOutsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: [
        'admin',
        'support',
        'super_admin',
        'staff',
        'clinical_practice_assistant',
        'provider_plus',
        'provider'
      ],
      organizationSlug: true
    }
  },
  // Redirect double-slug (e.g. /itsco/itsco/tickets) to single slug (/itsco/tickets)
  {
    path: '/:a/:b/tickets',
    name: 'OrganizationTicketsQueueRedirect',
    redirect: (to) => `/${to.params.a}/tickets`,
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'] }
  },
  {
    path: '/admin/faqs',
    name: 'FaqManagement',
    component: () => import('../views/admin/FaqManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'] }
  },
  {
    path: '/admin/communications',
    name: 'CommunicationsHub',
    component: () => import('../views/admin/CommunicationsCenterView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus']
    }
  },
  {
    path: '/admin/email-settings',
    name: 'AutomatedEmailSettings',
    component: () => import('../views/admin/AutomatedEmailSettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'super_admin', 'support']
    }
  },
  {
    path: '/admin/communications/feed',
    name: 'CommunicationsFeed',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff'] }
  },
  {
    path: '/admin/marketing-campaigns',
    name: 'AgencyMarketingCampaigns',
    component: () => import('../views/admin/AgencyMarketingSplashAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'] }
  },
  {
    path: '/admin/communications/sms',
    name: 'CommunicationsSms',
    redirect: (to) => ({
      path: '/admin/communications',
      query: {
        mode: 'home',
        channel: 'sms',
        ...(to.query.clientId ? { smsClientId: to.query.clientId } : {}),
        ...(to.query.contactId ? { smsContactId: to.query.contactId } : {})
      }
    }),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff'] }
  },
  {
    path: '/tools-aids',
    name: 'ToolsAids',
    component: () => import('../views/admin/ToolsAidsView.vue'),
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES }
  },
  {
    path: '/admin/tools-aids',
    redirect: (to) => ({ path: '/tools-aids', query: to.query, hash: to.hash }),
    meta: { requiresAuth: true, requiresRole: NOTE_AID_EMPLOYEE_ROLES }
  },
  {
    path: '/admin/communications/messages',
    name: 'AdminMessages',
    redirect: (to) => ({ path: '/messages', query: { ...to.query } })
  },
  {
    path: '/admin/communications/chats',
    redirect: (to) => ({ path: '/messages', query: { ...to.query } })
  },
  {
    path: '/admin/communications/campaigns',
    name: 'AgencyCampaigns',
    component: () => import('../views/admin/AgencyCampaignsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'school_staff', 'provider', 'clinical_practice_assistant', 'supervisor', 'schedule_manager'] }
  },
  {
    path: '/admin/contacts',
    name: 'Contacts',
    component: () => import('../views/admin/ContactsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider', 'provider_plus', 'clinical_practice_assistant', 'schedule_manager'] }
  },
  {
    path: '/admin/communications/thread/:userId/:clientId',
    redirect: (to) => ({
      path: '/admin/communications',
      query: { mode: 'home', channel: 'sms', smsClientId: to.params.clientId }
    })
  },
  {
    path: '/admin/schedule-approvals',
    name: 'OfficeScheduleApprovals',
    redirect: (to) => ({
      path: '/admin/availability-intake',
      query: { ...to.query, tab: to.query?.tab || 'booking' }
    })
  },
  {
    path: '/admin/external-calendar-audit',
    name: 'ExternalCalendarAudit',
    component: () => import('../views/admin/ExternalCalendarAuditView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/booking-conflict-resolver',
    name: 'OfficeBookingConflictResolver',
    component: () => import('../views/admin/OfficeBookingConflictResolverView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/schedule-audit',
    name: 'OfficeScheduleAudit',
    component: () => import('../views/admin/OfficeScheduleAuditView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/office-coverage-flags',
    name: 'OfficeCoverageFlags',
    component: () => import('../views/admin/OfficeCoverageFlagsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/admin-meetings',
    name: 'AdminMeetingsLog',
    component: () => import('../views/admin/AdminMeetingsLogView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'super_admin', 'provider_plus', 'assistant_admin', 'clinical_practice_assistant']
    }
  },
  {
    path: '/admin/office-approvals',
    name: 'OfficeApprovals',
    component: () => import('../views/admin/OfficeApprovalsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff', 'schedule_manager']
    }
  },
  {
    path: '/admin/school-approvals',
    name: 'SchoolApprovals',
    component: () => import('../views/admin/SchoolApprovalsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff', 'schedule_manager']
    }
  },
  {
    path: '/admin/provider-availability',
    name: 'ProviderAvailabilityDashboard',
    component: () => import('../views/admin/ProviderAvailabilityDashboardView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider_plus'] }
  },
  {
    path: '/admin/school-clients',
    name: 'SchoolClients',
    component: () => import('../views/admin/SchoolClientsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'staff', 'super_admin'] }
  },
  {
    path: '/admin/client-onboarding',
    name: 'ClientOnboardingWorkspace',
    component: () => import('../views/admin/ClientOnboardingWorkspaceView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'staff', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'] }
  },
  {
    path: '/provider/client-onboarding',
    name: 'ProviderClientOnboarding',
    component: () => import('../views/provider/ProviderClientOnboardingView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['provider', 'provider_plus', 'intern', 'supervisor']
    }
  },
  {
    path: '/admin/school-digital-intakes',
    name: 'SchoolPortalDigitalIntakes',
    redirect: () => ({ path: '/dashboard' }),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/school-staff-accounts',
    name: 'SchoolStaffAccounts',
    component: () => import('../views/admin/SchoolStaffAccountsView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/school-referral-hub',
    name: 'SchoolReferralHub',
    component: () => import('../views/school/SchoolReferralHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/master-school-form',
    name: 'MasterSchoolForm',
    component: () => import('../views/school/MasterSchoolFormView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/master-office-form',
    name: 'MasterOfficeForm',
    component: () => import('../views/admin/MasterOfficeFormView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/master-office-paper',
    name: 'MasterOfficePaper',
    component: () => import('../views/admin/MasterOfficePaperView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/master-channel-form/:channel',
    name: 'MasterChannelForm',
    component: () => import('../views/admin/MasterChannelFormView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/admin/skill-builders-availability',
    name: 'SkillBuildersAvailability',
    component: () => import('../views/admin/SkillBuildersAvailabilityView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', allowSubCoordinator: true }
  },
  {
    path: '/admin/skill-builders-program-events',
    redirect: (to) => ({
      path: '/admin/program-events',
      query: to.query,
      hash: to.hash
    }),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/program-events',
    name: 'SkillBuildersProgramsEvents',
    component: () => import('../views/admin/SkillBuildersProgramsEventsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/skill-builders-client-management',
    name: 'SkillBuildersClientManagement',
    component: () => import('../views/admin/SkillBuildersClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', allowSubCoordinator: true }
  },
  {
    path: '/admin/skill-builders-my-availability',
    name: 'SkillBuildersMyAvailability',
    component: () => import('../views/admin/SkillBuildersProviderAvailabilityView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: SKILL_BUILDERS_PROGRAM_EVENTS_ROLES,
      allowSubCoordinator: true
    }
  },
  {
    path: '/admin/documents',
    name: 'DocumentsLibrary',
    component: () => import('../views/admin/DocumentsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/admin/contracts',
    name: 'ContractGenerator',
    component: () => import('../views/admin/ContractGeneratorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/unassigned-documents',
    name: 'UnassignedDocuments',
    component: () => import('../views/admin/UnassignedDocumentsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'staff'], requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/admin/documents/new',
    name: 'DocumentTemplateCreate',
    component: () => import('../views/admin/DocumentTemplateEditorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/admin/documents/:templateId/edit',
    name: 'DocumentTemplateEdit',
    component: () => import('../views/admin/DocumentTemplateEditorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/admin/letterheads',
    name: 'LetterheadsLibrary',
    component: () => import('../views/admin/LetterheadsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/admin/agency-progress',
    name: 'AgencyProgress',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus']
    }
  },
  {
    path: '/admin/audit-center',
    name: 'AuditCenter',
    component: () => import('../views/admin/AuditCenterView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/agencies/:agencyId/progress',
    name: 'AgencyProgressById',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/agencies',
    name: 'Agencies',
    redirect: '/admin/settings?tab=agencies'
  },
  {
    path: '/admin/notifications',
    name: 'Notifications',
    redirect: (to) => ({ path: '/notifications', query: { ...to.query, scope: 'managed' } }),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'provider', 'staff', 'school_staff'] }
  },
  {
    path: '/admin/payroll/reports',
    name: 'PayrollReports',
    component: () => import('../views/admin/PayrollReportsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/receivables',
    name: 'Receivables',
    component: () => import('../views/admin/ReceivablesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/billing-reports',
    name: 'BillingReports',
    component: () => import('../views/admin/BillingReportsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/learning-billing',
    name: 'LearningBillingDesk',
    component: () => import('../views/admin/LearningBillingDeskView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'] }
  },
  {
    path: '/admin/billing-policy-rules',
    name: 'BillingPolicyRulesEngine',
    component: () => import('../views/admin/BillingPolicyRulesEngineView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'] }
  },
  {
    path: '/admin/revenue',
    name: 'PlatformRevenue',
    component: () => import('../views/admin/PlatformRevenueView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/executive-report',
    name: 'ExecutiveReport',
    component: () => import('../views/admin/ExecutiveReportView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/usage-analytics',
    name: 'UsageAnalytics',
    component: () => import('../views/admin/UsageAnalyticsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/payroll/wizard/:periodId?',
    name: 'PayrollWizard',
    component: () => import('../views/admin/PayrollWizardView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/payroll/pending',
    name: 'PayrollPendingSubmissions',
    component: () => import('../views/admin/PayrollPendingSubmissionsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/payroll',
    name: 'Payroll',
    component: () => import('../views/admin/PayrollView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/expenses',
    name: 'Expenses',
    component: () => import('../views/admin/ExpensesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll' }
  },
  {
    path: '/admin/gear-inventory',
    name: 'GearInventory',
    component: () => import('../views/admin/GearInventoryView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']
    }
  },
  {
    path: '/admin/providers',
    name: 'ProviderDirectory',
    component: () => import('../views/admin/ProviderDirectoryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/credentialing',
    name: 'AgencyCredentialing',
    component: () => import('../views/admin/AgencyCredentialingView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff'], requiresCapability: 'canManageCredentialing' }
  },
  {
    path: '/admin/hiring',
    name: 'HiringDashboard',
    component: () => import('../views/admin/HiringDashboardView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/hiring/applicants',
    name: 'HiringCandidates',
    component: () => import('../views/admin/HiringCandidatesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/pre-hire',
    name: 'PreHire',
    component: () => import('../views/admin/PreHireView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/onboarding',
    name: 'OnboardingAdmin',
    component: () => import('../views/admin/OnboardingAdminView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/careers',
    name: 'Careers',
    redirect: '/admin/careers/jobs',
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/careers/page',
    name: 'CareersPageSettings',
    component: () => import('../views/admin/CareersPageSettingsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/careers/jobs',
    name: 'JobPostings',
    component: () => import('../views/admin/JobPostingsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/employee-relations',
    name: 'EmployeeRelations',
    component: () => import('../views/admin/EmployeeRelationsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/employee-evaluations',
    name: 'EmployeeEvaluations',
    component: () => import('../views/admin/EmployeeEvaluationsView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/interview-hub',
    name: 'InterviewHub',
    component: () => import('../views/admin/InterviewHubView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/availability-intake',
    name: 'AvailabilityIntake',
    component: () => import('../views/admin/AvailabilityIntakeView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff'] }
  },
  {
    path: '/notifications',
    name: 'SupervisorNotifications',
    component: () => import('../views/NotificationsHubView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/notifications/team',
    name: 'TeamNotifications',
    redirect: (to) => ({ path: '/notifications', query: { ...to.query, scope: 'team' } }),
    meta: { requiresAuth: true, requiresRole: 'supervisor_or_cpa' }
  },
  {
    path: '/admin/find-providers',
    name: 'AdminFindProviders',
    component: () => import('../views/SupervisorAvailabilityLabView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'supervisor'] }
  },
  {
    path: '/supervisor/availability-lab',
    name: 'SupervisorAvailabilityLab',
    component: () => import('../views/SupervisorAvailabilityLabView.vue'),
    meta: { requiresAuth: true, requiresRole: ['supervisor'] }
  },
  {
    path: '/tracks',
    name: 'Tracks',
    redirect: '/my-learning'
  },
  {
    path: '/my-learning',
    name: 'MyLearning',
    component: () => import('../views/MyLearningView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canViewTraining' }
  },
  {
    path: '/training-focuses/:id',
    name: 'TrainingFocusLaunch',
    redirect: (to) => ({ path: '/my-learning', query: { focusId: to.params.id } })
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('../views/TasksView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/tasks/projects/:projectId',
    name: 'TaskProject',
    component: () => import('../views/ProjectWorkspaceView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/tasks/lists/:listId',
    name: 'SharedListWorkspace',
    component: () => import('../views/SharedListWorkspaceView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/tasks/documents/:taskId/sign',
    name: 'DocumentSigning',
    component: () => import('../views/DocumentSigningView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/tasks/documents/:taskId/review',
    name: 'DocumentReview',
    component: () => import('../views/DocumentSigningView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/tasks/documents/:taskId/print',
    name: 'DocumentPrint',
    component: () => import('../views/LetterPrintView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/onboarding',
    name: 'OnboardingChecklist',
    component: () => import('../views/OnboardingChecklistView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/account-info',
    name: 'AccountInfo',
    redirect: '/dashboard?tab=my&my=account',
    meta: { requiresAuth: true }
  },
  {
    path: '/passwordless-login',
    name: 'PasswordlessLogin',
    component: () => import('../views/PasswordlessLoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/passwordless-login/:token',
    name: 'PasswordlessTokenLogin',
    component: () => import('../views/PasswordlessTokenLoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/demo-launch',
    name: 'DemoLaunch',
    component: () => import('../views/DemoLaunchView.vue'),
    meta: { requiresAuth: false, requiresGuest: false }
  },
  {
    path: '/pre-hire/:token',
    name: 'CandidatePreHirePortal',
    component: () => import('../views/CandidatePreHirePortalView.vue'),
    meta: { requiresGuest: false, isPublicPortal: true }
  },
  {
    path: '/pre-hire/:token/module/:id',
    name: 'CandidatePreHireModule',
    component: () => import('../views/ModuleView.vue'),
    meta: { requiresGuest: false, isPublicPortal: true, isPrehireModule: true }
  },
  {
    path: '/reset-password/:token',
    name: 'ResetPassword',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/pending-completion',
    name: 'PendingCompletion',
    component: () => import('../views/PendingCompletionView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/on-demand-training',
    name: 'OnDemandTrainingLibrary',
    redirect: '/my-learning'
  },
  {
    path: '/on-demand-training/modules/:id',
    name: 'OnDemandModuleView',
    component: () => import('../components/on-demand/OnDemandModuleViewer.vue'),
    meta: { requiresAuth: true, requiresApprovedEmployee: true, requiresCapability: 'canViewTraining' }
  },
  {
    path: '/',
    redirect: () => {
      if (isQuickViewHost()) return { name: 'QuickViewLauncher' };
      const authStore = useAuthStore();
      if (authStore.isAuthenticated) return getDashboardRoute();
      const slug = getDefaultOrganizationSlug();
      return slug ? `/${slug}/dashboard` : '/login';
    }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash };
    return { left: 0, top: 0 };
  }
});

const getStoredUserAgencies = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('userAgencies') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const getSchoolStaffPortalSlugs = (agencyStore, authStore) => {
  const fromStore = agencyStore.userAgencies?.value || agencyStore.userAgencies;
  const agencies = Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : getStoredUserAgencies();
  return getSchoolStaffPortalSlugsFromAgencies(agencies);
};

const userHasSlugAccess = (slug, agencyStore, authStore) => {
  if (!slug) return false;
  const fromStore = agencyStore.userAgencies?.value || agencyStore.userAgencies;
  const agencies = Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : getStoredUserAgencies();

  // Some records use `portal_url` as the slug-ish value
  if (agencies.some((a) => a?.slug === slug || a?.portal_url === slug)) return true;
  // Supervisors can access their supervisees' school portals
  const superviseeSlugs = agencyStore.superviseePortalSlugs?.value ?? agencyStore.superviseePortalSlugs ?? [];
  if (Array.isArray(superviseeSlugs) && superviseeSlugs.includes(slug)) return true;
  return false;
};

const getSlugAwarePath = (targetPath, to, authStore) => {
  if (!targetPath) return targetPath;
  const path = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  if (!authStore.isAuthenticated || authStore.user?.role === 'super_admin') return path;
  const slug =
    (to.meta.organizationSlug && typeof to.params.organizationSlug === 'string' && to.params.organizationSlug) ||
    getDefaultOrganizationSlug();
  if (!slug) return path;
  try {
    const brandingStore = useBrandingStore();
    if (isPortalHostSlugRedundantInPath(brandingStore, slug)) return path;
  } catch {
    /* ignore */
  }
  if (path.startsWith(`/${slug}/`)) return path;
  return `/${slug}${path}`;
};

const hasSubCoordinatorAccess = (userLike) => {
  const u = userLike || {};
  return (
    u.has_skill_builder_coordinator_access === true ||
    u.has_skill_builder_coordinator_access === 1 ||
    u.has_skill_builder_coordinator_access === '1'
  );
};

/**
 * Backoffice roles (and sub-coordinators) should be able to reach Skill Builders
 * tooling routes even when the tenant-level SB feature flag is off. Backend
 * authorization already allows these roles/flags as a bypass; the router guard
 * should not hard-redirect them away from pages like `/admin/program-events`.
 */
const hasSkillBuildersToolingBypass = (userLike) => {
  const u = userLike || {};
  const r = String(u?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'staff', 'support', 'clinical_practice_assistant', 'provider_plus'].includes(r)) return true;
  return hasSubCoordinatorAccess(u);
};

// --- Navigation loop breaker -------------------------------------------------
// A stale/invalid session (e.g. a token minted before a role change) can put the
// guards below into a redirect loop — classically login <-> dashboard — which
// white-screens the app and forces users to manually clear cookies to recover.
// This tripwire counts how often beforeEach runs in a short window; a redirect
// loop re-enters beforeEach far more often than any legitimate flow.
//
// IMPORTANT: right after a successful login the app can legitimately hop several
// times (slug strip/prefix, agency sync, summit/work surface). If we clearAuth
// during that window we create the 401 spam the breaker was meant to stop.
const NAV_LOOP_WINDOW_MS = 4000;
const NAV_LOOP_LIMIT = 18;          // above real post-login chains; still catches tight loops
const NAV_LOOP_COOLDOWN_MS = 8000;  // don't re-trip immediately after recovering
const NAV_LOOP_FRESH_LOGIN_MS = 30000;
let _navBeforeEachHits = [];
let _navLoopBrokenAt = 0;
let _navLoopRecentHops = [];

function isFreshLoginWindow(now = Date.now()) {
  try {
    if (sessionStorage.getItem('justLoggedIn') !== 'true') return false;
    const loggedInAt = Number(sessionStorage.getItem('justLoggedInAt') || 0);
    return loggedInAt > 0 && (now - loggedInAt) < NAV_LOOP_FRESH_LOGIN_MS;
  } catch {
    return false;
  }
}

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const brandingStore = useBrandingStore();
  const agencyStore = useAgencyStore();
  const organizationStore = useOrganizationStore();

  // Dedicated Quick View hosts only serve QV routes (PIN gate / token bind).
  if (isQuickViewHost() && !to.meta?.publicQuickView) {
    next({ name: 'QuickViewLauncher', replace: true });
    return;
  }

  // Navigation loop breaker: must run before any redirecting guard below.
  {
    const now = Date.now();
    _navBeforeEachHits = _navBeforeEachHits.filter((t) => now - t < NAV_LOOP_WINDOW_MS);
    _navBeforeEachHits.push(now);
    _navLoopRecentHops.push(`${String(from?.fullPath || from?.path || '')} → ${String(to?.fullPath || to?.path || '')}`);
    if (_navLoopRecentHops.length > 24) _navLoopRecentHops = _navLoopRecentHops.slice(-24);
    if (
      _navBeforeEachHits.length > NAV_LOOP_LIMIT &&
      now - _navLoopBrokenAt > NAV_LOOP_COOLDOWN_MS
    ) {
      _navLoopBrokenAt = now;
      _navBeforeEachHits = [];
      const hopTrace = _navLoopRecentHops.slice(-12).join(' | ');
      _navLoopRecentHops = [];

      // Fresh login / admin slug ping-pong: do NOT wipe the session.
      // Classic failure: /itsco/admin ↔ /admin on app.itsco.health after password login.
      const hasClientAuthHint = (() => {
        try {
          return !!(authStore.isAuthenticated || localStorage.getItem('authToken') || localStorage.getItem('user'));
        } catch {
          return !!authStore.isAuthenticated;
        }
      })();
      const looksLikeAdminSlugPingPong = /\/admin/.test(hopTrace) && (
        hopTrace.includes('/admin |') || hopTrace.includes('→ /admin')
      );
      if (hasClientAuthHint && (isFreshLoginWindow(now) || looksLikeAdminSlugPingPong)) {
        const recoveryPath = flattenPathForHostPortal(getDashboardRoute(), brandingStore);
        // eslint-disable-next-line no-console
        console.error(
          '[nav-loop-breaker] Redirect loop during post-login routing; keeping session and landing on role-appropriate home.',
          { recoveryPath, hopTrace }
        );
        if (String(to.path || '') !== recoveryPath) {
          next({ path: recoveryPath, replace: true });
        } else {
          next();
        }
        return;
      }

      // Stale session: drop client auth so requiresGuest login stops bouncing to dashboard.
      try { authStore.clearAuth?.(); } catch { /* best-effort */ }
      try {
        const sessionId = localStorage.getItem('sessionId');
        api.post('/auth/logout', { sessionId, reason: 'nav_loop_recovery' }, { skipAuthRedirect: true }).catch(() => {});
      } catch { /* ignore */ }
      // eslint-disable-next-line no-console
      console.error(
        '[nav-loop-breaker] Redirect loop detected; cleared the stale session and routed to login to recover.',
        hopTrace
      );
      const hostImplied = String(brandingStore.portalHostPortalUrl || getCurrentPortalSlugFromHostCache() || '').trim().toLowerCase() || null;
      const slug = getDefaultOrganizationSlug();
      const loginPath = slug
        ? buildOrgLoginPath(slug, null, hostImplied)
        : '/login';
      if (String(to.path || '') !== loginPath) {
        next({ path: loginPath, replace: true });
      } else {
        next();
      }
      return;
    }
  }

  // Native iOS/Android builds can be pinned to one tenant slug (SSTC by default).
  // This keeps app launches in the intended branded surface instead of generic /login.
  if (Capacitor.isNativePlatform() && NATIVE_APP_ORG_SLUG) {
    const rawPath = String(to.path || '');
    const isAlreadyScoped =
      rawPath === `/${NATIVE_APP_ORG_SLUG}` || rawPath.startsWith(`/${NATIVE_APP_ORG_SLUG}/`);
    const isSummitStatsAlias =
      rawPath === '/summit-stats' || rawPath.startsWith('/summit-stats/');

    // Hard block: if the path contains an org slug that is NOT the native SSTC slug,
    // redirect to the SSTC dashboard. This prevents native users from accidentally or
    // intentionally navigating to other organizations' portals.
    if (!isAlreadyScoped && !isSummitStatsAlias) {
      const orgSlugInPath = rawPath.match(/^\/([^/]+)\//)?.[1] || rawPath.match(/^\/([^/]+)$/)?.[1];
      if (orgSlugInPath && orgSlugInPath !== NATIVE_APP_ORG_SLUG && orgSlugInPath !== 'login') {
        const dest = rawPath.startsWith('/') ? `/${NATIVE_APP_ORG_SLUG}` + rawPath.slice(1 + orgSlugInPath.length) : `/${NATIVE_APP_ORG_SLUG}/my_club_dashboard`;
        next({ path: dest || `/${NATIVE_APP_ORG_SLUG}/my_club_dashboard`, query: to.query, hash: to.hash, replace: true });
        return;
      }
    }

    if (isSummitStatsAlias) {
      const rest = rawPath === '/summit-stats' ? '' : rawPath.slice('/summit-stats'.length);
      next({ path: `/${NATIVE_APP_ORG_SLUG}${rest}`, query: to.query, hash: to.hash, replace: true });
      return;
    }

    const shouldScopeToTenant =
      !isAlreadyScoped &&
      !to.meta.organizationSlug &&
      (rawPath === '/' ||
        rawPath === '/login' ||
        rawPath === '/dashboard' ||
        rawPath === '/mydashboard' ||
        rawPath === '/account-info' ||
        rawPath === '/preferences' ||
        rawPath === '/credentials' ||
        rawPath === '/home' ||
        rawPath === '/my_club_dashboard' ||
        rawPath.startsWith('/season/') ||
        rawPath === '/challenges' ||
        rawPath.startsWith('/challenges/') ||
        rawPath.startsWith('/admin') ||
        rawPath.startsWith('/on-demand-training') ||
        rawPath.startsWith('/my-learning') ||
        rawPath.startsWith('/club-store'));

    if (shouldScopeToTenant) {
      const scopedPath = (() => {
        if (rawPath === '/') return `/${NATIVE_APP_ORG_SLUG}/login`;
        if (rawPath === '/challenges') return `/${NATIVE_APP_ORG_SLUG}/my_club_dashboard`;
        if (rawPath.startsWith('/challenges/')) {
          const rest = rawPath.slice('/challenges/'.length);
          return rest ? `/${NATIVE_APP_ORG_SLUG}/season/${rest}` : `/${NATIVE_APP_ORG_SLUG}/my_club_dashboard`;
        }
        return `/${NATIVE_APP_ORG_SLUG}${rawPath}`;
      })();
      next({ path: scopedPath, query: to.query, hash: to.hash, replace: true });
      return;
    }
  }

  // Summit Stats canonical slug redirect: /summit-stats/* or /ssc/* → /sstc/*
  // Only redirect legacy aliases — never redirect /sstc/* to itself (infinite loop).
  {
    const rawPath = String(to.path || '');
    const legacyBases = ['/summit-stats', '/ssc'];
    const matchedLegacy = legacyBases.find((b) => rawPath === b || rawPath.startsWith(`${b}/`));
    if (matchedLegacy) {
      const rest = rawPath === matchedLegacy ? '' : rawPath.slice(matchedLegacy.length);
      next({ path: `/sstc${rest}`, query: to.query, hash: to.hash, replace: true });
      return;
    }
    // Handle /sstc/summit-stats/* or /sstc/ssc/* or /sstc/sstc/* → /sstc/*
    const sstcDoubled = ['/sstc/summit-stats', '/sstc/ssc', '/sstc/sstc'];
    const matchedDoubled = sstcDoubled.find((b) => rawPath === b || rawPath.startsWith(`${b}/`));
    if (matchedDoubled) {
      const rest = rawPath.slice(matchedDoubled.length) || '/';
      next({ path: `/sstc${rest}`, query: to.query, hash: to.hash, replace: true });
      return;
    }
  }

  // Custom domain / subdomain portals: never keep /{portalSlug}/… in the path (host is already the bucket).
  // Use resolveHostPortalSlug so app.itsco.health ≡ itsco even when /agencies/resolve returns null.
  const hostPortalEarly = resolveHostPortalSlug(brandingStore);
  if (hostPortalEarly) {
    // Keep branding store aligned so other checks (redundant slug, login paths) agree.
    if (!brandingStore.portalHostPortalUrl) {
      try { brandingStore.portalHostPortalUrl = hostPortalEarly; } catch { /* ignore */ }
    }
    const rawPath = String(to.path || '');
    const prefix = `/${hostPortalEarly}`;
    if (rawPath === prefix || rawPath.startsWith(`${prefix}/`)) {
      const rest = rawPath === prefix ? '/' : rawPath.slice(prefix.length) || '/';
      // Provider mobile shell is only registered under /:organizationSlug/provider-mobile; /provider-mobile redirects back to a slugbed URL.
      if (rest !== '/provider-mobile' && !rest.startsWith('/provider-mobile/')) {
        next({ path: rest, query: to.query, hash: to.hash, replace: true });
        return;
      }
    }
  }

  const userStatus = authStore.user?.status;
  const isPending = userStatus === 'pending';
  const isReadyForReview = userStatus === 'ready_for_review';
  const mustChangePassword = authStore.user?.requiresPasswordChange === true;

  // Allow magic-link flows even if a stale "user" is stored locally.
  // These flows are token-based and should not be blocked by requiresGuest redirects.
  const allowWhenAuthenticated = new Set([
    'ResetPassword',
    'OrganizationResetPassword',
    'PasswordlessTokenLogin',
    'OrganizationPasswordlessTokenLogin',
    'InitialSetup',
    'NewAccount'
  ]);

  const tryBootstrapAuthFromCookie = async () => {
    if (authStore.isAuthenticated) return true;
    try {
      // OAuth callback sets HttpOnly cookie server-side; hydrate SPA user from cookie-backed /users/me.
      const resp = await api.get('/users/me', { skipGlobalLoading: true, skipAuthRedirect: true });
      const u = resp?.data || null;
      if (!u || (!u.id && !u.email)) return false;
      authStore.setAuth(null, u, localStorage.getItem('sessionId') || null);
      // Google OAuth returns with an HttpOnly cookie instead of going through
      // authStore.login(). Preserve the same fresh-login signal used by password,
      // passwordless, and biometric flows so privileged briefings open reliably.
      if (String(to.query?.sso || '') === '1') signalFreshLogin();
      return true;
    } catch {
      return false;
    }
  };

  // Kiosk users: restrict to /kiosk/* routes only
  const isKioskUser = String(authStore.user?.role || '').toLowerCase() === 'kiosk';
  const isKioskRoute = String(to.path || '').startsWith('/kiosk');
  if (authStore.isAuthenticated && isKioskUser && !isKioskRoute) {
    next('/kiosk/app');
    return;
  }

  // Club managers (admin with only affiliation orgs): redirect /admin to /sstc/admin
  // Never re-prefix when the hostname already implies that slug — that creates
  // /itsco/admin ↔ /admin ping-pong on app.itsco.health after password login.
  const isAdminPath = to.path === '/admin' || String(to.path || '').startsWith('/admin/');
  if (authStore.isAuthenticated && isAdminPath && !to.meta.organizationSlug) {
    const userRole = String(authStore.user?.role || '').toLowerCase();
    if (userRole === 'admin') {
      let list = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
      if (!Array.isArray(list)) list = [];
      if (list.length === 0) await agencyStore.fetchUserAgencies();
      const orgs = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
      const orgList = Array.isArray(orgs) ? orgs : [];
      if (orgList.length === 1) {
        const org = orgList[0];
        const orgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
        if (orgType === 'affiliation') {
          const slug = org?.parent_slug || org?.slug || org?.portal_url || org?.portalUrl;
          if (slug && String(slug).trim() && !isPortalHostSlugRedundantInPath(brandingStore, slug)) {
            const rest = to.path === '/admin' ? '' : to.path.slice(6);
            const qs = to.fullPath.includes('?') ? to.fullPath.slice(to.fullPath.indexOf('?')) : '';
            next(`/${slug}/admin${rest}${qs}`);
            return;
          }
        }
      }
    }
  }

  // Always keep activeRouteSlug in sync — this makes color computeds reactive to every navigation.
  // Clear on non-slug routes so platform pages don't inherit a stale org slug.
  if (!to.meta.organizationSlug) {
    brandingStore.setActiveRouteSlug('');
  }

  // Settings modal: tenant picker (and Platform chip) must drive nav chrome, not the URL prefix slug.
  brandingStore.setSettingsTenantPickerBrandingActive(
    to.name === 'Settings' || to.name === 'OrganizationSettings'
  );

  // Prevent stale org branding “flash” when leaving a branded portal.
  if (!to.meta.organizationSlug && from.meta.organizationSlug) {
    // On custom-domain portals, /login should remain branded (portalHostPortalUrl is set at boot).
    if (!brandingStore.portalHostPortalUrl) {
      brandingStore.clearPortalTheme();
    }
  }

  // Prevent stale org branding “flash” when going to platform login — but custom app hosts
  // (app.client.com) resolve portal from host; don't clear theme while cache/resolve still applies.
  if (to.path === '/login') {
    const hostCachedPortal = getCurrentPortalSlugFromHostCache();
    if (!brandingStore.portalHostPortalUrl && !hostCachedPortal) {
      brandingStore.clearPortalTheme();
    }
  }

  // Public marketing hub: apply hub theme (not org slug theme).
  if (to.meta.publicMarketingHub) {
    const hubSlug = String(to.params.hubSlug || '').trim();
    if (hubSlug) {
      try {
        await brandingStore.fetchPublicMarketingHubTheme(hubSlug);
      } catch {
        // best effort
      }
    }
  }

  // Public agency-wide events (/open-events/:agencySlug) — same theme as /:slug/events (not organizationSlug-based).
  if (to.meta.publicAgencyEventsOpen || to.meta.publicAgencyEnrollOpen) {
    const s = String(to.params.agencySlug || '').trim();
    if (s) {
      try {
        await brandingStore.fetchAgencyTheme(s, { pageContext: 'public_events' });
      } catch {
        // best effort
      }
    }
  }

  // On slug-prefixed routes, load org context + apply branding.
  // This is what keeps the portal branded consistently across all authenticated pages.
  if (to.meta.organizationSlug) {
    const slug = to.params.organizationSlug;

    // Always update the reactive activeRouteSlug FIRST so color computeds re-fire immediately
    // for the new org — even before fetchAgencyTheme resolves.
    brandingStore.setActiveRouteSlug(typeof slug === 'string' ? slug : '');

    // Query-only updates (e.g. Skill Builders event portal hub cards set ?section=) must not re-run
    // theme + org hydration — that caused repeated global loading and "stuck" section switches.
    const queryOnlySameOrgRoute =
      from.path &&
      to.path === from.path &&
      String(to.name || '') === String(from.name || '') &&
      typeof slug === 'string' &&
      slug &&
      String(from.params.organizationSlug || '') === String(slug);

    if (!queryOnlySameOrgRoute) {
      const isProviderPlus = String(authStore.user?.role || '').toLowerCase() === 'provider_plus';
      if (typeof slug === 'string' && slug && authStore.isAuthenticated && authStore.user && (isSupervisor(authStore.user) || isProviderPlus)) {
        await agencyStore.fetchSuperviseePortalSlugs();
      }
      if (typeof slug === 'string' && slug) {
        // Apply portal branding for all slug routes (public + authenticated).
        // On a dedicated app host (e.g. app.itsco.health ≡ agency itsco), super_admins touring
        // /itsco/... paths should not re-fetch the same portal theme every navigation — it causes
        // visible header/logo flicker vs paths without the redundant slug prefix.
        try {
          const pageContext =
            to.meta.publicSkillBuildersEventsBranding ||
            to.meta.publicAgencyEventsBranding ||
            to.meta.publicAgencyEnrollBranding ||
            to.meta.publicSkillBuildersProgramEnrollBranding
              ? 'public_events'
              : undefined;
          const isSuperAdmin = String(authStore.user?.role || '').toLowerCase() === 'super_admin';
          const hostPortal = String(
            brandingStore.portalHostPortalUrl || getCurrentPortalSlugFromHostCache() || ''
          )
            .trim()
            .toLowerCase();
          const slugNorm = String(slug).trim().toLowerCase();
          const skipRedundantTheme =
            authStore.isAuthenticated && isSuperAdmin && hostPortal && slugNorm === hostPortal;
          // Login routes fetch their own login-theme in onMounted (fetchLoginTheme), which applies
          // full branding via setPortalThemeFromLoginTheme. Skip the guard's /theme call to avoid
          // a redundant round-trip that causes a visible flash before the richer theme loads.
          const isLoginRoute = to.name === 'OrganizationLogin' || to.name === 'ParentOrganizationLogin';
          if (!skipRedundantTheme && !isLoginRoute) {
            await brandingStore.fetchAgencyTheme(slug, pageContext ? { pageContext } : {});
          }
        } catch (e) {
          // best effort: do not block navigation
        }

        // Keep organization store aligned to the slug for portal pages.
        // Nested orgs (school/program/learning/book club) must NOT become currentAgency —
        // keep the parent tenant for nav/theme/data scoping.
        try {
          const org = await organizationStore.fetchBySlug(slug);
          const roleLower = String(authStore.user?.role || '').toLowerCase();
          const isSuperAdminUser = roleLower === 'super_admin' || roleLower === 'superadmin';
          if (org && authStore.isAuthenticated && isSuperAdminUser) {
            // Superadmins touring authenticated tenant routes (Management → Admin Dashboard)
            // must scope currentAgency to that tenant; otherwise HQ shells/APIs stay platform-mode.
            if (to.meta.requiresAuth && isTenantOrganizationType(org)) {
              agencyStore.setCurrentAgency(org);
            }
          } else if (org && authStore.isAuthenticated && !isSuperAdminUser) {
            // IMPORTANT: Do NOT overwrite the user's current agency context just because they visited a public
            // organization splash page. Only sync currentAgency when:
            // - the route requires auth (they are entering a branded portal), OR
            // - the user actually belongs to that organization (prevents “/school” prefix sticking).
            const shouldSyncAgencyContext = !!to.meta.requiresAuth || userHasSlugAccess(slug, agencyStore, authStore);
            if (shouldSyncAgencyContext) {
              const memberships = [
                ...(Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []),
                ...(Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
              ];
              const isBookClub = isBookClubAgency(org);
              const isNested = isNestedOrganizationType(org);
              const orgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
              const isSstcAffiliation = isNested && (orgType === 'affiliation' || orgType === 'clubwebapp') && !isBookClub;

              // Book Club org rows have no dashboard — send members to the parent tenant dashboard.
              const pathNorm = String(to.path || '');
              if (isBookClub && /\/dashboard\/?$/i.test(pathNorm)) {
                const parent = getParentAgencyFromOrg(org, memberships);
                const parentSlug = getOrgSlug(parent) || String(org?.parent_slug || org?.parentSlug || '').trim();
                if (parent) agencyStore.setCurrentAgency(parent);
                if (parentSlug) {
                  next({ path: `/${parentSlug}/dashboard`, replace: true });
                  return;
                }
              }

              if (isBookClub || (isNested && !isSstcAffiliation)) {
                const parent = getParentAgencyFromOrg(org, memberships);
                if (parent && isTenantOrganizationType(parent)) {
                  agencyStore.setCurrentAgency(parent);
                } else if (isTenantOrganizationType(agencyStore.currentAgency)) {
                  // keep existing tenant
                } else {
                  const fallbackTenant = memberships.find((a) => isTenantOrganizationType(a));
                  if (fallbackTenant) agencyStore.setCurrentAgency(fallbackTenant);
                }
              } else {
                // Full tenants + SSTC clubs (summit chrome) may own currentAgency.
                agencyStore.setCurrentAgency(org);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  // Tools & Aids is agency-only and must not run in school/program/learning portals.
  if (isToolsAidsRoute(to)) {
    let scopedOrgType = '';
    const scopedSlug = to.meta.organizationSlug && typeof to.params.organizationSlug === 'string'
      ? String(to.params.organizationSlug)
      : '';

    if (scopedSlug) {
      const currentOrg = organizationStore.currentOrganization;
      const currentOrgSlug = String(currentOrg?.slug || '');
      const org =
        currentOrg && currentOrgSlug === scopedSlug
          ? currentOrg
          : await organizationStore.fetchBySlug(scopedSlug);
      scopedOrgType = String(org?.organization_type || org?.organizationType || '').toLowerCase();
    } else {
      const current = agencyStore.currentAgency?.value || agencyStore.currentAgency || null;
      scopedOrgType = String(current?.organization_type || current?.organizationType || '').toLowerCase();
    }

    if (isNonAgencyOrgType(scopedOrgType)) {
      if (scopedSlug) {
        next(`/${scopedSlug}/dashboard`);
      } else {
        next(getSlugAwarePath('/dashboard', to, authStore));
      }
      return;
    }
  }

  // Safety net: if currentAgency is set to a slug the user doesn't have access to,
  // fall back to their first stored agency (prevents getting "stuck" in a bad prefix).
  if (authStore.isAuthenticated && authStore.user?.role !== 'super_admin' && agencyStore.currentAgency) {
    const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
    const slug = current?.slug || current?.portal_url;
    if (slug && !userHasSlugAccess(slug, agencyStore, authStore)) {
      const fallback = getStoredUserAgencies()[0] || null;
      if (fallback) agencyStore.setCurrentAgency(fallback);
    }
  }

  // If user is authenticated and not super_admin, enforce slug-prefixed navigation
  // so branding stays consistent across all portal pages.
  const allowUnscopedDashboard =
    to.path === '/dashboard' ||
    to.path === '/mydashboard' ||
    String(to.name || '') === 'Dashboard';
  const allowUnscopedNotifications =
    to.path === '/notifications' ||
    to.path.startsWith('/notifications/') ||
    ['SupervisorNotifications', 'Notifications'].includes(String(to.name || ''));
  const allowUnscopedDocumentSigning = ['DocumentSigning', 'DocumentReview', 'DocumentPrint'].includes(String(to.name || ''));
  // Users with affiliation (SSTC) access: redirect to club dashboard instead of platform /dashboard
  if (
    authStore.isAuthenticated &&
    authStore.user?.role !== 'super_admin' &&
    allowUnscopedDashboard &&
    to.path === '/dashboard'
  ) {
    const slug = getDefaultOrganizationSlug();
    if (slug && !isPortalHostSlugRedundantInPath(brandingStore, slug)) {
      const suffix = (to.fullPath || to.path).replace(/^\/dashboard/, '') || '';
      next(`/${slug}/dashboard${suffix}`);
      return;
    }
  }

  // Summit Stats (SSTC): members stay inside the club dashboard shell, not the shared provider dashboard.
  // Preserve only backoffice/provider-plus roles on /:slug/dashboard when they intentionally use the work surfaces.
  if (
    authStore.isAuthenticated &&
    to.name === 'OrganizationDashboard' &&
    typeof to.params.organizationSlug === 'string' &&
    isSstcTenantSlug(to.params.organizationSlug)
  ) {
    const roleNorm = String(authStore.user?.role || '').toLowerCase();
    if (!SSTC_ROLES_SKIP_MY_CLUB_DASH_REDIRECT.has(roleNorm)) {
      const slug = String(to.params.organizationSlug).trim();
      next({
        path: `/${slug}/my_club_dashboard`,
        query: to.query,
        hash: to.hash,
        replace: true
      });
      return;
    }
  }

  if (
    authStore.isAuthenticated &&
    typeof to.params.organizationSlug === 'string' &&
    isSstcTenantSlug(to.params.organizationSlug)
  ) {
    const roleNorm = String(authStore.user?.role || '').toLowerCase();
    const slug = String(to.params.organizationSlug).trim();
    const pathNorm = String(to.path || '');
    const summitPersonalAliases = new Set([
      `/${slug}/preferences`,
      `/${slug}/credentials`,
      `/${slug}/account-info`
    ]);
    if (!SSTC_ROLES_SKIP_MY_CLUB_DASH_REDIRECT.has(roleNorm) && summitPersonalAliases.has(pathNorm)) {
      next({
        path: `/${slug}/my_club_dashboard`,
        query: { ...to.query, view: 'account' },
        hash: to.hash,
        replace: true
      });
      return;
    }
  }

  if (
    authStore.isAuthenticated &&
    authStore.user?.role !== 'super_admin' &&
    to.meta.requiresAuth &&
    !to.meta.organizationSlug &&
    !allowUnscopedDashboard &&
    !allowUnscopedNotifications &&
    !allowUnscopedDocumentSigning
  ) {
    const slug = getDefaultOrganizationSlug();
    if (slug && !isPortalHostSlugRedundantInPath(brandingStore, slug)) {
      // Prefix the entire path (preserves queries/hash via fullPath).
      next(`/${slug}${to.fullPath}`);
      return;
    }
  }

  // School staff are locked to a single school-portal experience.
  // They should not access platform admin sections or other org routes.
  // Public/guest pages (parent intake, school referral, careers, etc.) stay
  // reachable so staff can check the same link a parent would — without a
  // redirect back into the portal.
  if (
    authStore.isAuthenticated &&
    String(authStore.user?.role || '').toLowerCase() === 'school_staff' &&
    !authStore.user?.__schoolOnboardingDemoUser &&
    !isSchoolOnboardingDemoActive() &&
    !isSchoolOnboardingDemoRoute(to) &&
    to.meta.requiresAuth
  ) {
    const allowedSlugs = getSchoolStaffPortalSlugs(agencyStore, authStore);
    const targetSlug = allowedSlugs[0] || getDefaultOrganizationSlug();
    const toSlug = typeof to.params.organizationSlug === 'string' ? String(to.params.organizationSlug) : null;
    const allowedRouteNames = new Set([
      'OrganizationDashboard',
      'OrganizationSchoolProviderProfile',
      'OrganizationChangePassword',
      'OrganizationSplash',
      'OrganizationDocumentSigning',
      'OrganizationDocumentReview',
      'OrganizationDocumentPrint',
      'OrganizationSchoolReinitPublic'
    ]);
    const allowedUnscopedRouteNames = new Set([
      'DocumentSigning',
      'DocumentReview',
      'SchoolReinitPublic',
      'SchoolOnboarding',
      'SchoolOnboardingDemo',
      'SchoolOnboardingStandaloneDemo',
      'SchoolOnboardingStart'
    ]);

    const allowed =
      (
        allowedRouteNames.has(String(to.name || '')) &&
        !!to.meta.organizationSlug &&
        (!toSlug || allowedSlugs.includes(String(toSlug)))
      ) ||
      allowedUnscopedRouteNames.has(String(to.name || ''));

    if (!allowed) {
      if (targetSlug) {
        next(`/${targetSlug}/dashboard`);
      } else {
        next('/login');
      }
      return;
    }
  }

  if (
    authStore.isAuthenticated &&
    String(authStore.user?.role || '').toLowerCase() === 'school_staff' &&
    !authStore.user?.__schoolOnboardingDemoUser &&
    !isSchoolOnboardingDemoActive() &&
    !isSchoolOnboardingDemoRoute(to)
  ) {
    const exemptRouteNames = new Set([
      'DocumentSigning',
      'DocumentReview',
      'OrganizationDocumentSigning',
      'OrganizationDocumentReview',
      'SchoolOnboarding',
      'SchoolOnboardingDemo',
      'SchoolOnboardingStandaloneDemo',
      'SchoolOnboardingStart'
    ]);
    const currentRouteName = String(to.name || '');
    // If a password change is required (e.g. temp-password login), let the
    // mustChangePassword guard below handle routing before checking the waiver.
    if (!exemptRouteNames.has(currentRouteName) && !mustChangePassword) {
      const slug = (typeof to.params.organizationSlug === 'string' && to.params.organizationSlug) || getDefaultOrganizationSlug();
      if (slug) {
        try {
          await getSchoolStaffWaiverStatus({
            api,
            authUser: authStore.user,
            organizationSlug: slug
          });
          // Waiver status is now cached for SchoolPortalView to pick up; the
          // portal itself shows a nudge prompt instead of hard-blocking navigation.
        } catch {
          // Best-effort: if status lookup fails, do not block navigation.
        }
      }
    }
  }
  
  // Handle root path redirect based on user role
  if (to.path === '/' && authStore.isAuthenticated) {
    next(getDashboardRoute());
    return;
  }

  // In installed mobile PWA mode, provider-access users should stay in the provider-mobile shell.
  if (
    authStore.isAuthenticated &&
    hasProviderMobileAccess(authStore.user) &&
    isStandalonePwa() &&
    isLikelyMobileViewport() &&
    to.meta.requiresAuth
  ) {
    const path = String(to.path || '');
    const isProviderMobileRoute = path.includes('/provider-mobile');
    const isAllowedExternalRoute = path.includes('/note-aid') || path.includes('/admin/note-aid');
    if (!isProviderMobileRoute && !isAllowedExternalRoute) {
      const slug =
        (to.meta.organizationSlug && typeof to.params.organizationSlug === 'string' && to.params.organizationSlug) ||
        getDefaultOrganizationSlug();
      if (slug) {
        next(`/${slug}/provider-mobile/schedule`);
      } else {
        next('/provider-mobile');
      }
      return;
    }
  }
  
  // Block pending users from accessing training modules and certain routes
  if (to.meta.blockPendingUsers && isPending) {
    next(getSlugAwarePath('/dashboard', to, authStore));
    return;
  }
  
  // Block ready_for_review users from accessing most routes (access is locked)
  if (isReadyForReview && to.path !== '/pending-completion' && to.path !== '/dashboard') {
    next(getSlugAwarePath('/pending-completion', to, authStore));
    return;
  }

  // Enforce password rotation: if password is expired, force user into Change Password screen.
  if (authStore.isAuthenticated && mustChangePassword) {
    const isChangePassword =
      to.name === 'ChangePassword' ||
      to.name === 'OrganizationChangePassword' ||
      String(to.path || '').includes('/change-password');
    const isLogout = String(to.path || '').includes('/logout');
    if (!isChangePassword && !isLogout) {
      next(getSlugAwarePath('/change-password', to, authStore));
      return;
    }
  }

  const currentUserRoleNorm = String(authStore.user?.role || '').toLowerCase();
  const currentOrgSlug = typeof to.params?.organizationSlug === 'string' ? to.params.organizationSlug : '';

  // Compute the context-aware effective role for the current agency selection.
  // - Affiliation (club) context: map club_role (manager/assistant_manager → club_manager; member → global role).
  // - Work context: club_manager global role falls back to 'provider' so they can reach work routes.
  // - No agency context or anything else: use the global role unchanged.
  const _currentAgencyOrgType = String(agencyStore.currentAgency?.organization_type || '').toLowerCase();
  const _isAffiliationContext = _currentAgencyOrgType === 'affiliation';
  const _clubRole = String(agencyStore.currentAgency?.club_role || '').toLowerCase();
  const currentEffectiveRoleNorm = (() => {
    if (_isAffiliationContext) {
      // Club managers in club context act as club_manager regardless of their global work role.
      if (_clubRole === 'manager' || _clubRole === 'assistant_manager') return 'club_manager';
      // Club members fall back to their global role for general route access.
      return currentUserRoleNorm;
    }
    // In a work-tenant context a global club_manager/assistant_manager should navigate as a provider.
    if (currentUserRoleNorm === 'club_manager' || currentUserRoleNorm === 'assistant_manager') return 'provider';
    return currentUserRoleNorm;
  })();

  if (
    authStore.isAuthenticated &&
    to.meta.requiresAuth &&
    routeRequiresSkillBuildersSchoolProgramFeature(to) &&
    !to.meta.requiresRole
  ) {
    const agency = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? {};
    const pb = brandingStore.platformBranding || {};
    const sbAllowed = canAccessSkillBuildersSchoolProgramSurfaces({
      userRole: authStore.user?.role,
      agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
      platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
      tenantAvailableAgencyFeaturesOverrideJson:
        agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
    });
    if (!sbAllowed && !hasSkillBuildersToolingBypass(authStore.user)) {
      next(getSlugAwarePath('/dashboard', to, authStore));
      return;
    }
  }

  if (
    authStore.isAuthenticated &&
    (currentUserRoleNorm === 'club_manager' || (_isAffiliationContext && (_clubRole === 'manager' || _clubRole === 'assistant_manager'))) &&
    currentOrgSlug &&
    isSscPortalSlug(String(currentOrgSlug).toLowerCase())
  ) {
    const p = String(to.path || '');
    const onSscAdmin = p === `/${currentOrgSlug}/admin` || p === `/${currentOrgSlug}/admin/`;
    if (userChoseWorkOverSummitFromStores(authStore, agencyStore, organizationStore)) {
      if (onSscAdmin) {
        next({ path: getDashboardRoute(), query: to.query, hash: to.hash, replace: true });
        return;
      }
    } else if (onSscAdmin) {
      next({ path: `/${currentOrgSlug}/club_manager_dashboard`, query: to.query, hash: to.hash, replace: true });
      return;
    }
  }
  if (
    authStore.isAuthenticated &&
    to.meta.requiresAuth &&
    currentUserRoleNorm !== 'super_admin' &&
    isSscPortalSlug(currentOrgSlug) &&
    !isAllowedSscAuthenticatedPath(to.path)
  ) {
    if (userChoseWorkOverSummitFromStores(authStore, agencyStore, organizationStore)) {
      next(getDashboardRoute());
      return;
    }
    next(`/${currentOrgSlug}/my_club_dashboard`);
    return;
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    const hydrated = await tryBootstrapAuthFromCookie();
    if (hydrated) {
      next();
      return;
    }
    const redirectPath = to.fullPath || to.path;
    const redirectQuery = redirectPath && redirectPath !== '/' ? `?redirect=${encodeURIComponent(redirectPath)}` : '';
    // If this is an organization-slug route, always keep the slug in the login redirect
    // so users land on "/:organizationSlug/login" (branded) instead of platform "/login".
    const slug =
      (to.meta.organizationSlug && typeof to.params.organizationSlug === 'string' && to.params.organizationSlug) ||
      null;
    if (slug) {
      const parent =
        to.meta.parentOrgSlug && typeof to.params.parentOrgSlug === 'string'
          ? to.params.parentOrgSlug
          : null;
      const hostImplied =
        String(
          brandingStore.portalHostPortalUrl || getCurrentPortalSlugFromHostCache() || ''
        )
          .trim()
          .toLowerCase() || null;
      const loginPath = buildOrgLoginPath(slug, parent, hostImplied);
      next(`${loginPath}${redirectQuery}`);
      return;
    }
    // Otherwise, redirect based on stored agencies/user role.
    const loginUrl = getLoginUrl(authStore.user);
    next(loginUrl + redirectQuery);
  } else if (to.meta.requiresProviderMobileAccess) {
    if (hasProviderMobileAccess(authStore.user)) {
      next();
    } else {
      next(getDashboardRoute());
    }
  } else if (to.meta.requiresGuest && authStore.isAuthenticated && !allowWhenAuthenticated.has(String(to.name || ''))) {
    // Redirect to appropriate dashboard based on user role
    next(getDashboardRoute());
  } else if (to.meta.requiresApprovedEmployee) {
    // Approved employees and ACTIVE_EMPLOYEE/TERMINATED_PENDING users can access on-demand training
    const canAccessOnDemand = authStore.user?.type === 'approved_employee' || 
                              authStore.user?.status === 'ACTIVE_EMPLOYEE' || 
                              authStore.user?.status === 'TERMINATED_PENDING' ||
                              authStore.user?.status === 'active' ||
                              authStore.user?.status === 'completed';
    if (canAccessOnDemand) {
      // Optional: capability gate (e.g., canViewTraining)
      const required = to.meta.requiresCapability
        ? (Array.isArray(to.meta.requiresCapability) ? to.meta.requiresCapability : [to.meta.requiresCapability])
        : [];
      const caps = authStore.user?.capabilities;
      // Backward-compat: if capabilities are not present yet, don't block navigation.
      const capsMissing = !caps || typeof caps !== 'object' || Object.keys(caps).length === 0;
      const hasAll = capsMissing ? true : (required.length === 0 ? true : required.every((k) => !!caps?.[k]));
      if (hasAll) next();
      else next(getDashboardRoute());
    } else {
      // Redirect to appropriate dashboard
      next(getDashboardRoute());
    }
  } else if (to.meta.requiresRole) {
    if (authStore.isAuthenticated && routeRequiresSchoolPortalsFeature(to)) {
      const agency = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? {};
      const pb = brandingStore.platformBranding || {};
      const allowed = canAccessSchoolPortalsSurfaces({
        userRole: authStore.user?.role,
        agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
        platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
        tenantAvailableAgencyFeaturesOverrideJson:
          agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
      });
      if (!allowed) {
        next(getSlugAwarePath('/dashboard', to, authStore));
        return;
      }
    }
    if (authStore.isAuthenticated && routeRequiresProgramOverviewDashboard(to)) {
      const agency = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? {};
      const pb = brandingStore.platformBranding || {};
      const opts = {
        userRole: authStore.user?.role,
        agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
        platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
        tenantAvailableAgencyFeaturesOverrideJson:
          agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
      };
      const allowed =
        canAccessSchoolPortalsSurfaces(opts) || canAccessSkillBuildersSchoolProgramSurfaces(opts);
      if (!allowed) {
        next(getSlugAwarePath('/dashboard', to, authStore));
        return;
      }
    }
    if (authStore.isAuthenticated && routeRequiresSkillBuildersSchoolProgramFeature(to)) {
      const agencySb = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? {};
      const pbSb = brandingStore.platformBranding || {};
      const sbAllowed = canAccessSkillBuildersSchoolProgramSurfaces({
        userRole: authStore.user?.role,
        agencyFeatureFlags: agencySb.feature_flags ?? agencySb.featureFlags,
        platformAvailableAgencyFeaturesJson: pbSb.available_agency_features_json ?? pbSb.availableAgencyFeaturesJson,
        tenantAvailableAgencyFeaturesOverrideJson:
          agencySb.tenant_available_agency_features_json ?? agencySb.tenantAvailableAgencyFeaturesJson
      });
      // Event portal: assigned providers reach it from the program dashboard / top nav.
      // Per-event access is enforced by the API; do not bounce back to /dashboard (same program portal).
      const isEventPortalRoute = to.name === 'SkillBuildersEventPortal';
      if (!sbAllowed && !hasSkillBuildersToolingBypass(authStore.user) && !isEventPortalRoute) {
        next(getSlugAwarePath('/dashboard', to, authStore));
        return;
      }
    }
    const userRole = authStore.user?.role;
    // Use context-aware effectiveRole for navigation decisions (computed above from currentAgency).
    // Falls back to the global role for users with no active agency context.
    const userRoleNorm = currentEffectiveRoleNorm;
    const requiredRole = to.meta.requiresRole;
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const orgSlugForRoute = typeof to.params?.organizationSlug === 'string' ? to.params.organizationSlug : '';
    const clubManagerSscBypass =
      (currentUserRoleNorm === 'club_manager' || currentUserRoleNorm === 'assistant_manager') &&
      orgSlugForRoute &&
      isSscPortalSlug(String(orgSlugForRoute).toLowerCase()) &&
      (() => {
        const pathNorm = String(to.path || '');
        const prefix = `/${orgSlugForRoute}`;
        return (
          pathNorm.startsWith(`${prefix}/club_manager_dashboard`) ||
          pathNorm.startsWith(`${prefix}/my_club_dashboard`) ||
          pathNorm.startsWith(`${prefix}/admin`) ||
          pathNorm.startsWith(`${prefix}/operations-dashboard`)
        );
      })();

    // Club managers (any context, including SSTC work-tenant where effectiveRole = 'provider'): block payroll/audit surfaces.
    if (userRoleNorm === 'club_manager' || currentUserRoleNorm === 'club_manager') {
      const p = String(to.path || '');
      if (p.includes('/admin/audit-center') || p.includes('/admin/payroll') || p.includes('/admin/expenses')) {
        next(getDashboardRoute());
        return;
      }
    }

    // Audit Center is limited to admin/super_admin only.
    if (String(to.path || '').includes('/admin/audit-center') && userRoleNorm === 'support') {
      next(getDashboardRoute());
      return;
    }
    
    // School staff should not use the employee "Office Schedule" or "Payroll" surfaces.
    // They should stay within their school portal dashboard.
    if (userRoleNorm === 'school_staff') {
      const blockedForSchoolStaff = ['/schedule', '/workforce-operations', '/school-operations', '/people-operations', '/admin/payroll', '/payroll', '/dashboard'];
      if (blockedForSchoolStaff.some((p) => to.path === p || to.path.startsWith(`${p}/`))) {
        next(getDashboardRoute());
        return;
      }
    }

    // Block CPAs and supervisors from accessing restricted routes
    const restrictedRoutes = ['/admin/modules', '/admin/documents', '/admin/settings', '/admin/checklist-items'];
    if ((userRole === 'clinical_practice_assistant' || userRole === 'provider_plus' || userRole === 'supervisor') && 
        restrictedRoutes.some(route => to.path.includes(route))) {
      next('/admin'); // Redirect (route redirects to slug)
      return;
    }
    
    const isSuperadminGuardianPreview =
      userRoleNorm === 'super_admin' &&
      String(to.query?.previewMode || '').trim().toLowerCase() === 'superadmin' &&
      (
        String(to.path || '') === '/guardian' ||
        String(to.path || '').endsWith('/guardian') ||
        String(to.path || '').includes('/guardian/')
      );

    const hasRequiredRole = requiredRoles.some((role) => {
      // Backoffice admin routes: true admins/support only.
      if (role === 'admin') {
        return (
          userRoleNorm === 'admin' ||
          userRoleNorm === 'super_admin' ||
          userRoleNorm === 'support'
        );
      }

      if (role === 'schedule_manager') {
        return (
          userRoleNorm === 'clinical_practice_assistant' ||
          userRoleNorm === 'provider_plus' ||
          userRoleNorm === 'admin' ||
          userRoleNorm === 'super_admin' ||
          userRoleNorm === 'support'
        );
      }

      if (role === 'supervisor_or_cpa') {
        return userRoleNorm === 'supervisor' || userRoleNorm === 'clinical_practice_assistant' || userRoleNorm === 'provider_plus';
      }

      if (role === 'clinical_practice_assistant') {
        return userRoleNorm === 'clinical_practice_assistant' || userRoleNorm === 'provider_plus';
      }

      if (role === 'client_guardian' && isSuperadminGuardianPreview) {
        return true;
      }

      return userRoleNorm === role;
    });

    const hasSubCoordinatorRoleBypass = to.meta.allowSubCoordinator === true && hasSubCoordinatorAccess(authStore.user);

    if (clubManagerSscBypass || hasRequiredRole || hasSubCoordinatorRoleBypass) {
      // Optional: capability gate (e.g., canViewTraining / canSignDocuments)
      const required = to.meta.requiresCapability
        ? (Array.isArray(to.meta.requiresCapability) ? to.meta.requiresCapability : [to.meta.requiresCapability])
        : [];
      const caps = authStore.user?.capabilities;
      // Super admins should not be blocked by capability flags.
      if (userRoleNorm === 'super_admin') {
        next();
        return;
      }
      // Backward-compat: if capabilities are not present yet, don't block navigation.
      const capsMissing = !caps || typeof caps !== 'object' || Object.keys(caps).length === 0;
      const hasAll = capsMissing ? true : (required.length === 0 ? true : required.every((k) => !!caps?.[k]));
      if (hasAll) next();
      else if (clubManagerSscBypass) next();
      else next(getDashboardRoute());
    } else {
      // Redirect to appropriate dashboard
      next(getDashboardRoute());
    }
  } else if (to.meta.requiresCapability) {
    // Capability-only routes (no requiresRole). Must run after requiresRole so routes with BOTH
    // enforce role first — otherwise canViewTraining alone could reach /admin/modules while POSTs 403.
    const required = Array.isArray(to.meta.requiresCapability) ? to.meta.requiresCapability : [to.meta.requiresCapability];
    const caps = authStore.user?.capabilities;
    // Super admins should not be blocked by capability flags.
    if (currentEffectiveRoleNorm === 'super_admin') {
      next();
      return;
    }
    // Backward-compat: if capabilities are not present yet, don't block navigation.
    const capsMissing = !caps || typeof caps !== 'object' || Object.keys(caps).length === 0;
    const hasAll = capsMissing ? true : required.every((k) => !!caps?.[k]);
    if (hasAll) {
      next();
    } else {
      next(getDashboardRoute());
    }
  } else if (to.meta.blockApprovedEmployees) {
    // Guardians landing on employee-only surfaces get sent back to their portal
    if (String(authStore.user?.role || '').toLowerCase() === 'client_guardian') {
      next(getDashboardRoute());
      return;
    }
    // Block approved employees from accessing regular user routes
    if (authStore.user?.type === 'approved_employee') {
      next('/my-learning');
    } else {
      next();
    }
  } else {
    // Block archived / inactive users from all routes
    if (authStore.user?.status === 'ARCHIVED' || authStore.user?.status === 'INACTIVE_EMPLOYEE') {
      next('/login');
      return;
    }

    // Guardians should not roam general employee surfaces
    if (String(authStore.user?.role || '').toLowerCase() === 'client_guardian') {
      const p = String(to.path || '');
      const isGuardianPath = p === '/guardian' || p.endsWith('/guardian') || p.includes('/guardian/');
      const isPractitionerClientDashboard = p.endsWith('/client-dashboard') || p.includes('/client-dashboard');
      const GUARDIAN_ALLOWED_EXTERNAL = ['/tutoring-session/', '/in-person-tutoring-session/'];
      const pathOk =
        isGuardianPath ||
        isPractitionerClientDashboard ||
        GUARDIAN_ALLOWED_EXTERNAL.some((prefix) => p.includes(prefix));
      if (!pathOk) {
        next(getDashboardRoute());
        return;
      }
    }

    // Approved employees: My Learning + on-demand module player only
    const isLearningRoute =
      to.path.includes('/on-demand-training')
      || to.path.includes('/my-learning')
      || to.name === 'MyLearning'
      || to.name === 'OrganizationMyLearning';
    if (authStore.user?.type === 'approved_employee' && !isLearningRoute) {
      next('/my-learning');
    } else {
      next();
    }
  }
});

router.afterEach((to) => {
  const authStore = useAuthStore();
  if (!authStore.isAuthenticated) return;
  const path = String(to?.path || '');
  const query = to?.query || {};
  const queryKeys = Object.keys(query).filter((k) => query[k] != null && query[k] !== '');
  const queryString = queryKeys.length
    ? `?${new URLSearchParams(queryKeys.sort().map((k) => [k, String(query[k])])).toString()}`
    : '';
  const fullPath = `${path}${queryString}`;
  const page = extractAdminPageFromPath(path);

  let clockedIn = false;
  let clockedInSessionId = null;
  try {
    const it = useIndirectTimeSessionStore();
    clockedIn = !!it.isClockedIn;
    clockedInSessionId = it.session?.id || null;
  } catch {
    /* store may not be ready */
  }
  if (clockedIn) {
    api.post('/auth/activity-log', {
      actionType: 'clocked_in_page_view',
      metadata: { path: fullPath, page, clockedInSessionId, tab: query.tab || null }
    }, { skipGlobalLoading: true }).catch(() => {});
  }

  const trackable =
    path.includes('/admin')
    || path.includes('/club_manager_dashboard')
    || /\/client-exchange(\/|$)/i.test(path)
    || path.includes('/schedule/')
    || /\/buildings(\/|$)/i.test(path);
  if (!trackable) return;

  api.post('/auth/activity-log', {
    actionType: 'admin_page_view',
    metadata: { path: fullPath, page, ...(clockedIn ? { clockedIn: true, clockedInSessionId } : {}) }
  }, { skipGlobalLoading: true }).catch(() => {});
});

export default router;
