import express from 'express';
import { authenticate, authenticateOptional } from '../middleware/auth.middleware.js';
import {
  getTeamMeetingJoinInfo,
  getTeamMeetingVideoToken,
  setTeamMeetingRecordingRules,
  saveTeamMeetingClientTranscript,
  postTeamMeetingJoinPresence,
  getTeamMeetingLobbyParticipants,
  admitTeamMeetingParticipant,
  addTeamMeetingAttendee,
  setTeamMeetingWaitingRoomLive,
  getTeamMeetingAdmissionStatus,
  getTeamMeetingWorkspace,
  upsertTeamMeetingWorkspace,
  escalateTeamMeetingActionItem,
  completeTeamMeetingSession,
  getTeamMeetingAttendance,
  getTeamMeetingTimeClaims,
  patchTeamMeetingTimeClaim,
  getTeamMeetingNotes,
  postTeamMeetingTranscriptControl,
  enableTeamMeetingAttendanceTracking,
  listAdminMeetingsLog
} from '../controllers/teamMeetings.controller.js';
import { getTeamMeetingActivity, postTeamMeetingActivity } from '../controllers/videoMeetingActivity.controller.js';

const router = express.Router();

// Public: resolve event to org slug for join redirect (no auth)
router.get('/join-info/:eventId', getTeamMeetingJoinInfo);
// Presence heartbeat (guest-safe; auth optional so we can normalize user-{id})
router.post('/:eventId/join-presence', authenticateOptional, postTeamMeetingJoinPresence);
// Interview candidate join links work without an account (opaque participant token only).
router.get('/:eventId/video-token', authenticateOptional, getTeamMeetingVideoToken);
router.get('/:eventId/admission-status', authenticateOptional, getTeamMeetingAdmissionStatus);

router.use(authenticate);

// Static paths before /:eventId
router.get('/admin-log', listAdminMeetingsLog);

router.get('/:eventId/lobby-participants', getTeamMeetingLobbyParticipants);
router.post('/:eventId/admit/:userId', admitTeamMeetingParticipant);
router.post('/:eventId/attendees', addTeamMeetingAttendee);
router.post('/:eventId/waiting-room', setTeamMeetingWaitingRoomLive);
router.post('/:eventId/recording-rules', setTeamMeetingRecordingRules);
router.post('/:eventId/client-transcript', saveTeamMeetingClientTranscript);
router.post('/:eventId/transcript-control', postTeamMeetingTranscriptControl);
router.post('/:eventId/enable-attendance-tracking', enableTeamMeetingAttendanceTracking);
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
