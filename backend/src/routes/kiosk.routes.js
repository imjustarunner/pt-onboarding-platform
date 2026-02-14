import express from 'express';
import { authenticate, requireKioskUser } from '../middleware/auth.middleware.js';
import {
  getKioskContext,
  listKioskEvents,
  checkInToEvent,
  listKioskQuestionnaires,
  getKioskQuestionnaireDefinition,
  submitKioskQuestionnaire,
  listKioskProviders,
  submitKioskSurvey,
  listCheckins,
  getSlotSurveys,
  listKioskProgramSites,
  listKioskProgramStaff,
  identifyByPin,
  kioskClockIn,
  kioskClockOut,
  listKioskGuardians,
  listKioskGuardianClients,
  kioskGuardianCheckin
} from '../controllers/kiosk.controller.js';

const router = express.Router();

// Authenticated kiosk user context (must be before :locationId)
router.get('/me/context', authenticate, requireKioskUser, getKioskContext);

// Public kiosk endpoints (backward compatibility)
router.get('/:locationId/events', listKioskEvents);
router.get('/:locationId/program-sites', listKioskProgramSites);
router.get('/:locationId/program-staff', listKioskProgramStaff);
router.post('/:locationId/identify-by-pin', identifyByPin);
router.get('/:locationId/guardians', listKioskGuardians);
router.get('/:locationId/guardian-clients', listKioskGuardianClients);
router.post('/:locationId/clock-in', kioskClockIn);
router.post('/:locationId/clock-out', kioskClockOut);
router.post('/:locationId/guardian-checkin', kioskGuardianCheckin);
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

