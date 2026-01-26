import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import { getDashboardRoute } from '../utils/router';
import { getLoginUrl } from '../utils/loginRedirect';

const getDefaultOrganizationSlug = () => {
  try {
    const agencyStore = useAgencyStore();
    const authStore = useAuthStore();

    const fromStore = agencyStore.currentAgency?.slug;
    if (fromStore) return fromStore;

    const fromUserAgencies = authStore.user?.agencies?.[0]?.slug;
    if (fromUserAgencies) return fromUserAgencies;

    const fromStoredUserAgencies = JSON.parse(localStorage.getItem('userAgencies') || '[]')?.[0]?.slug;
    if (fromStoredUserAgencies) return fromStoredUserAgencies;

    const fromLocal = JSON.parse(localStorage.getItem('currentAgency') || 'null')?.slug;
    if (fromLocal) return fromLocal;
  } catch (e) {
    // ignore
  }
  return null;
};

const routes = [
  // Organization-specific routes (supports Agency, School, Program, Learning)
  // School splash page (public, no auth required)
  {
    path: '/:organizationSlug',
    name: 'OrganizationSplash',
    component: () => import('../views/school/SchoolSplashView.vue'),
    meta: { requiresGuest: false, organizationSlug: true } // Allow both guests and authenticated users
  },
  {
    path: '/:organizationSlug/login',
    name: 'OrganizationLogin',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresGuest: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/upload',
    name: 'ReferralUpload',
    component: () => import('../components/school/ReferralUpload.vue'),
    meta: { organizationSlug: true }
  },
  // Public kiosk (no auth)
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
    path: '/:organizationSlug/dashboard',
    name: 'OrganizationDashboard',
    component: () => import('../views/OrganizationDashboardView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/providers/:providerUserId',
    name: 'OrganizationSchoolProviderProfile',
    component: () => import('../views/school/ProviderSchoolProfileView.vue'),
    meta: { requiresAuth: true, organizationSlug: true, requiresRole: ['school_staff', 'provider', 'admin', 'support', 'super_admin'] }
  },
  {
    path: '/:organizationSlug/mydashboard',
    name: 'OrganizationMyDashboardLegacy',
    redirect: (to) => `/${to.params.organizationSlug}/dashboard`,
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/guardian',
    name: 'OrganizationGuardianPortal',
    component: () => import('../views/guardian/GuardianPortalView.vue'),
    meta: { requiresAuth: true, requiresRole: 'client_guardian', organizationSlug: true }
  },
  // Slug-prefixed authenticated routes (branded portal)
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
    name: 'OrganizationBuildings',
    component: () => import('../views/OfficeShellView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/buildings/schedule',
    name: 'OrganizationBuildingsSchedule',
    component: () => import('../views/OfficeScheduleView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/buildings/review',
    name: 'OrganizationBuildingsReview',
    component: () => import('../views/OfficeReviewView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
  },
  {
    path: '/:organizationSlug/buildings/settings',
    name: 'OrganizationBuildingsSettings',
    component: () => import('../views/OfficeSettingsView.vue'),
    meta: { requiresAuth: true, organizationSlug: true }
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
    name: 'OrganizationOfficeScheduleLegacy',
    redirect: (to) => `/${to.params.organizationSlug}/buildings/schedule`,
    meta: { requiresAuth: true, organizationSlug: true }
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
    path: '/:organizationSlug/admin/users/:userId',
    name: 'OrganizationUserProfile',
    component: () => import('../views/admin/UserProfileView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/users',
    name: 'OrganizationUserManager',
    component: () => import('../views/admin/UserManager.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/clients',
    name: 'OrganizationClientManagement',
    component: () => import('../views/admin/ClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'super_admin'], organizationSlug: true }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/settings',
    name: 'OrganizationSettings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications',
    name: 'OrganizationCommunicationsFeed',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications/chats',
    name: 'OrganizationPlatformChats',
    component: () => import('../views/admin/PlatformChatsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/communications/thread/:userId/:clientId',
    name: 'OrganizationCommunicationThread',
    component: () => import('../views/admin/CommunicationThreadView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager', organizationSlug: true }
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
    path: '/:organizationSlug/admin/documents',
    name: 'OrganizationDocumentsLibrary',
    component: () => import('../views/admin/DocumentsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], requiresCapability: 'canSignDocuments', organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/agency-progress',
    name: 'OrganizationAgencyProgress',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], organizationSlug: true }
  },
  {
    path: '/:organizationSlug/admin/payroll',
    name: 'OrganizationPayroll',
    component: () => import('../views/admin/PayrollView.vue'),
    meta: { requiresAuth: true, requiresCapability: 'canManagePayroll', organizationSlug: true }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff'], organizationSlug: true }
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
    path: '/mydashboard',
    name: 'MyDashboardLegacy',
    redirect: '/dashboard',
    meta: { requiresAuth: true }
  },
  {
    path: '/guardian',
    name: 'GuardianPortal',
    component: () => import('../views/guardian/GuardianPortalView.vue'),
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
    name: 'Buildings',
    component: () => import('../views/OfficeShellView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/buildings/schedule',
    name: 'BuildingsSchedule',
    component: () => import('../views/OfficeScheduleView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/buildings/review',
    name: 'BuildingsReview',
    component: () => import('../views/OfficeReviewView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/buildings/settings',
    name: 'BuildingsSettings',
    component: () => import('../views/OfficeSettingsView.vue'),
    meta: { requiresAuth: true }
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
    redirect: '/buildings/schedule',
    meta: { requiresAuth: true }
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
    path: '/admin/clients',
    name: 'ClientManagement',
    component: () => import('../views/admin/ClientManagementView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'provider', 'super_admin'] }
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff', 'super_admin'] }
  },
  {
    path: '/admin/settings',
    name: 'Settings',
    component: () => import('../views/admin/SettingsView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/communications',
    name: 'CommunicationsFeed',
    component: () => import('../views/admin/CommunicationsFeedView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/communications/chats',
    name: 'PlatformChats',
    component: () => import('../views/admin/PlatformChatsView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
  },
  {
    path: '/admin/communications/thread/:userId/:clientId',
    name: 'CommunicationThread',
    component: () => import('../views/admin/CommunicationThreadView.vue'),
    meta: { requiresAuth: true, requiresRole: 'schedule_manager' }
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
    path: '/admin/documents',
    name: 'DocumentsLibrary',
    component: () => import('../views/admin/DocumentsLibraryView.vue'),
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'], requiresCapability: 'canSignDocuments' }
  },
  {
    path: '/admin/agency-progress',
    name: 'AgencyProgress',
    component: () => import('../views/admin/AgencyProgressDashboard.vue'),
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support'] }
  },
  {
    path: '/admin/payroll',
    name: 'Payroll',
    component: () => import('../views/admin/PayrollView.vue'),
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
    meta: { requiresAuth: true, requiresRole: ['admin', 'support', 'staff'] }
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
      const slug = getDefaultOrganizationSlug();
      return slug ? `/${slug}/dashboard` : '/login';
    }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

const getStoredUserAgencies = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('userAgencies') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const userHasSlugAccess = (slug, agencyStore, authStore) => {
  if (!slug) return false;
  const fromStore = agencyStore.userAgencies?.value || agencyStore.userAgencies;
  const agencies = Array.isArray(fromStore) && fromStore.length > 0 ? fromStore : getStoredUserAgencies();

  // Some records use `portal_url` as the slug-ish value
  return agencies.some((a) => a?.slug === slug || a?.portal_url === slug);
};

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const brandingStore = useBrandingStore();
  const agencyStore = useAgencyStore();
  const organizationStore = useOrganizationStore();
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

  // Prevent stale org branding “flash” when leaving a branded portal.
  if (!to.meta.organizationSlug && from.meta.organizationSlug) {
    brandingStore.clearPortalTheme();
  }

  // Prevent stale org branding “flash” when going to platform login
  if (to.path === '/login') {
    brandingStore.clearPortalTheme();
  }

  // On slug-prefixed routes, load org context + apply branding.
  // This is what keeps the portal branded consistently across all authenticated pages.
  if (to.meta.organizationSlug) {
    const slug = to.params.organizationSlug;
    if (typeof slug === 'string' && slug) {
      // Apply portal branding for all slug routes (public + authenticated).
      // (Super admins can still view the portal with correct branding.)
      try {
        await brandingStore.fetchAgencyTheme(slug);
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
  if (authStore.isAuthenticated && authStore.user?.role !== 'super_admin' && to.meta.requiresAuth && !to.meta.organizationSlug) {
    const slug = getDefaultOrganizationSlug();
    if (slug) {
      // Prefix the entire path (preserves queries/hash via fullPath).
      next(`/${slug}${to.fullPath}`);
      return;
    }
  }
  
  // Handle root path redirect based on user role
  if (to.path === '/' && authStore.isAuthenticated) {
    next(getDashboardRoute());
    return;
  }
  
  // Block pending users from accessing training modules and certain routes
  if (to.meta.blockPendingUsers && isPending) {
    next('/dashboard');
    return;
  }
  
  // Block ready_for_review users from accessing most routes (access is locked)
  if (isReadyForReview && to.path !== '/pending-completion' && to.path !== '/dashboard') {
    next('/pending-completion');
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
      next('/change-password');
      return;
    }
  }
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Redirect to appropriate login page based on user's agency
    const loginUrl = getLoginUrl(authStore.user);
    next(loginUrl);
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
  } else if (to.meta.requiresCapability) {
    const required = Array.isArray(to.meta.requiresCapability) ? to.meta.requiresCapability : [to.meta.requiresCapability];
    const caps = authStore.user?.capabilities;
    // Super admins should not be blocked by capability flags.
    if (String(authStore.user?.role || '').toLowerCase() === 'super_admin') {
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
  } else if (to.meta.requiresRole) {
    const userRole = authStore.user?.role;
    const requiredRole = to.meta.requiresRole;
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    // School staff should not use the employee "Office Schedule" or "Payroll" surfaces.
    // They should stay within their school portal dashboard.
    if (String(userRole || '').toLowerCase() === 'school_staff') {
      const blockedForSchoolStaff = ['/schedule', '/admin/payroll', '/payroll', '/dashboard'];
      if (blockedForSchoolStaff.some((p) => to.path === p || to.path.startsWith(`${p}/`))) {
        next(getDashboardRoute());
        return;
      }
    }

    // Block CPAs and supervisors from accessing restricted routes
    const restrictedRoutes = ['/admin/modules', '/admin/documents', '/admin/settings', '/admin/checklist-items'];
    if ((userRole === 'clinical_practice_assistant' || userRole === 'supervisor') && 
        restrictedRoutes.some(route => to.path.includes(route))) {
      next('/admin'); // Redirect (route redirects to slug)
      return;
    }
    
    const hasRequiredRole = requiredRoles.some((role) => {
      // Super admin, admin, support, supervisors, and CPAs can access admin routes
      if (role === 'admin') {
        return (
          userRole === 'admin' ||
          userRole === 'super_admin' ||
          userRole === 'support' ||
          userRole === 'supervisor' ||
          userRole === 'clinical_practice_assistant'
        );
      }

      if (role === 'schedule_manager') {
        return (
          userRole === 'clinical_practice_assistant' ||
          userRole === 'admin' ||
          userRole === 'super_admin' ||
          userRole === 'support'
        );
      }

      if (role === 'supervisor_or_cpa') {
        return userRole === 'supervisor' || userRole === 'clinical_practice_assistant';
      }

      return userRole === role;
    });

    if (hasRequiredRole) {
      // Optional: capability gate (e.g., canViewTraining / canSignDocuments)
      const required = to.meta.requiresCapability
        ? (Array.isArray(to.meta.requiresCapability) ? to.meta.requiresCapability : [to.meta.requiresCapability])
        : [];
      const caps = authStore.user?.capabilities;
      // Super admins should not be blocked by capability flags.
      if (String(userRole || '').toLowerCase() === 'super_admin') {
        next();
        return;
      }
      // Backward-compat: if capabilities are not present yet, don't block navigation.
      const capsMissing = !caps || typeof caps !== 'object' || Object.keys(caps).length === 0;
      const hasAll = capsMissing ? true : (required.length === 0 ? true : required.every((k) => !!caps?.[k]));
      if (hasAll) next();
      else next(getDashboardRoute());
    } else {
      // Redirect to appropriate dashboard
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

export default router;

