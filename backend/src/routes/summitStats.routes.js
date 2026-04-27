import express from 'express';
import { body } from 'express-validator';
import { authenticate, authenticateOptional } from '../middleware/auth.middleware.js';
import { signupLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  createClub,
  getClubBillingStatus,
  getClubManagerContext,
  leaveSummitClubMembership,
  exportMySummitChallengeData,
  anonymizeMyContributionsInClub,
  getClubSpecs,
  listClubs,
  applyToClub,
  addMemberToClub,
  startContactManagerThread,
  getClubRecords,
  upsertClubRecords,
  listClubRecordVerifications,
  reviewClubRecordVerification,
  getRaceClubsConfig,
  putRaceClubsConfig,
  getPublicRaceClubs,
  getRaceClubsAdminMembers,
  createRaceClubPlaceholder,
  getClubMemberTrophyCase,
  getMyTrophyCase,
  getClubMemberStats,
  removeClubMember,
  setClubMemberRole,
  getUserSstcClubAffiliations,
  listSstcEligibleUsers,
  getLoginSplashData,
  getSstcNotificationPrefs,
  putSstcNotificationPrefs,
  triggerWeeklySummaryEmail
} from '../controllers/summitStats.controller.js';
import {
  getMySeasonParticipation,
  setMySeasonParticipation,
  getSeasonParticipationSummary,
  getMyClubInviteDismissals,
  dismissClubInvitesForever,
  reEngageClubInvites,
  createSeasonAnnouncement,
  listSeasonAnnouncements,
  cancelSeasonAnnouncement,
  listMyPendingSeasonAnnouncements,
  respondToSeasonAnnouncement
} from '../controllers/seasonParticipation.controller.js';
import { postClubShareWithEmployer } from '../controllers/clubEmployerShare.controller.js';
import {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  getParticipantCustomValues,
  upsertParticipantCustomValue
} from '../controllers/challengeCustomFields.controller.js';
import {
  getClubTimePreferences,
  updateClubTimePreferences,
  getMyTimezone,
  updateMyTimezone,
  listClubIcons,
  getClubIconDetails,
  upsertClubIconDetails,
  listEligibilityGroups,
  createEligibilityGroup,
  updateEligibilityGroup,
  deleteEligibilityGroup,
  listRecognitionAwards,
  createRecognitionAward,
  updateRecognitionAward,
  deleteRecognitionAward,
  listTenantAwards,
  createTenantAward,
  updateTenantAward,
  deleteTenantAward,
  cloneTenantAward,
  getStatsConfig,
  updateStatsConfig,
  getClubStats,
  getStoreConfig,
  updateStoreConfig
} from '../controllers/challengeRecognitionLibrary.controller.js';
import {
  getManagerPendingWeeks,
  snoozeWeekTrophies,
  postWeekTrophies,
  getRecognitionStandings,
  getPendingRecognitionSplash,
  dismissRecognitionSplash
} from '../controllers/seasonRecognitionStandings.controller.js';
import {
  listTaskTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  listTenantTaskTemplates,
  createTenantTaskTemplate,
  updateTenantTaskTemplate,
  deleteTenantTaskTemplate,
  cloneTenantTaskTemplate,
  cloneClubTaskTemplateToTenant,
  listGlobalTemplates,
  createGlobalTemplate
} from '../controllers/challengeTaskTemplates.controller.js';
import {
  getPublicClubStats,
  getApplicationEmailStatus,
  resolveInviteToken,
  submitApplication,
  submitInviteApplication,
  requestMemberInvite,
  listApplications,
  reviewApplication,
  createInvite,
  listInvites,
  listInvitableSeasons,
  revokeInvite,
  getMyReferralLink,
  getPendingApplicationCount,
  getClubFeed,
  getClubFeedPublic,
  postClubFeedPost,
  postWorkoutToClubFeed,
  postClubFeedAttachment,
  postClubFeedMarkRead,
  postClubFeedMarkAllRead,
  clubFeedImageUpload,
  getClubFeedSeasonOptions,
  getClubRecordBoard,
  listClubMembers,
  listClubMemberAddCandidates,
  addExistingMembersToClub,
  mergeClubMemberDuplicates,
  getClubMemberSeasonHistory,
  getPublicPageConfig,
  updatePublicPageConfig,
  setClubMemberStatus,
  putClubMemberProfile,
  getClubRaceDivisionConfig,
  putClubRaceDivisionConfig,
  putClubMemberTeamCaptain,
  getMyApplications,
  getMyDashboardSummary,
  getMyAwards,
  putMyAccountSnapshot,
  requestSeasonJoin,
  listSeasonJoinRequests,
  reviewSeasonJoinRequest,
  listClubMembersDirectory,
  listClubMembersDirectoryPublic,
  getClubMemberProfile,
  getPublicClubMemberProfile,
  postTeamAnnouncementForTeam
} from '../controllers/challengeMemberApplications.controller.js';

const router = express.Router();

// ── Public routes (no auth) ──────────────────────────────────────
router.get('/clubs', listClubs);
router.get('/clubs/:id/public', authenticateOptional, getPublicClubStats);
router.get('/clubs/:id/members/directory/public', authenticateOptional, listClubMembersDirectoryPublic);
// Public member profile — no auth required, limited data
router.get('/clubs/:id/members/:userId/public-profile', getPublicClubMemberProfile);
router.get('/clubs/:id/feed/public', getClubFeedPublic);
router.get('/clubs/:id/race-clubs', authenticateOptional, getPublicRaceClubs);
router.get('/clubs/:id/stats', getClubStats);
// Public: season recognition standings (no auth required)
router.get('/seasons/:id/recognition/standings', getRecognitionStandings);
router.get('/clubs/invite/:token', resolveInviteToken);
router.post('/application-email-status', getApplicationEmailStatus);
router.post('/clubs/:id/apply-form', submitApplication);
router.post('/clubs/:id/request-invite', signupLimiter, requestMemberInvite);
router.post('/clubs/invite/:token/apply', submitInviteApplication);

router.use(authenticate);

router.post('/clubs/:clubId/seasons/:classId/join-request', requestSeasonJoin);
router.get('/clubs/:clubId/seasons/:classId/join-requests', listSeasonJoinRequests);
router.put('/clubs/:clubId/seasons/:classId/join-requests/:requestId', reviewSeasonJoinRequest);
router.get('/clubs/:id/members/directory', listClubMembersDirectory);
router.get('/clubs/:id/members/:userId/profile', getClubMemberProfile);
router.get('/clubs/:id/members/:userId/trophy-case', getClubMemberTrophyCase);
router.get('/clubs/:id/my-trophy-case', getMyTrophyCase);

router.get('/me/dashboard', getMyDashboardSummary);
router.get('/me/awards', getMyAwards);

// ─── Season Recognition standings + manager trophy-posting ─────────────────
// Public standings (no auth required for standings view)
router.get('/seasons/:id/recognition/standings', getRecognitionStandings);
// Manager-only
router.get('/seasons/:id/recognition/manager-pending', getManagerPendingWeeks);
router.post('/seasons/:id/recognition/snooze-week', snoozeWeekTrophies);
router.post('/seasons/:id/recognition/post-week', postWeekTrophies);
// Member splash (auth already enforced by authenticate middleware above)
router.get('/seasons/:id/recognition/splash', getPendingRecognitionSplash);
router.post('/seasons/:id/recognition/splash/dismiss', dismissRecognitionSplash);
router.put('/me/account-snapshot', putMyAccountSnapshot);
router.post('/me/leave-club', leaveSummitClubMembership);
router.get('/me/data-export', exportMySummitChallengeData);
router.post('/me/anonymize-club-contributions', anonymizeMyContributionsInClub);
router.get('/my-applications', getMyApplications);
router.get('/club-specs', getClubSpecs);
router.get('/club-manager-context', getClubManagerContext);
router.post('/clubs/:clubId/share-with-employer', postClubShareWithEmployer);
router.post('/clubs', [
  body('name').trim().notEmpty().withMessage('Club name is required'),
  body('slug').optional().trim().isString(),
  body('city').optional().trim().isString(),
  body('state').optional().trim().isString(),
  body('managerUserId').optional({ nullable: true }).isInt({ min: 1 }),
  body('assistantManagerUserIds').optional({ nullable: true }).isArray()
], createClub);
router.post('/clubs/:id/apply', applyToClub);
router.post('/clubs/:id/add-member', [
  body('identifier').optional().trim(),
  body('email').optional().trim()
], addMemberToClub);
router.post('/clubs/:id/contact-manager', startContactManagerThread);
router.get('/clubs/:id/records', getClubRecords);
router.put('/clubs/:id/records', upsertClubRecords);
router.get('/clubs/:id/records/verifications', listClubRecordVerifications);
router.put('/clubs/:id/records/verifications/:verificationId', reviewClubRecordVerification);
router.get('/clubs/:id/race-clubs-config', getRaceClubsConfig);
router.put('/clubs/:id/race-clubs-config', putRaceClubsConfig);
router.get('/clubs/:id/race-clubs-members', getRaceClubsAdminMembers);
router.post('/clubs/:id/race-clubs-placeholder', authenticate, createRaceClubPlaceholder);
router.get('/clubs/:id/race-clubs', authenticateOptional, getPublicRaceClubs);

// Custom field definitions (club managers)
router.get('/clubs/:id/custom-fields', listCustomFields);
router.post('/clubs/:id/custom-fields', createCustomField);
router.put('/clubs/:id/custom-fields/:fieldId', updateCustomField);
router.delete('/clubs/:id/custom-fields/:fieldId', deleteCustomField);

// Club time preferences
router.get('/clubs/:id/time-preferences', getClubTimePreferences);
router.put('/clubs/:id/time-preferences', updateClubTimePreferences);

// Current user timezone preference
router.get('/users/me/timezone', getMyTimezone);
router.put('/users/me/timezone', updateMyTimezone);

// Club icons (for recognition icon picker)
router.get('/clubs/:id/icons', listClubIcons);
router.get('/clubs/:id/icon-details/:iconId', getClubIconDetails);
router.put('/clubs/:id/icon-details/:iconId', upsertClubIconDetails);

// Eligibility groups library
router.get('/clubs/:id/eligibility-groups', listEligibilityGroups);
router.post('/clubs/:id/eligibility-groups', createEligibilityGroup);
router.put('/clubs/:id/eligibility-groups/:groupId', updateEligibilityGroup);
router.delete('/clubs/:id/eligibility-groups/:groupId', deleteEligibilityGroup);

// Recognition awards library (club-level)
router.get('/clubs/:id/recognition-awards', listRecognitionAwards);
router.post('/clubs/:id/recognition-awards', createRecognitionAward);
router.put('/clubs/:id/recognition-awards/:awardId', updateRecognitionAward);
router.delete('/clubs/:id/recognition-awards/:awardId', deleteRecognitionAward);
router.post('/clubs/:id/recognition-awards/clone-from-tenant/:awardId', cloneTenantAward);

// Tenant recognition award templates (superadmin or feature-flagged managers)
router.get('/clubs/:id/tenant-awards', listTenantAwards);
router.post('/clubs/:id/tenant-awards', createTenantAward);
router.put('/clubs/:id/tenant-awards/:awardId', updateTenantAward);
router.delete('/clubs/:id/tenant-awards/:awardId', deleteTenantAward);

// Participant custom field values
router.get('/clubs/:id/seasons/:classId/participants/:userId/custom-values', getParticipantCustomValues);
router.put('/clubs/:id/seasons/:classId/participants/:userId/custom-values/:fieldId', upsertParticipantCustomValue);

// Member applications (manager review)
router.get('/clubs/:id/applications', listApplications);
router.get('/clubs/:id/applications/count', getPendingApplicationCount);
router.put('/clubs/:id/applications/:appId', reviewApplication);

// Invite tokens (manager CRUD)
router.get('/clubs/:id/invites', listInvites);
router.get('/clubs/:id/invitable-seasons', listInvitableSeasons);
router.post('/clubs/:id/invites', createInvite);
router.delete('/clubs/:id/invites/:inviteId', revokeInvite);

// Member referral link
router.get('/clubs/:id/my-referral-link', getMyReferralLink);

// Club feed and record board (authenticated members)
router.post('/clubs/:id/feed/read-all', postClubFeedMarkAllRead);
router.post('/clubs/:id/feed/read/:postId', postClubFeedMarkRead);
router.post('/clubs/:id/feed/posts', postClubFeedPost);
router.post('/clubs/:id/feed/from-workout', postWorkoutToClubFeed);
router.get('/clubs/:clubId/member-stats', getClubMemberStats);
router.post('/clubs/:id/feed/attachments', clubFeedImageUpload.single('file'), postClubFeedAttachment);
router.get('/clubs/:id/feed/season-options', getClubFeedSeasonOptions);
router.get('/clubs/:id/feed', getClubFeed);
router.get('/clubs/:id/record-board', getClubRecordBoard);
router.get('/clubs/:id/public-page-config', getPublicPageConfig);
router.put('/clubs/:id/public-page-config', updatePublicPageConfig);
router.get('/clubs/:id/members', listClubMembers);
router.get('/clubs/:id/member-add-candidates', listClubMemberAddCandidates);
router.post('/clubs/:id/members/add-existing', addExistingMembersToClub);
router.post('/clubs/:id/members/merge', mergeClubMemberDuplicates);
router.get('/clubs/:id/members/:userId/season-history', getClubMemberSeasonHistory);
router.put('/clubs/:id/members/:userId/profile', putClubMemberProfile);
router.get('/clubs/:id/race-division-config', getClubRaceDivisionConfig);
router.put('/clubs/:id/race-division-config', putClubRaceDivisionConfig);
router.put('/clubs/:id/members/:userId/team-captain', putClubMemberTeamCaptain);
router.put('/clubs/:id/members/:userId/status', setClubMemberStatus);
router.put('/clubs/:id/members/:userId/role', setClubMemberRole);
router.delete('/clubs/:id/members/:userId', removeClubMember);
router.get('/users/:userId/club-affiliations', getUserSstcClubAffiliations);
router.get('/admin/eligible-users', listSstcEligibleUsers);

// ── Season participation (per-season opt-in / sit-out / remind-me) ──
router.get(
  '/clubs/:clubId/seasons/:classId/my-participation',
  getMySeasonParticipation
);
router.put(
  '/clubs/:clubId/seasons/:classId/my-participation',
  setMySeasonParticipation
);
router.get(
  '/clubs/:clubId/seasons/:classId/participation-summary',
  getSeasonParticipationSummary
);

// ── Club invite "decline forever" ──────────────────────────────────
router.get('/me/club-invite-dismissals', getMyClubInviteDismissals);
router.post('/me/clubs/:clubId/dismiss-invites', dismissClubInvitesForever);
router.delete('/me/clubs/:clubId/dismiss-invites', reEngageClubInvites);

// ── Season announcements (manager broadcast + member splash) ──────
router.post(
  '/clubs/:clubId/seasons/:classId/announcements',
  createSeasonAnnouncement
);
router.get(
  '/clubs/:clubId/seasons/:classId/announcements',
  listSeasonAnnouncements
);
router.delete(
  '/clubs/:clubId/seasons/:classId/announcements/:id',
  cancelSeasonAnnouncement
);
router.get(
  '/me/pending-season-announcements',
  listMyPendingSeasonAnnouncements
);
router.post(
  '/me/season-announcements/:id/respond',
  respondToSeasonAnnouncement
);
router.post('/clubs/:clubId/seasons/:classId/teams/:teamId/announcements', postTeamAnnouncementForTeam);

// Club stats (computed + seed)
router.get('/clubs/:id/stats', getClubStats);
router.get('/clubs/:id/stats-config', getStatsConfig);
router.put('/clubs/:id/stats-config', updateStatsConfig);

// Team store config
router.get('/clubs/:id/store-config', getStoreConfig);
router.put('/clubs/:id/store-config', updateStoreConfig);

// Challenge task template library
router.get('/clubs/:id/challenge-templates', listTaskTemplates);
router.post('/clubs/:id/challenge-templates', createTaskTemplate);
router.put('/clubs/:id/challenge-templates/:tId', updateTaskTemplate);
router.delete('/clubs/:id/challenge-templates/:tId', deleteTaskTemplate);
router.get('/clubs/:id/tenant-challenge-templates', listTenantTaskTemplates);
router.post('/clubs/:id/tenant-challenge-templates', createTenantTaskTemplate);
router.put('/clubs/:id/tenant-challenge-templates/:tId', updateTenantTaskTemplate);
router.delete('/clubs/:id/tenant-challenge-templates/:tId', deleteTenantTaskTemplate);
router.post('/clubs/:id/challenge-templates/clone-from-tenant/:tId', cloneTenantTaskTemplate);
router.post('/clubs/:id/tenant-challenge-templates/clone-from-club/:tId', cloneClubTaskTemplateToTenant);

// Global SSTC challenge template library
router.get('/challenge-templates/global', listGlobalTemplates);
router.post('/challenge-templates/global', createGlobalTemplate);

// Billing status
router.get('/clubs/:id/billing-status', authenticate, getClubBillingStatus);

// SSTC login splash + notification preferences
router.get('/me/login-splash', authenticate, getLoginSplashData);
router.get('/me/notification-preferences', authenticate, getSstcNotificationPrefs);
router.put('/me/notification-preferences', authenticate, putSstcNotificationPrefs);
router.post('/me/weekly-summary-email', authenticate, triggerWeeklySummaryEmail);

export default router;
