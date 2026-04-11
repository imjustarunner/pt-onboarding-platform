import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listLearningProgramClasses,
  discoverLearningProgramClasses,
  getLearningProgramClass,
  createLearningProgramClass,
  updateLearningProgramClass,
  duplicateLearningProgramClass,
  upsertClassClientMembers,
  upsertClassProviderMembers,
  listClassResources,
  createClassResource,
  updateClassResource,
  deleteClassResource,
  listMyLearningClasses,
  launchLearningProgramClass,
  joinLearningProgramClass,
  getLearningProgramParticipationAgreementStatus,
  acceptLearningProgramParticipationAgreement,
  listParticipantProfiles,
  upsertParticipantProfile,
  getSeasonProfileCompleteness,
  uploadSeasonBanner,
  updateSeasonBannerFocal,
  deleteSeasonBanner,
  uploadSeasonLogo,
  deleteSeasonLogo,
  serveSeasonBanner,
  serveSeasonLogo
} from '../controllers/learningProgramClasses.controller.js';
import {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  upsertTeamMembers,
  getLeaderboard,
  getRecordBoards,
  getRaceDivisions,
  scanWorkoutScreenshot,
  getActivityFeed,
  getMyParticipationSummary,
  submitWorkout,
  listCaptainApplications,
  applyForCaptain,
  reviewCaptainApplication,
  finalizeCaptains,
  getTeamWeeklyProgress,
  listChallengeMessages,
  postChallengeMessage,
  uploadChallengeMessageAttachment,
  getChallengeMessageUnreadCounts,
  deleteChallengeMessage,
  pinChallengeMessage,
  getDraftReport,
  upsertDraftNote,
  getDraftSession,
  createDraftSession,
  startDraftSession,
  makeDraftPick,
  resetDraftSession,
  listWorkoutComments,
  postWorkoutComment,
  deleteWorkoutComment,
  uploadCommentAttachment,
  uploadWorkoutMedia,
  reviewWorkoutProof,
  disqualifyWorkout,
  editOwnImportedTreadmillWorkout,
  patchStravaWorkoutDetails,
  editOwnWorkoutFields,
  patchRaceInfo,
  listMessageReactions,
  toggleMessageReaction
} from '../controllers/challenges.controller.js';
import {
  getScoreboard,
  getEliminationBoard,
  getSeasonSummary,
  listWeeklyTasks,
  createWeeklyTasks,
  generateWeeklyTasksDraft,
  publishWeeklyTasksDraft,
  listWeeklyAssignments,
  getSnakeDraftBoard,
  getNoShowRiskAlerts,
  listMyByeWeeks,
  declareByeWeek,
  upsertWeeklyAssignment,
  getWeeklyTaskDetail,
  completeWeeklyChallenge,
  setWeeklyAssignmentCompletionByManager,
  closeWeek,
  updateEliminationComment,
  manuallyEliminateParticipant
} from '../controllers/scoreboard.controller.js';
import {
  giveKudos,
  removeKudos,
  listWorkoutKudos,
  getKudosStats,
  getKudosBudget as giveKudosBudget,
  toggleReaction,
  listReactions
} from '../controllers/challengeKudos.controller.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workoutMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/gif', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(String(file.mimetype || '').toLowerCase())) {
      cb(new Error('Only gif/png/jpg/webp files are allowed'));
      return;
    }
    cb(null, true);
  }
});
const seasonImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(String(file.mimetype || '').toLowerCase())) {
      cb(new Error('Only png/jpg/webp files are allowed'));
      return;
    }
    cb(null, true);
  }
});

// Season banner and logo images are public assets (loaded by <img>/<background-image>
// which cannot send auth headers), so they must be registered before authenticate.
router.get('/:classId/banner', serveSeasonBanner);
router.get('/:classId/logo', serveSeasonLogo);

router.use(authenticate);

router.get('/my/summary', getMyParticipationSummary);
router.get('/my', listMyLearningClasses);
router.get('/discover', discoverLearningProgramClasses);
router.get('/', listLearningProgramClasses);
router.post('/', createLearningProgramClass);
router.get('/:classId', getLearningProgramClass);
router.put('/:classId', updateLearningProgramClass);
router.post('/:classId/duplicate', duplicateLearningProgramClass);
router.put('/:classId/clients', upsertClassClientMembers);
router.put('/:classId/providers', upsertClassProviderMembers);
router.post('/:classId/launch', launchLearningProgramClass);
router.post('/:classId/join', joinLearningProgramClass);
router.get('/:classId/participation-agreement', getLearningProgramParticipationAgreementStatus);
router.post('/:classId/participation-agreement/accept', acceptLearningProgramParticipationAgreement);
router.get('/:classId/participant-profiles', listParticipantProfiles);
router.put('/:classId/participant-profiles/:providerUserId', upsertParticipantProfile);
router.get('/:classId/profile-completeness', getSeasonProfileCompleteness);
router.post('/:classId/banner', seasonImageUpload.single('file'), uploadSeasonBanner);
router.patch('/:classId/banner/focal', updateSeasonBannerFocal);
router.delete('/:classId/banner', deleteSeasonBanner);
router.post('/:classId/logo', seasonImageUpload.single('file'), uploadSeasonLogo);
router.delete('/:classId/logo', deleteSeasonLogo);
router.get('/:classId/resources', listClassResources);
router.post('/:classId/resources', createClassResource);
router.put('/:classId/resources/:resourceId', updateClassResource);
router.delete('/:classId/resources/:resourceId', deleteClassResource);

// Summit Stats Team Challenge: teams, workouts, leaderboards, activity feed
router.get('/:classId/teams', listTeams);
router.post('/:classId/teams', createTeam);
router.put('/:classId/teams/:teamId', updateTeam);
router.delete('/:classId/teams/:teamId', deleteTeam);
router.get('/:classId/teams/:teamId/members', listTeamMembers);
router.put('/:classId/teams/:teamId/members', upsertTeamMembers);
router.get('/:classId/leaderboard', getLeaderboard);
router.get('/:classId/record-boards', getRecordBoards);
router.get('/:classId/race-divisions', getRaceDivisions);
router.post('/:classId/workouts/scan-screenshot', workoutMediaUpload.single('file'), scanWorkoutScreenshot);
router.get('/:classId/activity', getActivityFeed);
router.post('/:classId/workouts', submitWorkout);
router.put('/:classId/workouts/:workoutId/proof-review', reviewWorkoutProof);
router.put('/:classId/workouts/:workoutId/disqualify', disqualifyWorkout);
router.put('/:classId/workouts/:workoutId/import-edit', editOwnImportedTreadmillWorkout);
router.patch('/:classId/workouts/:workoutId/strava-details', workoutMediaUpload.single('treadmillProof'), patchStravaWorkoutDetails);
router.patch('/:classId/workouts/:workoutId/own-fields', workoutMediaUpload.single('treadmillProof'), editOwnWorkoutFields);
router.patch('/:classId/workouts/:workoutId/race-info', patchRaceInfo);
router.get('/:classId/captain-applications', listCaptainApplications);
router.post('/:classId/captain-applications', applyForCaptain);
router.put('/:classId/captain-applications/:applicationId', reviewCaptainApplication);
router.post('/:classId/captains/finalize', finalizeCaptains);
router.get('/:classId/team-weekly-progress', getTeamWeeklyProgress);
router.get('/:classId/messages', listChallengeMessages);
router.post('/:classId/messages', postChallengeMessage);
router.post('/:classId/messages/attachment', workoutMediaUpload.single('file'), uploadChallengeMessageAttachment);
router.get('/:classId/messages/unread-counts', getChallengeMessageUnreadCounts);
router.delete('/:classId/messages/:messageId', deleteChallengeMessage);
router.put('/:classId/messages/:messageId/pin', pinChallengeMessage);
router.get('/:classId/messages/:messageId/reactions', listMessageReactions);
router.post('/:classId/messages/:messageId/reactions', toggleMessageReaction);
router.get('/:classId/draft-report', getDraftReport);
router.put('/:classId/draft-report/:providerUserId/note', upsertDraftNote);
router.get('/:classId/workouts/:workoutId/comments', listWorkoutComments);
router.post('/:classId/workouts/:workoutId/comments', postWorkoutComment);
router.post('/:classId/workouts/:workoutId/comment-attachment', workoutMediaUpload.single('file'), uploadCommentAttachment);
router.delete('/:classId/workout-comments/:commentId', deleteWorkoutComment);
router.post('/:classId/workouts/:workoutId/media', workoutMediaUpload.single('file'), uploadWorkoutMedia);

// Summit Stats Team Challenge — Scoreboard: weekly scoreboard, elimination, weekly tasks
router.get('/:classId/scoreboard', getScoreboard);
router.get('/:classId/season-summary', getSeasonSummary);
router.get('/:classId/elimination-board', getEliminationBoard);
router.get('/:classId/weekly-tasks', listWeeklyTasks);
router.post('/:classId/weekly-tasks', createWeeklyTasks);
router.get('/:classId/weekly-tasks/:taskId/detail', getWeeklyTaskDetail);
router.post('/:classId/weekly-tasks/ai-draft', generateWeeklyTasksDraft);
router.post('/:classId/weekly-tasks/publish', publishWeeklyTasksDraft);
router.get('/:classId/snake-draft-board', getSnakeDraftBoard);
router.get('/:classId/draft-session', getDraftSession);
router.post('/:classId/draft-session', createDraftSession);
router.post('/:classId/draft-session/start', startDraftSession);
router.post('/:classId/draft-session/pick', makeDraftPick);
router.delete('/:classId/draft-session', resetDraftSession);
router.get('/:classId/no-show-risk-alerts', getNoShowRiskAlerts);
router.get('/:classId/weekly-assignments', listWeeklyAssignments);
router.get('/:classId/bye-weeks/my', listMyByeWeeks);
router.post('/:classId/bye-weeks/declare', declareByeWeek);
router.post('/:classId/weekly-assignments', upsertWeeklyAssignment);
router.post('/:classId/weekly-assignments/:assignmentId/complete', completeWeeklyChallenge);
router.put('/:classId/weekly-assignments/:assignmentId/completion', setWeeklyAssignmentCompletionByManager);
router.post('/:classId/close-week', closeWeek);
router.put('/:classId/eliminations/:eliminationId/comment', updateEliminationComment);
router.post('/:classId/eliminations/manual', manuallyEliminateParticipant);

// Kudos
router.get('/:classId/kudos-budget', giveKudosBudget);
router.get('/:classId/kudos-stats', getKudosStats);
router.get('/:classId/workouts/:workoutId/kudos', listWorkoutKudos);
router.post('/:classId/workouts/:workoutId/kudos', giveKudos);
router.delete('/:classId/workouts/:workoutId/kudos', removeKudos);

// Emoji reactions
router.post('/:classId/workouts/:workoutId/reactions', toggleReaction);
router.get('/:classId/workouts/:workoutId/reactions', listReactions);

export default router;
