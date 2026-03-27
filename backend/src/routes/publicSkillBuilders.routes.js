import express from 'express';
import { publicGeocodeLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  getPublicSkillBuildersProgramMeta,
  listPublicAgencyEnrollPrograms,
  listPublicAgencyEvents,
  listPublicProgramEnrollHubByPortalSlug,
  listPublicProgramEnrollHubByProgramSlug,
  listPublicProgramEventsByPortalSlug,
  listPublicProgramEventsByProgramSlug,
  listPublicSkillBuildersProgramEvents,
  rankPublicAgencyEventsByAddress,
  rankPublicProgramPortalEventsByAddress
} from '../controllers/skillBuildersPublic.controller.js';
import {
  eventDayClientCheckin,
  eventDayClientCheckout,
  eventDayEmployeeCheckinById,
  eventDayEmployeeCheckout,
  eventDayEmployeeIdentifyCheckin,
  getEventDayKioskContext,
  getSkillBuildersEventKioskMeta,
  identifySkillBuildersEventKioskStaff,
  listSkillBuildersEventKioskRoster,
  listSkillBuildersEventKioskSessions,
  skillBuildersEventKioskPublicClockIn,
  skillBuildersEventKioskPublicClockOut,
  unlockSkillBuildersEventKiosk,
  verifyEventDayGatePin
} from '../controllers/skillBuildersEventKioskPublic.controller.js';

const router = express.Router();

router.get('/agency/:slug/enroll/programs', listPublicAgencyEnrollPrograms);
router.get('/agency/:slug/events', listPublicAgencyEvents);
router.post('/agency/:slug/events/nearest', publicGeocodeLimiter, rankPublicAgencyEventsByAddress);
router.get('/agency/:slug/programs/:programSlug/enroll', listPublicProgramEnrollHubByProgramSlug);
router.get('/agency/:slug/programs/:programSlug/events', listPublicProgramEventsByProgramSlug);
router.get('/portal/:portalSlug/programs/:programSlug/enroll', listPublicProgramEnrollHubByPortalSlug);
router.get('/portal/:portalSlug/programs/:programSlug/events', listPublicProgramEventsByPortalSlug);
router.post(
  '/portal/:portalSlug/programs/:programSlug/events/nearest',
  publicGeocodeLimiter,
  rankPublicProgramPortalEventsByAddress
);
router.get('/agency/:slug/skill-builders-program', getPublicSkillBuildersProgramMeta);
router.get('/agency/:slug/skill-builders/events', listPublicSkillBuildersProgramEvents);

router.post('/agency/:slug/kiosk/unlock', unlockSkillBuildersEventKiosk);
router.get('/agency/:slug/kiosk/events/:eventId/meta', getSkillBuildersEventKioskMeta);
router.get('/agency/:slug/kiosk/events/:eventId/sessions', listSkillBuildersEventKioskSessions);
router.get('/agency/:slug/kiosk/events/:eventId/roster', listSkillBuildersEventKioskRoster);
router.post('/agency/:slug/kiosk/events/:eventId/identify', identifySkillBuildersEventKioskStaff);
router.post('/agency/:slug/kiosk/events/:eventId/clock-in', skillBuildersEventKioskPublicClockIn);
router.post('/agency/:slug/kiosk/events/:eventId/clock-out', skillBuildersEventKioskPublicClockOut);

// Event-day kiosk (check-in/check-out, waiver review, phase gating)
router.get('/agency/:slug/kiosk/events/:eventId/event-day', getEventDayKioskContext);
router.post('/agency/:slug/kiosk/events/:eventId/event-day/gate-pin', verifyEventDayGatePin);
router.post('/agency/:slug/kiosk/events/:eventId/event-day/client-checkin', eventDayClientCheckin);
router.post('/agency/:slug/kiosk/events/:eventId/event-day/client-checkout', eventDayClientCheckout);
router.post('/agency/:slug/kiosk/events/:eventId/event-day/employee-identify-checkin', eventDayEmployeeIdentifyCheckin);
router.post('/agency/:slug/kiosk/events/:eventId/event-day/employee-checkin', eventDayEmployeeCheckinById);
router.post('/agency/:slug/kiosk/events/:eventId/event-day/employee-checkout', eventDayEmployeeCheckout);

export default router;
