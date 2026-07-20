import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listActivities,
  startPracticeActivity,
  createSession,
  listSessions,
  getSession,
  joinSession,
  getVideoToken,
  endSession,
  listNotes,
  createNote,
  listChat,
  postChat,
  getActivityRuntime,
  inviteActivity,
  respondActivity,
  patchActivityRuntime,
  pauseActivity,
  resumeActivity,
  exitActivity,
  findOrCreateFromAppointment,
  getShareLink,
  acceptInvite,
  rollActivity
} from '../controllers/counselingSessions.controller.js';

const router = express.Router();

router.use(authenticate);

// Unified activity registry
router.get('/activities', listActivities);
// Solo practice / Tools preview (no video, no client)
router.post('/activities/:activityId/practice', startPracticeActivity);

// Invite accept (authenticated guest)
router.post('/invite/:token/accept', acceptInvite);

// Sessions
router.get('/sessions', listSessions);
router.post('/sessions', createSession);
router.post('/sessions/from-appointment', findOrCreateFromAppointment);
router.get('/sessions/:sessionId', getSession);
router.post('/sessions/:sessionId/join', joinSession);
router.get('/sessions/:sessionId/video-token', getVideoToken);
router.get('/sessions/:sessionId/share-link', getShareLink);
router.post('/sessions/:sessionId/end', endSession);

// Notes (role-scoped)
router.get('/sessions/:sessionId/notes', listNotes);
router.post('/sessions/:sessionId/notes', createNote);

// Chat
router.get('/sessions/:sessionId/chat', listChat);
router.post('/sessions/:sessionId/chat', postChat);

// Activity runtime
router.get('/sessions/:sessionId/activity', getActivityRuntime);
router.post('/sessions/:sessionId/activity/invite', inviteActivity);
router.post('/sessions/:sessionId/activity/respond', respondActivity);
router.patch('/sessions/:sessionId/activity', patchActivityRuntime);
router.post('/sessions/:sessionId/activity/pause', pauseActivity);
router.post('/sessions/:sessionId/activity/resume', resumeActivity);
router.post('/sessions/:sessionId/activity/exit', exitActivity);
router.post('/sessions/:sessionId/activity/roll', rollActivity);

export default router;
