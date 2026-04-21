/**
 * Public program-event kiosk routes.
 *
 * The PIN entry surface is shared with the Skill Builders kiosk (see
 * `publicSkillBuilders.routes.js`), but once unlocked the program-event
 * kiosk uses these dedicated endpoints for roster + checkout.
 */
import express from 'express';
import {
  getProgramEventKioskContext,
  submitProgramEventCheckout
} from '../controllers/programEventKioskPublic.controller.js';

const router = express.Router();

router.get('/agency/:slug/kiosk/events/:eventId/context', getProgramEventKioskContext);
router.post('/agency/:slug/kiosk/events/:eventId/checkout', submitProgramEventCheckout);

export default router;
