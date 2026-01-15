import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listKioskProviders,
  submitKioskSurvey,
  listCheckins,
  getSlotSurveys
} from '../controllers/kiosk.controller.js';

const router = express.Router();

// Public kiosk endpoints
router.get('/:locationId/providers', listKioskProviders);
router.post('/:locationId/submit', submitKioskSurvey);

// Authenticated endpoints (dashboards)
router.use(authenticate);
router.get('/:locationId/checkins', listCheckins);
router.get('/providers/:providerId/surveys', getSlotSurveys);

export default router;

