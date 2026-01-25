import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listKioskEvents,
  checkInToEvent,
  listKioskQuestionnaires,
  getKioskQuestionnaireDefinition,
  submitKioskQuestionnaire,
  listKioskProviders,
  submitKioskSurvey,
  listCheckins,
  getSlotSurveys
} from '../controllers/kiosk.controller.js';

const router = express.Router();

// Public kiosk endpoints
router.get('/:locationId/events', listKioskEvents);
router.post('/:locationId/checkin', checkInToEvent);
router.get('/:locationId/questionnaires', listKioskQuestionnaires);
router.get('/:locationId/questionnaires/:moduleId/definition', getKioskQuestionnaireDefinition);
router.post('/:locationId/questionnaires/submit', submitKioskQuestionnaire);

// Legacy kiosk endpoints (PIN-based PHQ9/GAD7)
router.get('/:locationId/providers', listKioskProviders);
router.post('/:locationId/submit', submitKioskSurvey);

// Authenticated endpoints (dashboards)
router.use(authenticate);
router.get('/:locationId/checkins', listCheckins);
router.get('/providers/:providerId/surveys', getSlotSurveys);

export default router;

