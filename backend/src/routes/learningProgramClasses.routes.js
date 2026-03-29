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
  listParticipantProfiles,
  upsertParticipantProfile
} from '../controllers/learningProgramClasses.controller.js';
import {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  upsertTeamMembers,
  getLeaderboard,
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
  listWorkoutComments,
  postWorkoutComment,
  deleteWorkoutComment,
  uploadWorkoutMedia
} from '../controllers/challenges.controller.js';
import {
  getScoreboard,
  getEliminationBoard,
  listWeeklyTasks,
  createWeeklyTasks,
  listWeeklyAssignments,
  upsertWeeklyAssignment,
  completeWeeklyChallenge,
  closeWeek,
  updateEliminationComment
} from '../controllers/scoreboard.controller.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads/challenge_workouts');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const workoutMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `workout-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || '.bin'}`);
    }
  }),
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
router.get('/:classId/participant-profiles', listParticipantProfiles);
router.put('/:classId/participant-profiles/:providerUserId', upsertParticipantProfile);
router.get('/:classId/resources', listClassResources);
router.post('/:classId/resources', createClassResource);
router.put('/:classId/resources/:resourceId', updateClassResource);
router.delete('/:classId/resources/:resourceId', deleteClassResource);

// Summit Stats Challenge: teams, workouts, leaderboards, activity feed
router.get('/:classId/teams', listTeams);
router.post('/:classId/teams', createTeam);
router.put('/:classId/teams/:teamId', updateTeam);
router.delete('/:classId/teams/:teamId', deleteTeam);
router.get('/:classId/teams/:teamId/members', listTeamMembers);
router.put('/:classId/teams/:teamId/members', upsertTeamMembers);
router.get('/:classId/leaderboard', getLeaderboard);
router.get('/:classId/activity', getActivityFeed);
router.post('/:classId/workouts', submitWorkout);
router.get('/:classId/captain-applications', listCaptainApplications);
router.post('/:classId/captain-applications', applyForCaptain);
router.put('/:classId/captain-applications/:applicationId', reviewCaptainApplication);
router.post('/:classId/captains/finalize', finalizeCaptains);
router.get('/:classId/team-weekly-progress', getTeamWeeklyProgress);
router.get('/:classId/messages', listChallengeMessages);
router.post('/:classId/messages', postChallengeMessage);
router.get('/:classId/workouts/:workoutId/comments', listWorkoutComments);
router.post('/:classId/workouts/:workoutId/comments', postWorkoutComment);
router.delete('/:classId/workout-comments/:commentId', deleteWorkoutComment);
router.post('/:classId/workouts/:workoutId/media', workoutMediaUpload.single('file'), uploadWorkoutMedia);

// Summit Stats Scoreboard: weekly scoreboard, elimination, weekly tasks
router.get('/:classId/scoreboard', getScoreboard);
router.get('/:classId/elimination-board', getEliminationBoard);
router.get('/:classId/weekly-tasks', listWeeklyTasks);
router.post('/:classId/weekly-tasks', createWeeklyTasks);
router.get('/:classId/weekly-assignments', listWeeklyAssignments);
router.post('/:classId/weekly-assignments', upsertWeeklyAssignment);
router.post('/:classId/weekly-assignments/:assignmentId/complete', completeWeeklyChallenge);
router.post('/:classId/close-week', closeWeek);
router.put('/:classId/eliminations/:eliminationId/comment', updateEliminationComment);

export default router;
