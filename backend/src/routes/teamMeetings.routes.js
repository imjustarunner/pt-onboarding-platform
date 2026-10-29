import { trainingRsvp,trainingCalendar,getTrainingRoster,createTraining,getTraining,updateTraining,trainingHand,uploadTrainingAsset,downloadTrainingAsset,deleteTrainingAsset,trainingLogs } from '../controllers/scheduledTraining.controller.js';
import { getManualMeetingOptions, previewManualMeetingLog, createManualMeetingLog, resolveManualMeetingLog } from '../controllers/manualMeetingLog.controller.js';
import { listMyMeetings, getMyMeeting, saveMyMeetingNote, retryMyMeetingSummary, getMyMeetingActivity } from '../controllers/myMeetings.controller.js';
import {calendarHostList,calendarHostAdmit} from './meetingCalendar.routes.js';
import { calendarReply } from './meetingCalendar.routes.js';
import { shareTeamMeetingGuestLink, enterSharedTeamMeetingLink } from '../services/teamMeetingGuestLink.service.js';
import { authenticateTeamMeeting, authenticateTeamMeetingOptional } from '../middleware/teamMeetingInvitationAccess.middleware.js';
import express from 'express';
import interviewApplicantRoutes from './interviewApplicant.routes.js';
import { getInterviewSharedChat, postInterviewSharedChat, getInterviewQuestion, putInterviewQuestion } from '../controllers/interviewSharedChat.controller.js';
import multer from 'multer';
import { downloadInterviewCalendar } from '../controllers/interviewCalendar.controller.js';
import { authenticate, authenticateOptional } from '../middleware/auth.middleware.js';
import {
  getMeetingParticipantPreferences,
  putMeetingParticipantPreferences,
  getMeetingTypeSettings,
  putMeetingTypeSettings,
  getTeamMeetingJoinInfo,
  getTeamMeetingVideoToken,
  setTeamMeetingRecordingRules,
  saveTeamMeetingClientTranscript,
  getTeamMeetingTranscriptionState,
  appendTeamMeetingAudio,
  postTeamMeetingJoinPresence,
  getTeamMeetingLobbyParticipants,
  admitTeamMeetingParticipant,
  addTeamMeetingAttendee,
  trainingInviteCandidates,
  setTeamMeetingWaitingRoomLive,
  getTeamMeetingAdmissionStatus,
  getTeamMeetingWorkspace,
  upsertTeamMeetingWorkspace,
  escalateTeamMeetingActionItem,
  completeTeamMeetingSession,
  getTeamMeetingAttendance,
  getTeamMeetingTimeClaims,
  patchTeamMeetingTimeClaim,
  patchTeamMeetingClaimRate,
  getTeamMeetingNotes,
  postTeamMeetingTranscriptControl,
  enableTeamMeetingAttendanceTracking,
  listAdminMeetingsLog
} from '../controllers/teamMeetings.controller.js';
import { getTeamMeetingActivity, postTeamMeetingActivity } from '../controllers/videoMeetingActivity.controller.js';

const router = express.Router();
// Applicant token access is independent of staff login / onboarding cookies.
router.use('/interview-applicant/:eventId', interviewApplicantRoutes);

// Public: resolve event to org slug for join redirect (no auth)
router.get('/join-info/:eventId', authenticateTeamMeetingOptional, getTeamMeetingJoinInfo);
// Presence heartbeat (guest-safe; auth optional so we can normalize user-{id})
router.post('/:eventId/join-presence', authenticateTeamMeetingOptional, postTeamMeetingJoinPresence);
// Interview candidate join links work without an account (opaque participant token only).
router.get('/:eventId/video-token', authenticateTeamMeetingOptional, getTeamMeetingVideoToken);
router.get('/:eventId/admission-status', authenticateTeamMeetingOptional, getTeamMeetingAdmissionStatus);
router.get('/:eventId/calendar.ics', downloadInterviewCalendar);

router.use(authenticateTeamMeeting);
router.get('/:eventId/interview-chat', getInterviewSharedChat);
router.post('/:eventId/interview-chat', postInterviewSharedChat);
router.get('/:eventId/interview-question', getInterviewQuestion);
router.put('/:eventId/interview-question', putInterviewQuestion);

// Static paths before /:eventId
router.get('/training-calendar',trainingCalendar);
router.get('/training-roster',getTrainingRoster);
router.post('/training',createTraining);
router.get('/training-logs',trainingLogs);
router.get('/:eventId/training',getTraining);
router.patch('/:eventId/training',updateTraining);
router.post('/:eventId/training/hand',trainingHand);
router.post('/:eventId/training/rsvp',trainingRsvp);
router.post('/:eventId/training/assets',multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1}}).single('file'),uploadTrainingAsset);
router.get('/:eventId/training/assets/:assetId',downloadTrainingAsset);
router.delete('/:eventId/training/assets/:assetId',deleteTrainingAsset);

router.get('/manual-log/options', getManualMeetingOptions);
router.post('/manual-log/preview', previewManualMeetingLog);
router.post('/manual-log', createManualMeetingLog);
router.post('/:eventId/manual-log/:userId/resolve', resolveManualMeetingLog);
router.get('/my-meetings', listMyMeetings);
router.get('/my-meetings/:type/:id', getMyMeeting);
router.get('/my-meetings/:type/:id/activity', getMyMeetingActivity);
router.put('/my-meetings/:type/:id/personal-note', saveMyMeetingNote);
router.post('/my-meetings/:type/:id/summary', retryMyMeetingSummary);
router.get('/admin-log', listAdminMeetingsLog);
router.get('/types', getMeetingTypeSettings);
router.put('/types/:typeKey', putMeetingTypeSettings);

router.get('/:eventId/calendar-guests',calendarHostList('team-meeting'));
router.post('/:eventId/calendar-guests/:guestId/admit',calendarHostAdmit('team-meeting'));
router.get('/:eventId/lobby-participants', getTeamMeetingLobbyParticipants);
router.post('/:eventId/admit/:userId', admitTeamMeetingParticipant);
router.post('/:eventId/attendees', addTeamMeetingAttendee);
router.post('/:eventId/guest-link', calendarReply(req => shareTeamMeetingGuestLink(req.params.eventId, req.user.id)));
router.post('/:eventId/shared-link-entry', calendarReply(req => enterSharedTeamMeetingLink(req.params.eventId, req.user)));
router.get('/:eventId/training/invite-candidates', trainingInviteCandidates);
router.post('/:eventId/waiting-room', setTeamMeetingWaitingRoomLive);
router.post('/:eventId/recording-rules', setTeamMeetingRecordingRules);
router.get('/:eventId/transcription', getTeamMeetingTranscriptionState);
router.post('/:eventId/transcription/audio', multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024}}).single('audio'), appendTeamMeetingAudio);
router.post('/:eventId/client-transcript', saveTeamMeetingClientTranscript);
router.post('/:eventId/transcript-control', postTeamMeetingTranscriptControl);
router.post('/:eventId/enable-attendance-tracking', enableTeamMeetingAttendanceTracking);
router.get('/:eventId/activity', getTeamMeetingActivity);
router.post('/:eventId/activity', postTeamMeetingActivity);
router.get('/:eventId/participants', getMeetingParticipantPreferences);
router.put('/:eventId/participants/:userId', putMeetingParticipantPreferences);
router.get('/:eventId/workspace', getTeamMeetingWorkspace);
router.post('/:eventId/workspace', upsertTeamMeetingWorkspace);
router.post('/:eventId/action-items/:itemId/escalate', escalateTeamMeetingActionItem);
router.post('/:eventId/complete', completeTeamMeetingSession);
router.get('/:eventId/attendance', getTeamMeetingAttendance);
router.get('/:eventId/time-claims', getTeamMeetingTimeClaims);
router.patch('/:eventId/time-claims/:claimId', patchTeamMeetingTimeClaim);
router.patch('/:eventId/time-claims/:claimId/rate', patchTeamMeetingClaimRate);
router.get('/:eventId/notes', getTeamMeetingNotes);

export default router;
