import express from 'express';
import multer from 'multer';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  listCandidates,
  createCandidate,
  listHiringAssignees,
  listJobDescriptions,
  createJobDescription,
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
  deleteCandidate,
  requestCandidateResearch,
  generateCandidatePreScreenReport,
  promoteCandidateToPendingSetup,
  listCandidateTasks,
  createCandidateTask
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
router.get('/assignees', listHiringAssignees);
router.get('/job-descriptions', listJobDescriptions);
router.post('/job-descriptions', upload.single('file'), createJobDescription);
router.get('/job-descriptions/:jobDescriptionId/view', viewJobDescriptionFile);
router.get('/candidates/:userId', getCandidate);
router.post('/candidates/:userId/notes', createCandidateNote);
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
router.delete('/candidates/:userId', deleteCandidate);
router.post('/candidates/:userId/research', requestCandidateResearch);
router.post('/candidates/:userId/prescreen', generateCandidatePreScreenReport);
router.post('/candidates/:userId/promote', promoteCandidateToPendingSetup);

export default router;

