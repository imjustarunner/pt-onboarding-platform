import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listLearningProgramClasses,
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
  submitWorkout
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

router.use(authenticate);

router.get('/my/summary', getMyParticipationSummary);
router.get('/my', listMyLearningClasses);
router.get('/', listLearningProgramClasses);
router.post('/', createLearningProgramClass);
router.get('/:classId', getLearningProgramClass);
router.put('/:classId', updateLearningProgramClass);
router.post('/:classId/duplicate', duplicateLearningProgramClass);
router.put('/:classId/clients', upsertClassClientMembers);
router.put('/:classId/providers', upsertClassProviderMembers);
router.post('/:classId/launch', launchLearningProgramClass);
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
