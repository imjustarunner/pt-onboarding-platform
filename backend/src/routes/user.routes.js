import express from 'express';
import { getCurrentUser, getAllUsers, getUserById, updateUser, getUserAgencies, assignUserToAgency, removeUserFromAgency, setUserAgencyPayrollAccess, setUserAgencyH0032Mode, generateInvitationToken, resetPasswordlessToken, sendResetPasswordLink, sendResetPasswordLinkSms, getUserCredentials, getAccountInfo, downloadCompletionPackage, getOnboardingChecklist, markChecklistItemComplete, markUserComplete, markUserTerminated, markUserActive, getOnboardingDocument, archiveUser, restoreUser, deleteUser, getArchivedUsers, deactivateUser, markPendingComplete, checkPendingCompletionStatus, movePendingToActive, getPendingCompletionSummary, wipePendingUserData, changePassword, toggleSupervisorPrivileges, promoteToOnboarding, createCurrentEmployee, getUserLoginEmailAliases, addUserLoginEmailAlias } from '../controllers/user.controller.js';
import { upload as uploadProfilePhoto, uploadUserProfilePhoto } from '../controllers/userProfilePhoto.controller.js';
import { getUserTrainingFocuses } from '../controllers/track.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.get('/me/agencies', authenticate, getUserAgencies);
router.get('/', authenticate, requireBackofficeAdmin, getAllUsers);
router.get('/archived', authenticate, requireBackofficeAdmin, getArchivedUsers); // Must come before /:id
router.get('/:id/agencies', authenticate, getUserAgencies);
router.get('/:id/login-email-aliases', authenticate, requireBackofficeAdmin, getUserLoginEmailAliases);
router.post('/:id/login-email-alias', authenticate, requireBackofficeAdmin, addUserLoginEmailAlias);
router.get('/:id', authenticate, getUserById);
router.put('/:id', authenticate, updateUser);
router.post('/:id/profile-photo', authenticate, uploadProfilePhoto.single('photo'), uploadUserProfilePhoto);
router.post('/assign/agency', authenticate, requireBackofficeAdmin, assignUserToAgency);
router.post('/remove/agency', authenticate, requireBackofficeAdmin, removeUserFromAgency);
router.put('/:id/payroll-access', authenticate, requireBackofficeAdmin, setUserAgencyPayrollAccess);
router.put('/:id/h0032-mode', authenticate, requireBackofficeAdmin, setUserAgencyH0032Mode);

// New endpoints for tokens, passwords, account info, and checklist
router.post('/:id/generate-token', authenticate, requireBackofficeAdmin, generateInvitationToken);
router.post('/:id/reset-passwordless-token', authenticate, resetPasswordlessToken);
router.post('/:id/send-reset-password-link', authenticate, requireBackofficeAdmin, sendResetPasswordLink);
router.post('/:id/send-reset-password-link-sms', authenticate, requireBackofficeAdmin, sendResetPasswordLinkSms);
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

