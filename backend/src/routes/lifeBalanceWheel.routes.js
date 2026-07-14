import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getDefaultTemplateHandler,
  getGuestTemplateHandler,
  createAssessmentHandler,
  getAssessmentHandler,
  putCategoryHandler,
  completeAssessmentHandler,
  addGoalHandler,
  listSubjectAssessmentsHandler,
  getPublicAssessmentHandler,
  putPublicCategoryHandler,
  completePublicAssessmentHandler,
  addPublicGoalHandler,
  startFromIntakeLinkHandler
} from '../controllers/lifeBalanceWheel.controller.js';

const router = express.Router();

// Public
router.get('/guest/template', getGuestTemplateHandler);
router.get('/public/:accessToken', getPublicAssessmentHandler);
router.put('/public/:accessToken/categories/:categoryKey', putPublicCategoryHandler);
router.post('/public/:accessToken/complete', completePublicAssessmentHandler);
router.post('/public/:accessToken/goals', addPublicGoalHandler);
router.post('/start/:publicKey', startFromIntakeLinkHandler);

router.use(authenticate);
router.get('/templates/default', getDefaultTemplateHandler);
router.post('/assessments', createAssessmentHandler);
router.get('/assessments/:id', getAssessmentHandler);
router.put('/assessments/:id/categories/:categoryKey', putCategoryHandler);
router.post('/assessments/:id/complete', completeAssessmentHandler);
router.post('/assessments/:id/goals', addGoalHandler);
router.get('/subjects/:type/:id/assessments', listSubjectAssessmentsHandler);

export default router;
