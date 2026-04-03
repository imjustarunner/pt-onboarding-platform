import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  createSurvey,
  deleteSurvey,
  dismissSurveyPush,
  listClientSurveyResponses,
  listMyPendingSurveyPushes,
  listSurveyPushes,
  listSurveyResponses,
  listSurveys,
  pushSurvey,
  respondToSurvey,
  updateSurvey
} from '../controllers/survey.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/my-pending', listMyPendingSurveyPushes);
router.post('/pushes/:pushId/dismiss', dismissSurveyPush);
router.post('/:id/respond', respondToSurvey);

router.get('/client/:clientId/responses', requireAdmin, listClientSurveyResponses);

router.get('/', listSurveys);
router.post('/', createSurvey);
router.put('/:id', updateSurvey);
router.delete('/:id', deleteSurvey);
router.post('/:id/push', pushSurvey);
router.get('/:id/pushes', listSurveyPushes);
router.get('/:id/responses', listSurveyResponses);

export default router;
