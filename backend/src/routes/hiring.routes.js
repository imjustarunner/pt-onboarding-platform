import express from 'express';
import multer from 'multer';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  listCandidates,
  createCandidate,
  listHiringAssignees,
  listJobDescriptions,
  createJobDescription,
  updateJobDescription,
  deleteJobDescription,
  viewJobDescriptionFile,
  getCandidate,
  createCandidateNote,
  listCandidateResumes,
  uploadCandidateResume,
  viewCandidateResume,
  deleteCandidateResume,
  getCandidatePhoto,
  getCandidateResumeSummary,
  generateCandidateResumeSummary,
  transferCandidateAgency,
  archiveCandidate,
  markCandidateNotHired,
  deleteCandidate,
  requestCandidateResearch,
  generateCandidatePreScreenReport,
  promoteCandidateToPendingSetup,
  listCandidateTasks,
  createCandidateTask,
  patchCandidateInterview,
  listCandidateReferenceRequests,
  listCandidateReferenceActivity,
  postCandidateReferenceRequestsSend,
  listCandidateReviews,
  createCandidateReview,
  toggleHiringNoteKudos,
  setHiringNoteReaction,
  deleteHiringNoteReaction,
  getMyPendingInterviewSplashes,
  submitMyInterviewSplash,
  getMyPendingTimeCapsuleReveals,
  postTimeCapsuleRevealOpen,
  postTimeCapsuleRevealAcknowledge,
  postTimeCapsuleRevealSnooze
} from '../controllers/hiring.controller.js';

const router = express.Router();

// All hiring endpoints require hiring capability
router.use(authenticate, requireCapability('canManageHiring'));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const okTypes = new Set([
      'application/pdf',
      'text/plain',
      'image/png',
      'image/jpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);
    if (okTypes.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported file type'), false);
  }
});

router.get('/candidates', listCandidates);
router.post('/candidates', createCandidate);
router.get('/me/pending-interview-splashes', getMyPendingInterviewSplashes);
router.post('/me/interview-splash', submitMyInterviewSplash);
router.get('/me/pending-time-capsule-reveals', getMyPendingTimeCapsuleReveals);
router.post('/me/time-capsule-reveals/:entryId/open', postTimeCapsuleRevealOpen);
router.post('/me/time-capsule-reveals/:entryId/acknowledge', postTimeCapsuleRevealAcknowledge);
router.post('/me/time-capsule-reveals/:entryId/snooze', postTimeCapsuleRevealSnooze);
router.get('/assignees', listHiringAssignees);
router.get('/job-descriptions', listJobDescriptions);
router.post('/job-descriptions', upload.single('file'), createJobDescription);
router.put('/job-descriptions/:jobDescriptionId', upload.single('file'), updateJobDescription);
router.delete('/job-descriptions/:jobDescriptionId', deleteJobDescription);
router.get('/job-descriptions/:jobDescriptionId/view', viewJobDescriptionFile);
router.get('/candidates/:userId', getCandidate);
router.patch('/candidates/:userId/interview', patchCandidateInterview);
router.get('/candidates/:userId/reference-requests', listCandidateReferenceRequests);
router.get('/candidates/:userId/reference-activity', listCandidateReferenceActivity);
router.post('/candidates/:userId/reference-requests/send', postCandidateReferenceRequestsSend);
router.get('/candidates/:userId/reviews', listCandidateReviews);
router.post('/candidates/:userId/reviews', createCandidateReview);
router.post('/candidates/:userId/notes', createCandidateNote);
router.post('/candidates/:userId/notes/:noteId/kudos', toggleHiringNoteKudos);
router.post('/candidates/:userId/notes/:noteId/reactions', setHiringNoteReaction);
router.delete('/candidates/:userId/notes/:noteId/reactions', deleteHiringNoteReaction);
router.get('/candidates/:userId/tasks', listCandidateTasks);
router.post('/candidates/:userId/tasks', createCandidateTask);
router.get('/candidates/:userId/resumes', listCandidateResumes);
router.post('/candidates/:userId/resumes/upload', upload.single('file'), uploadCandidateResume);
router.get('/candidates/:userId/resumes/:docId/view', viewCandidateResume);
router.delete('/candidates/:userId/resumes/:docId', deleteCandidateResume);
router.get('/candidates/:userId/photo', getCandidatePhoto);
router.get('/candidates/:userId/resume-summary', getCandidateResumeSummary);
router.post('/candidates/:userId/resume-summary', generateCandidateResumeSummary);
router.post('/candidates/:userId/transfer-agency', transferCandidateAgency);
router.post('/candidates/:userId/archive', archiveCandidate);
router.post('/candidates/:userId/not-hired', markCandidateNotHired);
router.delete('/candidates/:userId', deleteCandidate);
router.post('/candidates/:userId/research', requestCandidateResearch);
router.post('/candidates/:userId/prescreen', generateCandidatePreScreenReport);
router.post('/candidates/:userId/promote', promoteCandidateToPendingSetup);

export default router;

