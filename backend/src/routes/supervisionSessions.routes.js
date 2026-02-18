import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listSupervisionProviderCandidates,
  listSupervisionAttendanceLogs,
  markSupervisionMeetingLifecycle,
  getSupervisionSessionArtifacts,
  upsertSupervisionSessionArtifacts,
  createSupervisionSession,
  createSupervisionSessionValidators,
  patchSupervisionSession,
  patchSupervisionSessionValidators,
  cancelSupervisionSession,
  getSuperviseeHoursSummary,
  getMySupervisionPrompts,
  getMyPresenterAssignments,
  getSessionPresenters,
  markSessionPresenterPresented
} from '../controllers/supervisionSessions.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/providers', listSupervisionProviderCandidates);
router.get('/attendance-logs', listSupervisionAttendanceLogs);
router.get('/supervisee/:superviseeId/hours-summary', getSuperviseeHoursSummary);
router.get('/my-prompts', getMySupervisionPrompts);
router.get('/my-presenter-assignments', getMyPresenterAssignments);
router.get('/sessions/:id/presenters', getSessionPresenters);
router.post('/sessions/:id/presenters/:userId/presented', markSessionPresenterPresented);
router.post('/sessions/:id/meeting-lifecycle', markSupervisionMeetingLifecycle);
router.get('/sessions/:id/artifacts', getSupervisionSessionArtifacts);
router.post('/sessions/:id/artifacts', upsertSupervisionSessionArtifacts);
router.post('/sessions', createSupervisionSessionValidators, createSupervisionSession);
router.patch('/sessions/:id', patchSupervisionSessionValidators, patchSupervisionSession);
router.post('/sessions/:id/cancel', cancelSupervisionSession);

export default router;

