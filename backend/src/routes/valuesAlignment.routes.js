import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getGuestTemplateHandler,
  getDefaultTemplateHandler,
  createAssessmentHandler,
  getAssessmentHandler,
  putSelectionHandler,
  putValueHandler,
  completeAssessmentHandler,
  postCommitmentHandler,
  listSubjectAssessmentsHandler,
  getPublicAssessmentHandler,
  putPublicSelectionHandler,
  putPublicValueHandler,
  completePublicAssessmentHandler,
  postPublicCommitmentHandler
} from '../controllers/valuesAlignment.controller.js';

const router = express.Router();

// Public / guest
router.get('/guest/template', getGuestTemplateHandler);
router.get('/public/:accessToken', getPublicAssessmentHandler);
router.put('/public/:accessToken/selection', putPublicSelectionHandler);
router.put('/public/:accessToken/values/:valueKey', putPublicValueHandler);
router.post('/public/:accessToken/complete', completePublicAssessmentHandler);
router.post('/public/:accessToken/commitments', postPublicCommitmentHandler);

router.use(authenticate);
router.get('/templates/default', getDefaultTemplateHandler);
router.post('/assessments', createAssessmentHandler);
router.get('/assessments/:id', getAssessmentHandler);
router.put('/assessments/:id/selection', putSelectionHandler);
router.put('/assessments/:id/values/:valueKey', putValueHandler);
router.post('/assessments/:id/complete', completeAssessmentHandler);
router.post('/assessments/:id/commitments', postCommitmentHandler);
router.get('/subjects/:type/:id/assessments', listSubjectAssessmentsHandler);

export default router;
