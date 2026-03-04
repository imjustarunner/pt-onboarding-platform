import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listSupervisionProviderCandidates,
  listSupervisionAttendanceLogs,
  exportSupervisionAttendanceLogsCsv,
  markSupervisionMeetingLifecycle,
  finalizeSupervisionSessionBySubmit,
  getSupervisionVideoToken,
  getLobbyParticipants,
  admitToMainRoom,
  getAdmissionStatus,
  saveClientTranscript,
  getSupervisionSessionArtifacts,
  upsertSupervisionSessionArtifacts,
  createSupervisionSession,
  createSupervisionSessionValidators,
  patchSupervisionSession,
  patchSupervisionSessionValidators,
  cancelSupervisionSession,
  getSuperviseeHoursSummary,
  getMySupervisionPrompts,
  getMySupervisionSessions,
  getSuperviseeSessions,
  getMyPresenterAssignments,
  getSessionPresenters,
  markSessionPresenterPresented,
  getSupervisionJoinInfo
} from '../controllers/supervisionSessions.controller.js';
import { getSupervisionActivity, postSupervisionActivity } from '../controllers/videoMeetingActivity.controller.js';

const router = express.Router();

// Public: resolve session to org slug for join redirect (no auth)
router.get('/join-info/:sessionId', getSupervisionJoinInfo);

router.use(authenticate);

router.get('/providers', listSupervisionProviderCandidates);
router.get('/attendance-logs', listSupervisionAttendanceLogs);
router.get('/attendance-logs/export', exportSupervisionAttendanceLogsCsv);
router.get('/supervisee/:superviseeId/hours-summary', getSuperviseeHoursSummary);
router.get('/my-prompts', getMySupervisionPrompts);
router.get('/my-sessions', getMySupervisionSessions);
router.get('/supervisee/:superviseeId/sessions', getSuperviseeSessions);
router.get('/my-presenter-assignments', getMyPresenterAssignments);
router.get('/sessions/:id/presenters', getSessionPresenters);
router.post('/sessions/:id/presenters/:userId/presented', markSessionPresenterPresented);
router.post('/sessions/:id/meeting-lifecycle', markSupervisionMeetingLifecycle);
router.post('/sessions/:id/finalize', finalizeSupervisionSessionBySubmit);
router.get('/sessions/:id/video-token', getSupervisionVideoToken);
router.get('/sessions/:id/lobby-participants', getLobbyParticipants);
router.get('/sessions/:id/admission-status', getAdmissionStatus);
router.post('/sessions/:id/admit/:userId', admitToMainRoom);
router.post('/sessions/:id/client-transcript', saveClientTranscript);
router.get('/sessions/:id/artifacts', getSupervisionSessionArtifacts);
router.post('/sessions/:id/artifacts', upsertSupervisionSessionArtifacts);
router.get('/sessions/:id/activity', getSupervisionActivity);
router.post('/sessions/:id/activity', postSupervisionActivity);
router.post('/sessions', createSupervisionSessionValidators, createSupervisionSession);
router.patch('/sessions/:id', patchSupervisionSessionValidators, patchSupervisionSession);
router.post('/sessions/:id/cancel', cancelSupervisionSession);

export default router;

