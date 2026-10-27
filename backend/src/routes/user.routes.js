import { requireAccountAdministrator, excludeSupportSettings, supportOwnAccountOnly, supportProfileUpdateOnly } from '../middleware/supportContentAccess.middleware.js';
import { getMyAccountAccess, revealMyAccountTempPassword } from '../controllers/myAccountAccess.controller.js';
import express from 'express';
import { checkUserLoginHelp, sendUserLoginHelp } from '../controllers/loginHelp.controller.js';
import { listStaffCardAgencies, listStaffServiceAssignments, updateStaffServiceAssignments, guardAgencyMembershipUpdate } from '../controllers/staffTenantCards.controller.js';
import { getCurrentUser, getAllUsers, getGuardianUsers, getGuardianLinkedClients, getGuardianEvents, getGuardiansBulkDeletePreview, bulkDeleteGuardians, aiQueryUsers, getUserById, getUserStravaConnection, updateUser, updateUserStatus, requireSkillBuilderConfirmNextLogin, getUserAgencies, getSuperviseePortalSlugs, getProvidersForSupport, getAffiliatedPortals, assignUserToAgency, setUserDefaultAgency, removeUserFromAgency, setUserAgencyPayrollAccess, setUserAgencyBillingAccess, setUserAgencyDepartmentAccess, getUserDepartmentAccess, setUserAgencyH0032Mode, setUserAgencyMembershipRole, setUserAgencySupervisionPrelicensed, getSupervisionPrelicensedClassification, generateInvitationToken, generateTemporaryPassword, setCustomTemporaryPassword, resetPasswordlessToken, sendInitialSetupLink, resendSetupLink, sendResetPasswordLink, sendResetPasswordLinkSms, getUserCredentials, getAccountInfo, getProfileOverview, downloadCompletionPackage, getOnboardingChecklist, markChecklistItemComplete, markUserComplete, markUserTerminated, markUserActive, getOnboardingDocument, archiveUser, setStaffInactive, restoreUser, deleteUser, deleteMe, getArchivedUsers, deactivateUser, markPendingComplete, checkPendingCompletionStatus, movePendingToActive, getPendingCompletionSummary, wipePendingUserData, changePassword, toggleSupervisorPrivileges, promoteToOnboarding, createCurrentEmployee, getUserLoginEmailAliases, addUserLoginEmailAlias, removeUserLoginEmailAlias, getUserScheduleSummary, listUserMeetingCandidates, createUserMeetingInviteGroup, updateUserMeetingInviteGroupMembers, listUserVirtualSessionClients, createUserScheduleEvent, getUserScheduleEventNotificationPlan, updateUserScheduleEvent, deleteUserScheduleEvent, getUserGoogleEvent, patchUserGoogleEvent, deleteUserGoogleEvent, getUserExternalCalendars, createUserExternalCalendar, addUserExternalCalendarFeed, patchUserExternalCalendar, patchUserExternalCalendarFeed, setSsoPasswordOverride } from '../controllers/user.controller.js';
import {
  getPeopleDuplicates,
  getPeopleTests,
  previewPeopleMerge,
  applyPeopleMerge,
  patchUserDemo,
  bulkPatchDemo
} from '../controllers/identityHygiene.controller.js';
import { getUserOfficeAssignments, upsertUserOfficeAssignments } from '../controllers/userOfficeAssignments.controller.js';
import { upload as uploadProfilePhoto, uploadUserProfilePhoto, uploadUserEmailSignature, getUserEmailSignaturePreview, patchUserEmailSignature } from '../controllers/userProfilePhoto.controller.js';
import {
  photoUpload,
  listUserPhotos,
  uploadUserPhoto,
  setProfilePhoto,
  deleteUserPhoto,
  flagUserPhoto,
  unflagUserPhoto,
  moderateRemovePhoto,
  listFlaggedPhotos
} from '../controllers/userPhotos.controller.js';
import { getUserTrainingFocuses, getTrainingFocusPath } from '../controllers/track.controller.js';
import {
  getUserClinicalFocus,
  putUserClinicalFocus,
  getUserProviderPublicProfile,
  upsertUserProviderPublicProfile,
  getAgencyProviderPortalSettings,
  upsertAgencyProviderPortalSettings
} from '../controllers/providerPublicProfile.controller.js';
import {
  getUserAgencyPracticeCategories,
  putUserAgencyPracticeCategories,
  postUserAgencyPracticeCategory,
  deleteUserAgencyPracticeCategory
} from '../controllers/practiceCategories.controller.js';
import { authenticate, requireAdmin, requireBackofficeAdmin, requireBackofficeAdminOrCpa } from '../middleware/auth.middleware.js';
import { getUserWorkSchedule, putUserWorkSchedule } from '../controllers/userWorkSchedule.controller.js';
import {
  getUserGridFields,
  getUserGrid,
  putUserGridCells,
  putUserGridBulk,
  postUserGridBulkArchive,
  postUserGridBulkDelete,
  postUserGridFile,
  gridUpload
} from '../controllers/userGrid.controller.js';
import {
  getUserLifecycle,
  updateLifecycleDates,
  updateLifecycleCredentials,
  updateSeparationInfo,
  toggleLifecycleChecklistItem,
  setLifecycleChecklistNotApplicable,
  setLifecycleChecklistScheduledAt,
  syncLifecycle,
  uploadLifecycleChecklistAttachment,
  downloadLifecycleChecklistAttachment,
  deleteLifecycleChecklistAttachment,
  getFederalBackgroundExpirationYears,
  updateFederalBackgroundExpirationYears,
} from '../controllers/lifecycle.controller.js';
import {
  getMyBackgroundExpiration,
  putMyBackgroundScheduledDate,
  getUserDistrictBackgroundProcesses
} from '../controllers/districtBackgroundProcess.controller.js';
import {
  listMyApplicationCopies,
  downloadMyApplicationCopy
} from '../controllers/myApplicationCopies.controller.js';

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.get('/me/account-access', authenticate, getMyAccountAccess);
router.post('/me/account-access/systems/:systemKey/reveal-temp-password', authenticate, revealMyAccountTempPassword);
router.delete('/me', authenticate, deleteMe);
router.get('/me/agencies', authenticate, getUserAgencies);
router.get('/me/supervisee-portal-slugs', authenticate, getSuperviseePortalSlugs);
router.get('/me/providers-for-support', authenticate, getProvidersForSupport);
router.get('/me/background-expiration', authenticate, getMyBackgroundExpiration);
router.put('/me/background-scheduled', authenticate, putMyBackgroundScheduledDate);
router.get('/me/application-copies', authenticate, listMyApplicationCopies);
router.get('/me/application-copies/:id/download', authenticate, downloadMyApplicationCopy);
router.get('/', authenticate, (req, res, next) => {
  // Assignment options have their own tenant + hiring/staff authorization and
  // return a limited employee projection instead of the full admin directory.
  if (req.query.staffOnly === 'true' || req.query.supervisorsOnly === 'true') return next();
  if (req.user.role === 'support') return excludeSupportSettings(req, res, next);
  return requireAdmin(req, res, next);
}, getAllUsers);
router.get('/grid/fields', authenticate, requireAccountAdministrator, requireBackofficeAdmin, getUserGridFields);
router.get('/grid', authenticate, requireAccountAdministrator, requireBackofficeAdmin, getUserGrid);
router.put('/grid/cells', authenticate, requireAccountAdministrator, requireBackofficeAdmin, putUserGridCells);
router.put('/grid/bulk', authenticate, requireAccountAdministrator, requireBackofficeAdmin, putUserGridBulk);
router.post('/grid/bulk-archive', authenticate, requireAccountAdministrator, requireBackofficeAdmin, postUserGridBulkArchive);
router.post('/grid/bulk-delete', authenticate, requireAccountAdministrator, requireBackofficeAdmin, postUserGridBulkDelete);
router.post('/grid/:userId/file', authenticate, requireAccountAdministrator, requireBackofficeAdmin, gridUpload.single('file'), postUserGridFile);
router.get('/guardians', authenticate, requireBackofficeAdmin, getGuardianUsers);
router.post('/guardians/bulk/delete-preview', authenticate, excludeSupportSettings, requireBackofficeAdmin, getGuardiansBulkDeletePreview);
router.delete('/guardians/bulk', authenticate, excludeSupportSettings, requireBackofficeAdmin, bulkDeleteGuardians);
router.get('/ai-query', authenticate, requireBackofficeAdmin, aiQueryUsers);
router.get('/duplicates', authenticate, requireBackofficeAdmin, getPeopleDuplicates);
router.get('/tests', authenticate, requireBackofficeAdmin, getPeopleTests);
router.post('/merge/preview', authenticate, requireBackofficeAdmin, previewPeopleMerge);
router.post('/merge', authenticate, excludeSupportSettings, requireBackofficeAdmin, applyPeopleMerge);
router.post('/demo/bulk', authenticate, excludeSupportSettings, requireBackofficeAdmin, bulkPatchDemo);
router.get('/archived', authenticate, requireBackofficeAdmin, getArchivedUsers); // Must come before /:id
router.get('/:id/agencies', authenticate, supportOwnAccountOnly, getUserAgencies);
router.get('/:id/login-email-aliases', authenticate, supportOwnAccountOnly, requireBackofficeAdmin, getUserLoginEmailAliases);
router.post('/:id/login-email-alias', authenticate, supportOwnAccountOnly, requireBackofficeAdmin, addUserLoginEmailAlias);
router.delete('/:id/login-email-alias', authenticate, supportOwnAccountOnly, requireBackofficeAdmin, removeUserLoginEmailAlias);
router.get('/:id/schedule-summary', authenticate, getUserScheduleSummary);
router.get('/:id/work-schedule', authenticate, getUserWorkSchedule);
router.put('/:id/work-schedule', authenticate, putUserWorkSchedule);
router.get('/:id/meeting-candidates', authenticate, listUserMeetingCandidates);
router.post('/:id/meeting-invite-groups', authenticate, createUserMeetingInviteGroup);
router.put('/:id/meeting-invite-groups/:groupId/members', authenticate, updateUserMeetingInviteGroupMembers);
router.get('/:id/virtual-session-clients', authenticate, listUserVirtualSessionClients);
router.post('/:id/schedule-events', authenticate, createUserScheduleEvent);
router.get('/:id/schedule-events/:eventId/notification-plan', authenticate, getUserScheduleEventNotificationPlan);
router.patch('/:id/schedule-events/:eventId', authenticate, updateUserScheduleEvent);
router.delete('/:id/schedule-events/:eventId', authenticate, deleteUserScheduleEvent);
router.get('/:id/google-events/:eventId', authenticate, getUserGoogleEvent);
router.patch('/:id/google-events/:eventId', authenticate, patchUserGoogleEvent);
router.delete('/:id/google-events/:eventId', authenticate, deleteUserGoogleEvent);
router.get('/:id/office-assignments', authenticate, requireBackofficeAdmin, getUserOfficeAssignments);
router.put('/:id/office-assignments', authenticate, requireBackofficeAdmin, upsertUserOfficeAssignments);
router.get('/:id/provider-clinical-focus', authenticate, getUserClinicalFocus);
router.put('/:id/provider-clinical-focus', authenticate, putUserClinicalFocus);
router.get('/:id/provider-public-profile', authenticate, getUserProviderPublicProfile);
router.put('/:id/provider-public-profile', authenticate, upsertUserProviderPublicProfile);
router.get('/:userId/agencies/:agencyId/practice-categories', authenticate, getUserAgencyPracticeCategories);
router.put('/:userId/agencies/:agencyId/practice-categories', authenticate, putUserAgencyPracticeCategories);
router.post('/:userId/agencies/:agencyId/practice-categories/:category', authenticate, postUserAgencyPracticeCategory);
router.delete('/:userId/agencies/:agencyId/practice-categories/:category', authenticate, deleteUserAgencyPracticeCategory);
router.get('/agency-provider-portal/:agencyId', authenticate, getAgencyProviderPortalSettings);
router.put('/agency-provider-portal/:agencyId', authenticate, excludeSupportSettings, upsertAgencyProviderPortalSettings);
router.get('/:id/affiliated-portals', authenticate, getAffiliatedPortals);
router.get('/:id/external-calendars', authenticate, getUserExternalCalendars);
router.post('/:id/external-calendars', authenticate, createUserExternalCalendar);
router.post('/:id/external-calendars/:calendarId/feeds', authenticate, addUserExternalCalendarFeed);
router.patch('/:id/external-calendars/:calendarId', authenticate, patchUserExternalCalendar);
router.patch('/:id/external-calendars/:calendarId/feeds/:feedId', authenticate, patchUserExternalCalendarFeed);
router.get('/:id/guardian-clients', authenticate, requireBackofficeAdmin, getGuardianLinkedClients);
router.get('/:id/guardian-events', authenticate, requireBackofficeAdmin, getGuardianEvents);
router.get('/:id/strava-connection', authenticate, getUserStravaConnection);
router.get('/:id', authenticate, supportOwnAccountOnly, getUserById);
router.patch('/:id/demo', authenticate, excludeSupportSettings, requireBackofficeAdmin, patchUserDemo);
router.put('/:id', authenticate, supportProfileUpdateOnly, updateUser);
router.put('/:id/status', authenticate, excludeSupportSettings, requireBackofficeAdmin, updateUserStatus);
router.post('/:id/skill-builder/require-confirm-next-login', authenticate, requireSkillBuilderConfirmNextLogin);
router.post('/:id/profile-photo', authenticate, uploadProfilePhoto.single('photo'), uploadUserProfilePhoto);
router.get('/:id/email-signature/preview', authenticate, getUserEmailSignaturePreview);
router.patch('/:id/email-signature', authenticate, patchUserEmailSignature);
router.post('/:id/email-signature', authenticate, uploadProfilePhoto.single('signature'), uploadUserEmailSignature);

// User photo album
router.get('/photos/flagged', authenticate, listFlaggedPhotos);
router.get('/:id/photos', authenticate, listUserPhotos);
router.post('/:id/photos', authenticate, photoUpload.single('file'), uploadUserPhoto);
router.put('/:id/photos/:photoId/set-profile', authenticate, setProfilePhoto);
router.delete('/:id/photos/:photoId', authenticate, deleteUserPhoto);
router.post('/:id/photos/:photoId/flag', authenticate, flagUserPhoto);
router.delete('/:id/photos/:photoId/flag', authenticate, unflagUserPhoto);
router.delete('/:id/photos/:photoId/moderate', authenticate, moderateRemovePhoto);

router.post('/assign/agency', authenticate, excludeSupportSettings, requireBackofficeAdmin, assignUserToAgency);
router.put('/:id/default-agency', authenticate, excludeSupportSettings, requireBackofficeAdmin, setUserDefaultAgency);
router.post('/remove/agency', authenticate, excludeSupportSettings, requireBackofficeAdmin, removeUserFromAgency);
router.put('/:id/payroll-access', authenticate, excludeSupportSettings, requireBackofficeAdmin, setUserAgencyPayrollAccess);
router.put('/:id/billing-access', authenticate, excludeSupportSettings, requireBackofficeAdmin, setUserAgencyBillingAccess);
router.get('/:id/department-access', authenticate, getUserDepartmentAccess);
router.put('/:id/department-access', authenticate, excludeSupportSettings, requireBackofficeAdmin, setUserAgencyDepartmentAccess);
router.put('/:id/h0032-mode', authenticate, excludeSupportSettings, requireBackofficeAdmin, setUserAgencyH0032Mode);
router.get('/:id/business-card-agencies', authenticate, listStaffCardAgencies);
router.get('/:id/agencies/:agencyId/service-assignments', authenticate, listStaffServiceAssignments);
router.put('/:id/agencies/:agencyId/service-assignments', authenticate, excludeSupportSettings, requireBackofficeAdmin, updateStaffServiceAssignments);
router.put('/:id/agency-membership', authenticate, excludeSupportSettings, requireBackofficeAdmin, guardAgencyMembershipUpdate, setUserAgencyMembershipRole);
router.put('/:id/supervision-prelicensed', authenticate, excludeSupportSettings, requireBackofficeAdmin, setUserAgencySupervisionPrelicensed);
router.get('/:id/supervision-prelicensed-classification', authenticate, requireBackofficeAdmin, getSupervisionPrelicensedClassification);

// New endpoints for tokens, passwords, account info, and checklist
router.post('/:id/generate-token', authenticate, excludeSupportSettings, requireBackofficeAdmin, generateInvitationToken);
router.post('/:id/generate-temporary-password', authenticate, excludeSupportSettings, requireBackofficeAdmin, generateTemporaryPassword);
router.post('/:id/set-temporary-password', authenticate, excludeSupportSettings, requireBackofficeAdmin, setCustomTemporaryPassword);
router.post('/:id/reset-passwordless-token', authenticate, excludeSupportSettings, resetPasswordlessToken);
router.post('/:id/send-setup-link', authenticate, requireBackofficeAdmin, sendInitialSetupLink);
router.post('/:id/resend-setup-link', authenticate, requireBackofficeAdmin, resendSetupLink);
router.post('/:id/send-reset-password-link', authenticate, requireBackofficeAdmin, sendResetPasswordLink);
router.get('/:id/login-help', authenticate, requireBackofficeAdmin, checkUserLoginHelp);
router.post('/:id/login-help/send', authenticate, requireBackofficeAdmin, sendUserLoginHelp);
router.post('/:id/send-reset-password-link-sms', authenticate, requireBackofficeAdmin, sendResetPasswordLinkSms);
router.post('/:id/sso-password-override', authenticate, excludeSupportSettings, requireBackofficeAdmin, setSsoPasswordOverride);
router.post('/change-password', authenticate, supportOwnAccountOnly, changePassword); // Own password remains available.
router.post('/:id/change-password', authenticate, supportOwnAccountOnly, changePassword);
router.get('/:id/credentials', authenticate, supportOwnAccountOnly, requireBackofficeAdmin, getUserCredentials);
router.get('/:id/account-info', authenticate, supportOwnAccountOnly, getAccountInfo);
router.get('/:id/profile-overview', authenticate, getProfileOverview);
router.post('/:id/toggle-supervisor-privileges', authenticate, excludeSupportSettings, toggleSupervisorPrivileges);
router.get('/:id/completion-package', authenticate, downloadCompletionPackage);
router.get('/:id/onboarding-checklist', authenticate, getOnboardingChecklist);
router.post('/:id/onboarding-checklist/:itemId/complete', authenticate, markChecklistItemComplete);
router.get('/:id/training-focuses', authenticate, getUserTrainingFocuses);
router.get('/:id/training-focuses/:focusId/path', authenticate, getTrainingFocusPath);
router.post('/:id/mark-complete', authenticate, excludeSupportSettings, requireBackofficeAdmin, markUserComplete);
router.post('/:id/mark-terminated', authenticate, excludeSupportSettings, requireBackofficeAdmin, markUserTerminated);
router.post('/:id/mark-active', authenticate, excludeSupportSettings, requireBackofficeAdmin, markUserActive);
router.post('/:id/promote-to-onboarding', authenticate, excludeSupportSettings, requireBackofficeAdmin, promoteToOnboarding);
router.post('/current-employee', authenticate, requireAccountAdministrator, requireBackofficeAdmin, createCurrentEmployee);
router.post('/:id/deactivate', authenticate, excludeSupportSettings, requireBackofficeAdmin, deactivateUser);
router.post('/:id/set-inactive', authenticate, excludeSupportSettings, requireBackofficeAdmin, setStaffInactive);
router.post('/:id/archive', authenticate, excludeSupportSettings, requireBackofficeAdmin, archiveUser);
router.post('/:id/restore', authenticate, excludeSupportSettings, requireBackofficeAdmin, restoreUser);
router.delete('/:id', authenticate, excludeSupportSettings, requireBackofficeAdmin, deleteUser);
router.get('/:id/onboarding-document', authenticate, getOnboardingDocument);

// Lifecycle tab routes (admin, support, super_admin + hiring-capable staff)
// Lifecycle: backoffice admins + clinical practice assistants
router.get('/:id/lifecycle', authenticate, requireBackofficeAdminOrCpa, getUserLifecycle);
router.get('/:id/district-background-processes', authenticate, requireBackofficeAdminOrCpa, getUserDistrictBackgroundProcesses);
router.patch('/:id/lifecycle/dates', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, updateLifecycleDates);
router.patch('/:id/lifecycle/credentials', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, updateLifecycleCredentials);
router.patch('/:id/lifecycle/separation', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, updateSeparationInfo);
router.get('/:id/lifecycle/federal-background-expiration-years', authenticate, requireBackofficeAdminOrCpa, getFederalBackgroundExpirationYears);
router.patch('/:id/lifecycle/federal-background-expiration-years', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, updateFederalBackgroundExpirationYears);
router.post('/:id/lifecycle/checklist/:definitionId/toggle', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, toggleLifecycleChecklistItem);
router.patch('/:id/lifecycle/checklist/:definitionId/schedule', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, setLifecycleChecklistScheduledAt);
router.post('/:id/lifecycle/checklist/:definitionId/not-applicable', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, setLifecycleChecklistNotApplicable);
router.post('/:id/lifecycle/checklist/:definitionId/attachment', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, uploadLifecycleChecklistAttachment);
router.get('/:id/lifecycle/checklist/:definitionId/attachment', authenticate, requireBackofficeAdminOrCpa, downloadLifecycleChecklistAttachment);
router.delete('/:id/lifecycle/checklist/:definitionId/attachment', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, deleteLifecycleChecklistAttachment);
router.post('/:id/lifecycle/sync', authenticate, excludeSupportSettings, requireBackofficeAdminOrCpa, syncLifecycle);

// Pending status endpoints
router.get('/:id/pending/status', authenticate, checkPendingCompletionStatus);
router.post('/:id/pending/complete', authenticate, markPendingComplete);
router.get('/:id/pending/completion-summary', authenticate, getPendingCompletionSummary);
router.post('/:id/move-to-active', authenticate, excludeSupportSettings, requireBackofficeAdmin, movePendingToActive); // Admin/support/super admin only
router.delete('/:id/pending/wipe-data', authenticate, excludeSupportSettings, requireBackofficeAdmin, wipePendingUserData);

export default router;
