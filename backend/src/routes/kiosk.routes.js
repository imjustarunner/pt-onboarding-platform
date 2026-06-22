import express from 'express';
import { authenticate, requireKioskUser } from '../middleware/auth.middleware.js';
import {
  getKioskContext,
  listKioskEvents,
  checkInToEvent,
  listKioskQuestionnaires,
  getKioskIntakeLinkDefinition,
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
  getKioskGuardianWaiverStatus,
  postKioskGuardianWaiverSection,
  kioskGuardianCheckin,
  listKioskSkillBuilderEvents,
  listKioskSkillBuilderEventRoster,
  listKioskSkillBuilderEventSessions,
  listKioskAttachedSurveys,
  kioskSkillBuilderEventClockIn,
  kioskSkillBuilderEventClockOut,
  // Provider-First Welcome Kiosk
  listProvidersToday,
  listProviderSlotsToday,
  listAvailableRooms,
  reserveRoomByPin,
  // Provider Questionnaire Management (authenticated)
  listProviderQuestRules,
  createProviderQuestRule,
  deleteProviderQuestRule,
  listProviderQuestResponses,
  tagResponseToClient
} from '../controllers/kiosk.controller.js';

const router = express.Router();

// Authenticated kiosk user context (must be before :locationId)
router.get('/me/context', authenticate, requireKioskUser, getKioskContext);

// Provider-First Welcome Kiosk: public endpoints
router.get('/:locationId/providers-today', listProvidersToday);
router.get('/:locationId/providers/:providerId/slots-today', listProviderSlotsToday);
router.get('/:locationId/available-rooms', listAvailableRooms);
router.post('/:locationId/reserve-by-pin', reserveRoomByPin);

// Public kiosk endpoints (backward compatibility)
router.get('/:locationId/skill-builders-events/:eventId/sessions', listKioskSkillBuilderEventSessions);
router.get('/:locationId/skill-builders-events/:eventId/attached-surveys', listKioskAttachedSurveys);
router.get('/:locationId/skill-builders-events/:eventId/roster', listKioskSkillBuilderEventRoster);
router.post('/:locationId/skill-builders-events/:eventId/clock-in', kioskSkillBuilderEventClockIn);
router.post('/:locationId/skill-builders-events/:eventId/clock-out', kioskSkillBuilderEventClockOut);
router.get('/:locationId/skill-builders-events', listKioskSkillBuilderEvents);
router.get('/:locationId/events', listKioskEvents);
router.get('/:locationId/program-sites', listKioskProgramSites);
router.get('/:locationId/program-staff', listKioskProgramStaff);
router.post('/:locationId/identify-by-pin', identifyByPin);
router.get('/:locationId/guardians', listKioskGuardians);
router.get('/:locationId/guardian-clients', listKioskGuardianClients);
router.get('/:locationId/guardian-waiver-status', getKioskGuardianWaiverStatus);
router.post('/:locationId/guardian-waiver-section', postKioskGuardianWaiverSection);
router.post('/:locationId/clock-in', kioskClockIn);
router.post('/:locationId/clock-out', kioskClockOut);
router.post('/:locationId/guardian-checkin', kioskGuardianCheckin);
router.post('/:locationId/checkin', checkInToEvent);
router.get('/:locationId/questionnaires', listKioskQuestionnaires);
router.get('/:locationId/intake-questionnaire/:intakeLinkId/definition', getKioskIntakeLinkDefinition);
router.get('/:locationId/intake-questionnaire/:intakeLinkId/definition', getKioskIntakeLinkDefinition);
router.get('/:locationId/questionnaires/:moduleId/definition', getKioskQuestionnaireDefinition);
router.post('/:locationId/questionnaires/submit', submitKioskQuestionnaire);

// Legacy kiosk endpoints (PIN-based PHQ9/GAD7)
router.get('/:locationId/providers', listKioskProviders);
router.post('/:locationId/submit', submitKioskSurvey);

// Authenticated endpoints (dashboards)
router.use(authenticate);
router.get('/:locationId/checkins', listCheckins);
router.get('/providers/:providerId/surveys', getSlotSurveys);

// Provider Questionnaire Management (authenticated)
router.get('/questionnaire-rules', listProviderQuestRules);
router.post('/questionnaire-rules', createProviderQuestRule);
router.delete('/questionnaire-rules/:ruleId', deleteProviderQuestRule);
router.get('/questionnaire-responses', listProviderQuestResponses);
router.patch('/questionnaire-responses/:responseId/tag-client', tagResponseToClient);

export default router;

