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
  getSupervisionSessionPersonalNote,
  upsertSupervisionSessionPersonalNote,
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
  signupForSupervisionSession,
  withdrawFromSupervisionSession,
  getSupervisionJoinInfo,
  getSupervisionGuestJoin,
  getGuestAdmissionStatus,
  postSupervisionJoinPresence,
  saveGuestTranscript
} from '../controllers/supervisionSessions.controller.js';
import {
  getSupervisionActivity,
  postSupervisionActivity,
  getSupervisionGuestActivity,
  postSupervisionGuestActivity
} from '../controllers/videoMeetingActivity.controller.js';
import {
  listSessionPresentations,
  getOrCreateMyPresentation,
  updatePresentation,
  createSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
  uploadPresentationFile,
  presentationUploadMiddleware,
  setExternalPresentationLink,
  getPresentationState,
  putPresentationState
} from '../controllers/supervisionPresentations.controller.js';

const router = express.Router();

// Public: resolve session to org slug for join redirect (no auth)
router.get('/join-info/:sessionId', getSupervisionJoinInfo);
// Public: guest video join via opaque join_token (no login)
router.get('/guest-join/:joinToken', getSupervisionGuestJoin);
router.get('/guest-admission/:joinToken', getGuestAdmissionStatus);
router.post('/guest-transcript/:joinToken', saveGuestTranscript);
router.get('/guest-activity/:joinToken', getSupervisionGuestActivity);
router.post('/guest-activity/:joinToken', postSupervisionGuestActivity);
router.post('/sessions/:id/join-presence', postSupervisionJoinPresence);

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
router.get('/sessions/:id/presentations', listSessionPresentations);
router.get('/sessions/:id/presentations/mine', getOrCreateMyPresentation);
router.get('/sessions/:id/presentation-state', getPresentationState);
router.put('/sessions/:id/presentation-state', putPresentationState);
router.patch('/presentations/:presentationId', updatePresentation);
router.post('/presentations/:presentationId/slides', createSlide);
router.patch('/presentations/:presentationId/slides/reorder', reorderSlides);
router.patch('/presentation-slides/:slideId', updateSlide);
router.delete('/presentation-slides/:slideId', deleteSlide);
router.post(
  '/presentations/:presentationId/upload',
  (req, res, next) => {
    presentationUploadMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ error: { message: err.message || 'Upload failed' } });
      return next();
    });
  },
  uploadPresentationFile
);
router.post('/presentations/:presentationId/external-link', setExternalPresentationLink);
router.post('/sessions/:id/meeting-lifecycle', markSupervisionMeetingLifecycle);
router.post('/sessions/:id/finalize', finalizeSupervisionSessionBySubmit);
router.get('/sessions/:id/video-token', getSupervisionVideoToken);
router.get('/sessions/:id/lobby-participants', getLobbyParticipants);
router.get('/sessions/:id/admission-status', getAdmissionStatus);
router.post('/sessions/:id/admit/:userId', admitToMainRoom);
router.post('/sessions/:id/client-transcript', saveClientTranscript);
router.get('/sessions/:id/artifacts', getSupervisionSessionArtifacts);
router.post('/sessions/:id/artifacts', upsertSupervisionSessionArtifacts);
router.get('/sessions/:id/personal-note', getSupervisionSessionPersonalNote);
router.put('/sessions/:id/personal-note', upsertSupervisionSessionPersonalNote);
router.get('/sessions/:id/activity', getSupervisionActivity);
router.post('/sessions/:id/activity', postSupervisionActivity);
router.post('/sessions', createSupervisionSessionValidators, createSupervisionSession);
router.post('/sessions/:id/signup', signupForSupervisionSession);
router.delete('/sessions/:id/signup', withdrawFromSupervisionSession);
router.patch('/sessions/:id', patchSupervisionSessionValidators, patchSupervisionSession);
router.post('/sessions/:id/cancel', cancelSupervisionSession);

export default router;

