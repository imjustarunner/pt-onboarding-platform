import express from 'express';
import { authenticateCounselingSession } from '../middleware/counselingInvitationAccess.middleware.js';
import { exchangeCounselingInvitation } from '../services/counselingInvitationAccess.service.js';
import { getClientRecordingConsent,requestClientRecordingConsent,signClientRecordingConsent,previewClientConsentPdf,withdrawClientRecordingConsent } from '../controllers/counselingRecordingConsent.controller.js';
import { getMeetingTranscription,setMeetingTranscription,saveMeetingAudio,meetingAudioUpload } from '../controllers/meetingTranscription.controller.js';
import { createCounselingTranscriptNote } from '../controllers/counselingTranscriptNote.controller.js';
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
  rollActivity
} from '../controllers/counselingSessions.controller.js';

const router = express.Router();

router.post('/invite/:token/accept',async(req,res,next)=>{try{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).json(await exchangeCounselingInvitation(req.params.token));}catch(e){next(e);}});
router.use(authenticateCounselingSession);
router.get('/sessions/:sessionId/recording-consent',getClientRecordingConsent);
router.post('/sessions/:sessionId/recording-consent/request',requestClientRecordingConsent);
router.post('/sessions/:sessionId/recording-consent/sign',signClientRecordingConsent);
router.get('/sessions/:sessionId/recording-consent/pdf',previewClientConsentPdf);
router.post('/sessions/:sessionId/recording-consent/withdraw',withdrawClientRecordingConsent);
router.get('/sessions/:sessionId/transcription',getMeetingTranscription);
router.post('/sessions/:sessionId/transcription/control',setMeetingTranscription);
router.post('/sessions/:sessionId/transcription/audio',meetingAudioUpload.single('audio'),saveMeetingAudio);
router.post('/sessions/:sessionId/transcription/note',createCounselingTranscriptNote);

// Unified activity registry
router.get('/activities', listActivities);
// Solo practice / Tools preview (no video, no client)
router.post('/activities/:activityId/practice', startPracticeActivity);


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
