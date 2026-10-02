import express from 'express';
import rateLimit from 'express-rate-limit';
import { interviewApplicantAccess } from '../services/interviewApplicantAccess.service.js';
import { getTeamMeetingVideoToken, getTeamMeetingAdmissionStatus, postTeamMeetingJoinPresence } from '../controllers/teamMeetings.controller.js';
import { getInterviewSharedChat, postInterviewSharedChat } from '../controllers/interviewSharedChat.controller.js';

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
router.post('/chat', rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false }), postInterviewSharedChat);
export default router;
