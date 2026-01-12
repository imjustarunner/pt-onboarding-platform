import express from 'express';
import { getCurrentUser, getAllUsers, getUserById, updateUser, getUserAgencies, assignUserToAgency, removeUserFromAgency, generateInvitationToken, resetPasswordlessToken, sendPasswordResetToken, generateEmailForUser, getUserCredentials, getAccountInfo, downloadCompletionPackage, getOnboardingChecklist, markChecklistItemComplete, markUserComplete, markUserTerminated, markUserActive, getOnboardingDocument, archiveUser, restoreUser, deleteUser, getArchivedUsers, deactivateUser, markPendingComplete, checkPendingCompletionStatus, movePendingToActive, getPendingCompletionSummary, wipePendingUserData, changePassword, toggleSupervisorPrivileges, promoteToOnboarding, createCurrentEmployee } from '../controllers/user.controller.js';
import { getUserTrainingFocuses } from '../controllers/track.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/me', authenticate, getCurrentUser);
router.get('/me/agencies', authenticate, getUserAgencies);
router.get('/', authenticate, requireAdmin, getAllUsers);
router.get('/archived', authenticate, requireAdmin, getArchivedUsers); // Must come before /:id
router.get('/:id/agencies', authenticate, getUserAgencies);
router.get('/:id', authenticate, getUserById);
router.put('/:id', authenticate, updateUser);
router.post('/assign/agency', authenticate, requireAdmin, assignUserToAgency);
router.post('/remove/agency', authenticate, requireAdmin, removeUserFromAgency);

// New endpoints for tokens, passwords, account info, and checklist
router.post('/:id/generate-token', authenticate, requireAdmin, generateInvitationToken);
router.post('/:id/reset-passwordless-token', authenticate, resetPasswordlessToken);
router.post('/:id/send-password-reset-token', authenticate, requireAdmin, sendPasswordResetToken);
router.post('/:id/generate-email', authenticate, requireAdmin, generateEmailForUser);
router.post('/change-password', authenticate, changePassword); // For users to change their own password
router.post('/:id/change-password', authenticate, changePassword); // For admins to change other users' passwords
router.get('/:id/credentials', authenticate, requireAdmin, getUserCredentials);
router.get('/:id/account-info', authenticate, getAccountInfo);
router.post('/:id/toggle-supervisor-privileges', authenticate, toggleSupervisorPrivileges);
router.get('/:id/completion-package', authenticate, downloadCompletionPackage);
router.get('/:id/onboarding-checklist', authenticate, getOnboardingChecklist);
router.post('/:id/onboarding-checklist/:itemId/complete', authenticate, markChecklistItemComplete);
router.get('/:id/training-focuses', authenticate, getUserTrainingFocuses);
router.post('/:id/mark-complete', authenticate, requireAdmin, markUserComplete);
router.post('/:id/mark-terminated', authenticate, requireAdmin, markUserTerminated);
router.post('/:id/mark-active', authenticate, requireAdmin, markUserActive);
router.post('/:id/promote-to-onboarding', authenticate, requireAdmin, promoteToOnboarding);
router.post('/current-employee', authenticate, requireAdmin, createCurrentEmployee);
router.post('/:id/deactivate', authenticate, requireAdmin, deactivateUser);
router.post('/:id/archive', authenticate, requireAdmin, archiveUser);
router.post('/:id/restore', authenticate, requireAdmin, restoreUser);
router.delete('/:id', authenticate, requireAdmin, deleteUser);
router.get('/:id/onboarding-document', authenticate, getOnboardingDocument);

// Pending status endpoints
router.get('/:id/pending/status', authenticate, checkPendingCompletionStatus);
router.post('/:id/pending/complete', authenticate, markPendingComplete);
router.get('/:id/pending/completion-summary', authenticate, getPendingCompletionSummary);
router.post('/:id/move-to-active', authenticate, requireAdmin, movePendingToActive); // Also allows support role via requireAdmin middleware
router.delete('/:id/pending/wipe-data', authenticate, requireAdmin, wipePendingUserData);

export default router;

