import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { interviewApplicantAccess } from '../services/interviewApplicantAccess.service.js';
import { getTeamMeetingVideoToken, getTeamMeetingAdmissionStatus, postTeamMeetingJoinPresence, getTeamMeetingTranscriptionState, appendTeamMeetingAudio } from '../controllers/teamMeetings.controller.js';
import { getInterviewSharedChat, postInterviewSharedChat, getInterviewQuestion } from '../controllers/interviewSharedChat.controller.js';

const router = express.Router({ mergeParams: true });
router.use(async (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    req.interviewApplicant = await interviewApplicantAccess(req.params.eventId);
    delete req.user;
    delete req.teamMeetingInvitationAccess;
    next();
  } catch (e) { next(e); }
});

// Reuse the video/admission lifecycle, but return only applicant-facing fields.
// Waiting-room prep, transcript state and staff workspace settings stay private.
const applicantReply = handler => (req, res, next) => {
  const json = res.json.bind(res);
  res.json = data => json(Object.fromEntries(Object.entries(data || {}).filter(([key]) => [
    'error', 'token', 'sessionId', 'applicationId', 'roomName', 'roomMode', 'identity',
    'displayName', 'roleLabel', 'admitted', 'meetingCompleted', 'interviewGuestEnded',
    'headline', 'message', 'contactEmail', 'contactPhone', 'agencyName', 'peopleOpsLabel', 'ok'
  ].includes(key))));
  return handler(req, res, next);
};
router.get('/video-token', applicantReply(getTeamMeetingVideoToken));
router.get('/admission-status', applicantReply(getTeamMeetingAdmissionStatus));
router.post('/join-presence', applicantReply(postTeamMeetingJoinPresence));
router.get('/chat', getInterviewSharedChat);
router.get('/question', getInterviewQuestion);
// Capture-only access: applicants never receive the transcript or staff workspace.
router.get('/transcription', getTeamMeetingTranscriptionState);
router.post('/transcription/audio', rateLimit({ windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false }),
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('audio'), appendTeamMeetingAudio);
router.post('/chat', rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false }), postInterviewSharedChat);
export default router;
