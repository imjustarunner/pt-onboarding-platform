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
  getProgramEventClientCheckinSheet,
  postProgramEventClientWaiverSection,
  submitProgramEventCheckout,
  programEventClientCheckin,
  programEventClientAbsent,
  programEventLateContact,
  programEventEmployeeCheckin,
  programEventEmployeeCheckinByPin,
  programEventEmployeeCheckout
} from '../controllers/programEventKioskPublic.controller.js';

const router = express.Router();

router.get('/agency/:slug/kiosk/events/:eventId/context', getProgramEventKioskContext);
router.post('/agency/:slug/kiosk/events/:eventId/checkout', submitProgramEventCheckout);
router.get('/agency/:slug/kiosk/events/:eventId/checkin/client/:clientId/sheet', getProgramEventClientCheckinSheet);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/client/waiver-section', postProgramEventClientWaiverSection);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/client', programEventClientCheckin);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/client/absent', programEventClientAbsent);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/late-contact', programEventLateContact);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/employee', programEventEmployeeCheckin);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/employee-pin', programEventEmployeeCheckinByPin);
router.post('/agency/:slug/kiosk/events/:eventId/checkout/employee', programEventEmployeeCheckout);

export default router;
