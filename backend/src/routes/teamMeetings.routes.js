import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getTeamMeetingJoinInfo,
  getTeamMeetingVideoToken,
  setTeamMeetingRecordingRules,
  saveTeamMeetingClientTranscript,
  postTeamMeetingJoinPresence,
  getTeamMeetingLobbyParticipants,
  admitTeamMeetingParticipant,
  getTeamMeetingAdmissionStatus,
  getTeamMeetingWorkspace,
  upsertTeamMeetingWorkspace,
  escalateTeamMeetingActionItem,
  completeTeamMeetingSession,
  getTeamMeetingAttendance,
  getTeamMeetingTimeClaims,
  patchTeamMeetingTimeClaim,
  getTeamMeetingNotes
} from '../controllers/teamMeetings.controller.js';
import { getTeamMeetingActivity, postTeamMeetingActivity } from '../controllers/videoMeetingActivity.controller.js';

const router = express.Router();

// Public: resolve event to org slug for join redirect (no auth)
router.get('/join-info/:eventId', getTeamMeetingJoinInfo);
// Public presence heartbeat (identity in body; used during lobby wait)
router.post('/:eventId/join-presence', postTeamMeetingJoinPresence);

router.use(authenticate);

router.get('/:eventId/video-token', getTeamMeetingVideoToken);
router.get('/:eventId/lobby-participants', getTeamMeetingLobbyParticipants);
router.get('/:eventId/admission-status', getTeamMeetingAdmissionStatus);
router.post('/:eventId/admit/:userId', admitTeamMeetingParticipant);
router.post('/:eventId/recording-rules', setTeamMeetingRecordingRules);
router.post('/:eventId/client-transcript', saveTeamMeetingClientTranscript);
router.get('/:eventId/activity', getTeamMeetingActivity);
router.post('/:eventId/activity', postTeamMeetingActivity);
router.get('/:eventId/workspace', getTeamMeetingWorkspace);
router.post('/:eventId/workspace', upsertTeamMeetingWorkspace);
router.post('/:eventId/action-items/:itemId/escalate', escalateTeamMeetingActionItem);
router.post('/:eventId/complete', completeTeamMeetingSession);
router.get('/:eventId/attendance', getTeamMeetingAttendance);
router.get('/:eventId/time-claims', getTeamMeetingTimeClaims);
router.patch('/:eventId/time-claims/:claimId', patchTeamMeetingTimeClaim);
router.get('/:eventId/notes', getTeamMeetingNotes);

export default router;
