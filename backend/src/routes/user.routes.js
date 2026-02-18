import express from 'express';
import { getCurrentUser, getAllUsers, aiQueryUsers, getUserById, updateUser, updateUserStatus, requireSkillBuilderConfirmNextLogin, getUserAgencies, getSuperviseePortalSlugs, getAffiliatedPortals, assignUserToAgency, removeUserFromAgency, setUserAgencyPayrollAccess, setUserAgencyH0032Mode, setUserAgencySupervisionPrelicensed, generateInvitationToken, generateTemporaryPassword, resetPasswordlessToken, sendInitialSetupLink, resendSetupLink, sendResetPasswordLink, sendResetPasswordLinkSms, getUserCredentials, getAccountInfo, downloadCompletionPackage, getOnboardingChecklist, markChecklistItemComplete, markUserComplete, markUserTerminated, markUserActive, getOnboardingDocument, archiveUser, restoreUser, deleteUser, getArchivedUsers, deactivateUser, markPendingComplete, checkPendingCompletionStatus, movePendingToActive, getPendingCompletionSummary, wipePendingUserData, changePassword, toggleSupervisorPrivileges, promoteToOnboarding, createCurrentEmployee, getUserLoginEmailAliases, addUserLoginEmailAlias, getUserScheduleSummary, createUserScheduleEvent, getUserExternalCalendars, createUserExternalCalendar, addUserExternalCalendarFeed, patchUserExternalCalendar, patchUserExternalCalendarFeed, setSsoPasswordOverride } from '../controllers/user.controller.js';
import { getUserOfficeAssignments, upsertUserOfficeAssignments } from '../controllers/userOfficeAssignments.controller.js';
import { upload as uploadProfilePhoto, uploadUserProfilePhoto } from '../controllers/userProfilePhoto.controller.js';
import { getUserTrainingFocuses } from '../controllers/track.controller.js';
import {
  getUserProviderPublicProfile,
  upsertUserProviderPublicProfile,
  getAgencyProviderPortalSettings,
  upsertAgencyProviderPortalSettings
} from '../controllers/providerPublicProfile.controller.js';
import { authenticate, requireAdmin, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.get('/me/agencies', authenticate, getUserAgencies);
router.get('/me/supervisee-portal-slugs', authenticate, getSuperviseePortalSlugs);
router.get('/', authenticate, requireAdmin, getAllUsers);
router.get('/ai-query', authenticate, requireBackofficeAdmin, aiQueryUsers);
router.get('/archived', authenticate, requireBackofficeAdmin, getArchivedUsers); // Must come before /:id
router.get('/:id/agencies', authenticate, getUserAgencies);
router.get('/:id/login-email-aliases', authenticate, requireBackofficeAdmin, getUserLoginEmailAliases);
router.post('/:id/login-email-alias', authenticate, requireBackofficeAdmin, addUserLoginEmailAlias);
router.get('/:id/schedule-summary', authenticate, getUserScheduleSummary);
router.post('/:id/schedule-events', authenticate, createUserScheduleEvent);
router.get('/:id/office-assignments', authenticate, requireBackofficeAdmin, getUserOfficeAssignments);
router.put('/:id/office-assignments', authenticate, requireBackofficeAdmin, upsertUserOfficeAssignments);
router.get('/:id/provider-public-profile', authenticate, getUserProviderPublicProfile);
router.put('/:id/provider-public-profile', authenticate, upsertUserProviderPublicProfile);
router.get('/agency-provider-portal/:agencyId', authenticate, getAgencyProviderPortalSettings);
router.put('/agency-provider-portal/:agencyId', authenticate, upsertAgencyProviderPortalSettings);
router.get('/:id/affiliated-portals', authenticate, getAffiliatedPortals);
router.get('/:id/external-calendars', authenticate, getUserExternalCalendars);
router.post('/:id/external-calendars', authenticate, createUserExternalCalendar);
router.post('/:id/external-calendars/:calendarId/feeds', authenticate, addUserExternalCalendarFeed);
router.patch('/:id/external-calendars/:calendarId', authenticate, patchUserExternalCalendar);
router.patch('/:id/external-calendars/:calendarId/feeds/:feedId', authenticate, patchUserExternalCalendarFeed);
router.get('/:id', authenticate, getUserById);
router.put('/:id', authenticate, updateUser);
router.put('/:id/status', authenticate, requireBackofficeAdmin, updateUserStatus);
router.post('/:id/skill-builder/require-confirm-next-login', authenticate, requireSkillBuilderConfirmNextLogin);
router.post('/:id/profile-photo', authenticate, uploadProfilePhoto.single('photo'), uploadUserProfilePhoto);
router.post('/assign/agency', authenticate, requireBackofficeAdmin, assignUserToAgency);
router.post('/remove/agency', authenticate, requireBackofficeAdmin, removeUserFromAgency);
router.put('/:id/payroll-access', authenticate, requireBackofficeAdmin, setUserAgencyPayrollAccess);
router.put('/:id/h0032-mode', authenticate, requireBackofficeAdmin, setUserAgencyH0032Mode);
router.put('/:id/supervision-prelicensed', authenticate, requireBackofficeAdmin, setUserAgencySupervisionPrelicensed);

// New endpoints for tokens, passwords, account info, and checklist
router.post('/:id/generate-token', authenticate, requireBackofficeAdmin, generateInvitationToken);
router.post('/:id/generate-temporary-password', authenticate, requireBackofficeAdmin, generateTemporaryPassword);
router.post('/:id/reset-passwordless-token', authenticate, resetPasswordlessToken);
router.post('/:id/send-setup-link', authenticate, requireBackofficeAdmin, sendInitialSetupLink);
router.post('/:id/resend-setup-link', authenticate, requireBackofficeAdmin, resendSetupLink);
router.post('/:id/send-reset-password-link', authenticate, requireBackofficeAdmin, sendResetPasswordLink);
router.post('/:id/send-reset-password-link-sms', authenticate, requireBackofficeAdmin, sendResetPasswordLinkSms);
router.post('/:id/sso-password-override', authenticate, requireBackofficeAdmin, setSsoPasswordOverride);
router.post('/change-password', authenticate, changePassword); // For users to change their own password
router.post('/:id/change-password', authenticate, changePassword); // For admins to change other users' passwords
router.get('/:id/credentials', authenticate, requireBackofficeAdmin, getUserCredentials);
router.get('/:id/account-info', authenticate, getAccountInfo);
router.post('/:id/toggle-supervisor-privileges', authenticate, toggleSupervisorPrivileges);
router.get('/:id/completion-package', authenticate, downloadCompletionPackage);
router.get('/:id/onboarding-checklist', authenticate, getOnboardingChecklist);
router.post('/:id/onboarding-checklist/:itemId/complete', authenticate, markChecklistItemComplete);
router.get('/:id/training-focuses', authenticate, getUserTrainingFocuses);
router.post('/:id/mark-complete', authenticate, requireBackofficeAdmin, markUserComplete);
router.post('/:id/mark-terminated', authenticate, requireBackofficeAdmin, markUserTerminated);
router.post('/:id/mark-active', authenticate, requireBackofficeAdmin, markUserActive);
router.post('/:id/promote-to-onboarding', authenticate, requireBackofficeAdmin, promoteToOnboarding);
router.post('/current-employee', authenticate, requireBackofficeAdmin, createCurrentEmployee);
router.post('/:id/deactivate', authenticate, requireBackofficeAdmin, deactivateUser);
router.post('/:id/archive', authenticate, requireBackofficeAdmin, archiveUser);
router.post('/:id/restore', authenticate, requireBackofficeAdmin, restoreUser);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteUser);
router.get('/:id/onboarding-document', authenticate, getOnboardingDocument);

// Pending status endpoints
router.get('/:id/pending/status', authenticate, checkPendingCompletionStatus);
router.post('/:id/pending/complete', authenticate, markPendingComplete);
router.get('/:id/pending/completion-summary', authenticate, getPendingCompletionSummary);
router.post('/:id/move-to-active', authenticate, requireBackofficeAdmin, movePendingToActive); // Admin/support/super admin only
router.delete('/:id/pending/wipe-data', authenticate, requireBackofficeAdmin, wipePendingUserData);

export default router;

