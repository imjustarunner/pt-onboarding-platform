import express from 'express';
import { authenticate, requireBackofficeAdmin, requireAdmin } from '../middleware/auth.middleware.js';
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

router.get('/', requireBackofficeAdmin, listSurveys);
router.post('/', requireBackofficeAdmin, createSurvey);
router.put('/:id', requireBackofficeAdmin, updateSurvey);
router.delete('/:id', requireBackofficeAdmin, deleteSurvey);
router.post('/:id/push', requireBackofficeAdmin, pushSurvey);
router.get('/:id/pushes', requireBackofficeAdmin, listSurveyPushes);
router.get('/:id/responses', requireBackofficeAdmin, listSurveyResponses);

export default router;
