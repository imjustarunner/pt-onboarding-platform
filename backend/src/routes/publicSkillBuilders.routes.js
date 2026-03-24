import express from 'express';
import { publicGeocodeLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  getPublicSkillBuildersProgramMeta,
  listPublicAgencyEvents,
  listPublicProgramEventsByPortalSlug,
  listPublicProgramEventsByProgramSlug,
  listPublicSkillBuildersProgramEvents,
  rankPublicAgencyEventsByAddress,
  rankPublicProgramPortalEventsByAddress
} from '../controllers/skillBuildersPublic.controller.js';
import {
  getSkillBuildersEventKioskMeta,
  identifySkillBuildersEventKioskStaff,
  listSkillBuildersEventKioskRoster,
  listSkillBuildersEventKioskSessions,
  skillBuildersEventKioskPublicClockIn,
  skillBuildersEventKioskPublicClockOut,
  unlockSkillBuildersEventKiosk
} from '../controllers/skillBuildersEventKioskPublic.controller.js';

const router = express.Router();

router.get('/agency/:slug/events', listPublicAgencyEvents);
router.post('/agency/:slug/events/nearest', publicGeocodeLimiter, rankPublicAgencyEventsByAddress);
router.get('/agency/:slug/programs/:programSlug/events', listPublicProgramEventsByProgramSlug);
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

export default router;
