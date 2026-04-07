import { createRouter, createWebHistory } from 'vue-router';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import { getDashboardRoute } from '../utils/router';
import { getLoginUrl, getCurrentPortalSlugFromHostCache } from '../utils/loginRedirect';
import { buildOrgLoginPath } from '../utils/orgLoginPath';
import { isSupervisor } from '../utils/helpers';
import { hasProviderMobileAccess } from '../utils/providerMobileAccess';
import { isLikelyMobileViewport, isStandalonePwa } from '../utils/pwa';
import { getSchoolStaffWaiverStatus } from '../utils/schoolStaffWaiverGate';
import api from '../services/api';
import { officeMandatoryBlocking } from '../utils/officeMandatoryGate';
import { isSummitPlatformRouteSlug, NATIVE_APP_ORG_SLUG } from '../utils/summitPlatformSlugs.js';
import { isSstcTenantSlug } from '../config/tenantAppProfiles.js';

const SCHEDULE_HUB_ROLES = ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'staff', 'provider_plus'];
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
const TOOLS_AIDS_ROUTE_SEGMENTS = ['/admin/tools-aids', '/admin/note-aid', '/admin/clinical-note-generator'];
const isSscPortalSlug = isSummitPlatformRouteSlug;

const isAllowedSscAuthenticatedPath = (path) => {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return false;
  // Org-scoped admin subtree (each route enforces role). A single `admin(?:/|$)` alternative does not match `/ssc/admin/surveys`.
  if (/^\/[^/]+\/admin(\/|$)/.test(normalized)) return true;
  // Notifications hub lives outside `/admin` (still org-scoped).
  if (/^\/[^/]+\/notifications(\/|$)/.test(normalized)) return true;
  // Summit tenant: member surfaces + club manager dashboard + operations.
  // `home` = participant portal (not "weekly challenges"); `season` = one season workspace. Legacy `challenges` redirects.
  const allowedOrgScoped =
    /^\/[^/]+\/(home(?:\/|$)|my_club_dashboard(?:\/|$)|season(?:\/|$)|challenges(?:\/|$)|messages(?:\/|$)|clubs(?:\/[^/]+(?:\/(?:members|records))?)?(?:\/|$)|join(?:\/|$)|club\/settings(?:\/|$)|club\/seasons(?:\/|$)|dashboard(?:\/|$)|preferences(?:\/|$)|credentials(?:\/|$)|account-info(?:\/|$)|change-password(?:\/|$)|logout(?:\/|$)|club_manager_dashboard(?:\/|$)|operations-dashboard(?:\/|$))/;
  const allowedGlobal = /^\/(dashboard|preferences|credentials|account-info|change-password|logout)(?:\/|$)/;
  return allowedOrgScoped.test(normalized) || allowedGlobal.test(normalized);
};

const isNonAgencyOrgType = (value) => {
  const t = String(value || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning' || t === 'affiliation';
};

/** Bare /:slug/dashboard → Summit club home (no personal HR tabs in query). */
const SSC_DASHBOARD_PERSONAL_QUERY_KEYS = [
  'tab', 'my', 'sp', 'sso', 'scheduleMode', 'superviseeId', 'employeeId', 'scheduleViewAs', 'programHub', 'sbPrograms', 'programId'
];
const shouldRedirectSscDashboardToMyClub = (query) => {
  const q = query || {};
  return !SSC_DASHBOARD_PERSONAL_QUERY_KEYS.some((k) => q[k] != null && String(q[k]).length > 0);
};
/** Keep classic personal dashboard for internal staff roles (schedule rail, payroll, etc.). */
const SSC_ROLES_SKIP_MY_CLUB_DASH_REDIRECT = new Set([
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
    const fromStore = curAgency?.slug || curAgency?.portal_url;
    if (fromStore) {
      if (!isSchoolStaff && isPortalOrg(curAgency)) {
        const p = String(curAgency.parent_slug || curAgency.parentSlug || '').trim();
        if (p) return p;
      }
      return fromStore;
    }

    // Prefer affiliation (SSC) when picking from stored user agencies
    const isAffiliation = (org) => String(org?.organization_type || org?.organizationType || '').toLowerCase() === 'affiliation';
    const storedList = JSON.parse(localStorage.getItem('userAgencies') || '[]');
    const storedArr = Array.isArray(storedList) ? storedList : [];
    const firstAffiliation = storedArr.find((o) => isAffiliation(o) && pickSlug(o));
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
  const h = String(brandingStore?.portalHostPortalUrl || '').trim().toLowerCase();
  const s = String(segmentSlug || '').trim().toLowerCase();
  return Boolean(h && s && h === s);
};

const routes = [
  // Public school finder (no auth). Must be before "/:organizationSlug".
  {
    path: '/schools',
    name: 'SchoolFinder',
    component: () => import('../views/school/SchoolFinderView.vue'),
    meta: { requiresGuest: false }
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
    path: '/careers/:agencySlug',
    name: 'PublicCareers',
    component: () => import('../views/public/PublicCareersView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/i/:publicKey',
    name: 'PublicIntakeSigningShort',
    component: () => import('../views/PublicIntakeSigningView.vue'),
    meta: { requiresGuest: false }
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
    path: '/communications',
    name: 'PublicCommunicationsProof',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: { requiresGuest: false }
  },
  {
    path: '/:organizationSlug/communications',
    redirect: (to) => ({
      path: `/${to.params.organizationSlug}/admin/communications`,
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
    component: () => import('../views/public/PublicSkillBuildersEventKioskView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/skill-builders/kiosk/:eventId',
    name: 'OrganizationSkillBuildersEventKioskStation',
    component: () => import('../views/public/PublicSkillBuildersEventKioskStationView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/event-day-kiosk',
    name: 'OrganizationEventDayKiosk',
    component: () => import('../views/public/PublicEventDayKioskView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
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
    component: () => import('../views/SscPublicClubView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/clubs/:clubId/members',
    name: 'SscClubMembersDirectory',
    component: () => import('../views/SscClubMembersDirectoryView.vue'),
    meta: { requiresGuest: false, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/clubs/:clubId/records',
    name: 'SscClubTeamRecords',
    component: () => import('../views/SscClubTeamRecordsView.vue'),
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
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/join',
    name: 'SscMemberApplication',
    component: () => import('../views/SscMemberApplicationView.vue'),
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
  // Kiosk login (kiosk users only)
  {
    path: '/kiosk/login',
    name: 'KioskLogin',
    component: () => import('../views/KioskLoginView.vue'),
    meta: { requiresGuest: false }
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
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/join/team-meeting/:eventId',
    name: 'OrganizationJoinTeamMeeting',
    component: () => import('../views/teamMeeting/JoinTeamMeetingView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/dashboard',
    name: 'OrganizationDashboard',
    component: () => import('../views/OrganizationDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
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
    path: '/:organizationSlug/admin/note-aid',
    name: 'OrganizationNoteAid',
    // Note Aid now runs the Clinical Director Agent note generator.
    component: () => import('../views/admin/ClinicalNoteGeneratorView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'provider', 'super_admin', 'intern'],
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
  // Backward-compatible: legacy schedule route
  {
    path: '/:organizationSlug/schedule',
    name: 'OrganizationScheduleHub',
    component: () => import('../views/ScheduleHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/schedule/staff',
    name: 'OrganizationStaffScheduleCompare',
    component: () => import('../views/StaffScheduleCompareView.vue'),
    meta: { requiresAuth: true, organizationSlug: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'] }
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
    component: () => import('../views/TracksView.vue'),
    meta: { requiresAuth: true, blockPendingUsers: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/tasks',
    name: 'OrganizationTasks',
    component: () => import('../views/TasksView.vue'),
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
    component: () => import('../views/OnDemandTrainingLibraryView.vue'),
    meta: { requiresAuth: true, requiresApprovedEmployee: true, requiresCapability: 'canViewTraining', organizationSlug: true }
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
    meta: { requiresAuth: true, requiresRole: 'club_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin',
    name: 'OrganizationAdminDashboard',
    component: () => import('../views/admin/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
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
    path: '/:organizationSlug/admin/modules/:id/content-editor',
    name: 'OrganizationModuleContentEditor',
    component: () => import('../views/admin/ModuleContentEditor.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'club_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/users',
    name: 'OrganizationUserManager',
    component: () => import('../views/admin/UserManager.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'club_manager'], organizationSlug: true }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/clients',
    name: 'OrganizationClientManagement',
    component: () => import('../views/admin/ClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/clinical-note-generator',
    name: 'OrganizationClinicalNoteGenerator',
    redirect: (to) => `/${to.params.organizationSlug}/admin/note-aid`,
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'staff', 'provider', 'super_admin', 'intern'],
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
    path: '/:organizationSlug/admin/settings',
    name: 'OrganizationSettings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin'], organizationSlug: true }
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
    name: 'OrganizationCommunicationsFeed',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/communications/sms',
    name: 'OrganizationSmsInbox',
    component: () => import('../views/admin/SmsInboxView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/tools-aids',
    name: 'OrganizationToolsAids',
    component: () => import('../views/admin/ToolsAidsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'provider', 'staff', 'clinical_practice_assistant', 'supervisor'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications/chats',
    name: 'OrganizationPlatformChats',
    component: () => import('../views/admin/PlatformChatsView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff'],
      organizationSlug: true
    }
  },
  {
    path: '/:organizationSlug/admin/communications/campaigns',
    name: 'OrganizationAgencyCampaigns',
    component: () => import('../views/admin/AgencyCampaignsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'school_staff', 'provider', 'clinical_practice_assistant', 'supervisor', 'schedule_manager'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications/thread/:userId/:clientId',
    name: 'OrganizationCommunicationThread',
    component: () => import('../views/admin/CommunicationThreadView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff'],
      organizationSlug: true
    }
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
    component: () => import('../views/admin/OfficeScheduleApprovalsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/external-calendar-audit',
    name: 'OrganizationExternalCalendarAudit',
    component: () => import('../views/admin/ExternalCalendarAuditView.vue'),
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
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
    component: () => import('../views/admin/NotificationsView.vue'),
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
    meta: { requiresAuth: true, organizationSlug: true }
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
    name: 'OrganizationHiringCandidates',
    component: () => import('../views/admin/HiringCandidatesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/careers',
    name: 'OrganizationCareers',
    component: () => import('../views/admin/CareersView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/availability-intake',
    name: 'OrganizationAvailabilityIntake',
    component: () => import('../views/admin/AvailabilityIntakeView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus', 'staff'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/notifications',
    name: 'OrganizationSupervisorNotifications',
    component: () => import('../views/NotificationsHubView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/notifications/team',
    name: 'OrganizationTeamNotifications',
    component: () => import('../views/SupervisorNotificationsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'supervisor_or_cpa', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/find-providers',
    name: 'OrganizationAdminFindProviders',
    component: () => import('../views/SupervisorAvailabilityLabView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'supervisor'], organizationSlug: true }
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
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { requiresAuth: true, blockApprovedEmployees: true }
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
  // Backward-compatible: legacy schedule route
  {
    path: '/schedule',
    name: 'OfficeScheduleLegacy',
    component: () => import('../views/ScheduleHubView.vue'),
    meta: { requiresAuth: true, requiresRole: SCHEDULE_HUB_ROLES }
  },
  {
    path: '/schedule/staff',
    name: 'StaffScheduleCompare',
    component: () => import('../views/StaffScheduleCompareView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant'] }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
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
    path: '/admin/modules/:id/content-editor',
    name: 'ModuleContentEditor',
    component: () => import('../views/admin/ModuleContentEditor.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
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
    path: '/admin/intake-links',
    redirect: '/admin/digital-forms'
  },
  {
    path: '/admin/users/:userId',
    name: 'UserProfile',
    component: () => import('../views/admin/UserProfileView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/users',
    name: 'UserManager',
    component: () => import('../views/admin/UserManager.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] }
  },
  {
    path: '/admin/clients',
    name: 'ClientManagement',
    component: () => import('../views/admin/ClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'provider_plus', 'super_admin'] }
  },
  {
    path: '/admin/note-aid',
    name: 'NoteAid',
    // Note Aid now runs the Clinical Director Agent note generator.
    component: () => import('../views/admin/ClinicalNoteGeneratorView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'super_admin'] }
  },
  {
    path: '/admin/compliance-corner',
    name: 'ComplianceCorner',
    component: () => import('../views/admin/ComplianceCornerView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'super_admin'] }
  },
  {
    path: '/admin/presence',
    name: 'PresenceTeamBoard',
    component: () => import('../views/admin/PresenceTeamBoardView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'super_admin'] }
  },
  {
    path: '/admin/beta-feedback',
    name: 'BetaFeedbackAdmin',
    component: () => import('../views/admin/BetaFeedbackAdminView.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin'] }
  },
  {
    path: '/admin/public-marketing-pages',
    name: 'PublicMarketingPagesAdmin',
    component: () => import('../views/admin/PublicMarketingPagesAdminView.vue'),
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
    redirect: '/admin/note-aid',
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'super_admin', 'intern'] }
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
    path: '/admin/settings',
    name: 'Settings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/support-tickets',
    name: 'SupportTicketsQueue',
    component: () => import('../views/admin/SupportTicketsQueueView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'] }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'] }
  },
  {
    path: '/:organizationSlug/tickets',
    name: 'OrganizationTicketsQueue',
    component: () => import('../views/admin/SupportTicketsQueueView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'], organizationSlug: true }
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
    name: 'CommunicationsFeed',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff'] }
  },
  {
    path: '/admin/communications/sms',
    name: 'SmsInbox',
    component: () => import('../views/admin/SmsInboxView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff']
    }
  },
  {
    path: '/admin/tools-aids',
    name: 'ToolsAids',
    component: () => import('../views/admin/ToolsAidsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'provider', 'staff', 'clinical_practice_assistant', 'supervisor'] }
  },
  {
    path: '/admin/communications/chats',
    name: 'PlatformChats',
    component: () => import('../views/admin/PlatformChatsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff'] }
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
    name: 'CommunicationThread',
    component: () => import('../views/admin/CommunicationThreadView.vue'),
    meta: {
      requiresAuth: true,
      requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'schedule_manager', 'provider', 'staff', 'school_staff']
    }
  },
  {
    path: '/admin/schedule-approvals',
    name: 'OfficeScheduleApprovals',
    component: () => import('../views/admin/OfficeScheduleApprovalsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/external-calendar-audit',
    name: 'ExternalCalendarAudit',
    component: () => import('../views/admin/ExternalCalendarAuditView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
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
    component: () => import('../views/admin/NotificationsView.vue'),
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
    name: 'HiringCandidates',
    component: () => import('../views/admin/HiringCandidatesView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManageHiring' }
  },
  {
    path: '/admin/careers',
    name: 'Careers',
    component: () => import('../views/admin/CareersView.vue'),
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
    component: () => import('../views/SupervisorNotificationsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'supervisor_or_cpa' }
  },
  {
    path: '/admin/find-providers',
    name: 'AdminFindProviders',
    component: () => import('../views/SupervisorAvailabilityLabView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'supervisor'] }
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
    component: () => import('../views/TracksView.vue'),
    meta: { requiresAuth: true, blockPendingUsers: true }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('../views/TasksView.vue'),
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
    component: () => import('../views/OnDemandTrainingLibraryView.vue'),
    meta: { requiresAuth: true, requiresApprovedEmployee: true, requiresCapability: 'canViewTraining' }
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
  const isPortalOrg = (a) => {
    const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
    return t === 'school' || t === 'program' || t === 'learning';
  };
  const pick = (a) => a?.portal_url || a?.portalUrl || a?.slug || null;

  // Prefer only school org slugs for school_staff.
  const out = (agencies || [])
    .filter((a) => isPortalOrg(a))
    .map((a) => String(pick(a) || '').trim())
    .filter(Boolean);

  return out;
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

router.beforeEach(async (to, from, next) => {
  if (officeMandatoryBlocking.value) {
    const path = String(to.path || '');
    if (path === '/login' || path.endsWith('/login') || path.includes('/logout')) {
      return next();
    }
    if (to.fullPath === from.fullPath) return next();
    return next(false);
  }

  const authStore = useAuthStore();
  const brandingStore = useBrandingStore();
  const agencyStore = useAgencyStore();
  const organizationStore = useOrganizationStore();

  // Native iOS/Android builds can be pinned to one tenant slug (SSTC by default).
  // This keeps app launches in the intended branded surface instead of generic /login.
  if (Capacitor.isNativePlatform() && NATIVE_APP_ORG_SLUG) {
    const rawPath = String(to.path || '');
    const isAlreadyScoped =
      rawPath === `/${NATIVE_APP_ORG_SLUG}` || rawPath.startsWith(`/${NATIVE_APP_ORG_SLUG}/`);
    const isSummitStatsAlias =
      rawPath === '/summit-stats' || rawPath.startsWith('/summit-stats/');

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

  // Summit Stats canonical slug redirect: /summit-stats/* → /ssc/*
  // The platform org may have been created with slug "summit-stats" but the canonical
  // public-facing URL is /ssc. Redirect transparently so links and bookmarks still work.
  {
    const rawPath = String(to.path || '');
    if (rawPath === '/summit-stats' || rawPath.startsWith('/summit-stats/')) {
      const rest = rawPath === '/summit-stats' ? '' : rawPath.slice('/summit-stats'.length);
      next({ path: `/ssc${rest}`, query: to.query, hash: to.hash, replace: true });
      return;
    }
    // Also handle /ssc/summit-stats/* → /ssc/*
    // The "Remember username" logic can store orgSlug='summit-stats' and parentOrgSlug='ssc',
    // which causes the partner-hub redirect to build /ssc/summit-stats/login. Normalise it.
    if (rawPath === '/ssc/summit-stats' || rawPath.startsWith('/ssc/summit-stats/')) {
      const rest = rawPath.slice('/ssc/summit-stats'.length) || '/';
      next({ path: `/ssc${rest}`, query: to.query, hash: to.hash, replace: true });
      return;
    }
  }

  // Custom domain / subdomain portals: never keep /{portalSlug}/… in the path (host is already the bucket).
  const hostPortalEarly = String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase();
  if (hostPortalEarly) {
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

  // Club managers (admin with only affiliation orgs): redirect /admin to /ssc/admin
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
          if (slug && String(slug).trim()) {
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

        // Keep organization + agency stores aligned to the slug so the rest of the app
        // (filters, permissions, agency-scoped data) stays consistent.
        try {
          const org = await organizationStore.fetchBySlug(slug);
          if (org && authStore.isAuthenticated && authStore.user?.role !== 'super_admin') {
            // IMPORTANT: Do NOT overwrite the user's current agency context just because they visited a public
            // organization splash page. Only sync currentAgency when:
            // - the route requires auth (they are entering a branded portal), OR
            // - the user actually belongs to that organization (prevents “/school” prefix sticking).
            const shouldSyncAgencyContext = !!to.meta.requiresAuth || userHasSlugAccess(slug, agencyStore, authStore);
            if (shouldSyncAgencyContext) {
              agencyStore.setCurrentAgency(org);
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
  const allowUnscopedDocumentSigning = ['DocumentSigning', 'DocumentReview', 'DocumentPrint'].includes(String(to.name || ''));
  // Users with affiliation (SSC) access: redirect to club dashboard instead of platform /dashboard
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

  // Summit Stats (SSC): default /:slug/dashboard is the club home (SummitStatsDashboardView), not the personal shell.
  // Personal dashboard: /ssc/dashboard?tab=my&my=account (etc.). Staff roles keep the classic dashboard when no query.
  if (
    authStore.isAuthenticated &&
    to.name === 'OrganizationDashboard' &&
    typeof to.params.organizationSlug === 'string' &&
    isSstcTenantSlug(to.params.organizationSlug) &&
    shouldRedirectSscDashboardToMyClub(to.query)
  ) {
    const roleNorm = String(authStore.user?.role || '').toLowerCase();
    if (!SSC_ROLES_SKIP_MY_CLUB_DASH_REDIRECT.has(roleNorm)) {
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
    authStore.user?.role !== 'super_admin' &&
    to.meta.requiresAuth &&
    !to.meta.organizationSlug &&
    !allowUnscopedDashboard &&
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
  if (authStore.isAuthenticated && String(authStore.user?.role || '').toLowerCase() === 'school_staff') {
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
      'OrganizationDocumentPrint'
    ]);
    const allowedUnscopedRouteNames = new Set([
      'DocumentSigning',
      'DocumentReview'
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

  if (authStore.isAuthenticated && String(authStore.user?.role || '').toLowerCase() === 'school_staff') {
    const exemptRouteNames = new Set([
      'DocumentSigning',
      'DocumentReview',
      'OrganizationDocumentSigning',
      'OrganizationDocumentReview'
    ]);
    const currentRouteName = String(to.name || '');
    const slug = (typeof to.params.organizationSlug === 'string' && to.params.organizationSlug) || getDefaultOrganizationSlug();
    if (slug) {
      try {
        const waiverStatus = await getSchoolStaffWaiverStatus({
          api,
          authUser: authStore.user,
          organizationSlug: slug
        });
        const requiresWaiver = Boolean(waiverStatus?.required);
        const isSigned = Boolean(waiverStatus?.isSigned);
        const requiredTaskId = Number(waiverStatus?.taskId || 0) || null;
        if (requiresWaiver && !isSigned) {
          const queryMode = String(to.query?.sp || '').trim().toLowerCase();
          const isDashboardDocuments =
            currentRouteName === 'OrganizationDashboard' &&
            String(to.params.organizationSlug || '') === String(slug) &&
            queryMode === 'documents';
          const isRequiredTaskSigningRoute =
            exemptRouteNames.has(currentRouteName) &&
            requiredTaskId &&
            Number(to.params?.taskId || 0) === requiredTaskId;
          if (!isDashboardDocuments && !isRequiredTaskSigningRoute) {
            next(`/${slug}/dashboard?sp=documents`);
            return;
          }
        }
      } catch {
        // Best-effort gate: if status lookup fails, do not hard-block navigation.
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
    const isAllowedExternalRoute = path.includes('/admin/note-aid');
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
    // In a work-tenant context a global club_manager should navigate as a provider.
    if (currentUserRoleNorm === 'club_manager') return 'provider';
    return currentUserRoleNorm;
  })();

  if (
    authStore.isAuthenticated &&
    (currentUserRoleNorm === 'club_manager' || (_isAffiliationContext && (_clubRole === 'manager' || _clubRole === 'assistant_manager'))) &&
    currentOrgSlug &&
    isSscPortalSlug(String(currentOrgSlug).toLowerCase())
  ) {
    const p = String(to.path || '');
    if (p === `/${currentOrgSlug}/admin` || p === `/${currentOrgSlug}/admin/`) {
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
    const userRole = authStore.user?.role;
    // Use context-aware effectiveRole for navigation decisions (computed above from currentAgency).
    // Falls back to the global role for users with no active agency context.
    const userRoleNorm = currentEffectiveRoleNorm;
    const requiredRole = to.meta.requiresRole;
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const orgSlugForRoute = typeof to.params?.organizationSlug === 'string' ? to.params.organizationSlug : '';
    const clubManagerSscBypass =
      currentUserRoleNorm === 'club_manager' &&
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

    // Club managers (any context, including SSC work-tenant where effectiveRole = 'provider'): block payroll/audit surfaces.
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
      const blockedForSchoolStaff = ['/schedule', '/admin/payroll', '/payroll', '/dashboard'];
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
    // Block approved employees from accessing regular user routes
    if (authStore.user?.type === 'approved_employee') {
      next('/on-demand-training');
    } else {
      next();
    }
  } else {
    // Block ARCHIVED users from all routes
    if (authStore.user?.status === 'ARCHIVED') {
      next('/login');
      return;
    }
    
    // Block regular routes for approved employees - they should only access on-demand training
    const isOnDemandRoute = to.path.includes('/on-demand-training');
    if (authStore.user?.type === 'approved_employee' && !isOnDemandRoute) {
      next('/on-demand-training');
    } else {
      next();
    }
  }
});

router.afterEach((to) => {
  const authStore = useAuthStore();
  if (!authStore.isAuthenticated) return;
  const path = String(to?.path || '');
  if (!path.includes('/admin') && !path.includes('/club_manager_dashboard')) return;
  const page = path.replace(/^\/[^/]+\/admin\/?/, '').replace(/^\/admin\/?/, '') || 'dashboard';
  api.post('/auth/activity-log', {
    actionType: 'admin_page_view',
    metadata: { path, page: page || 'dashboard' }
  }).catch(() => {});
});

export default router;
