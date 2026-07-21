import express from 'express';
import {
  unlockSchoolEventsKiosk,
  listSchoolEventsKioskEvents,
  listSchoolEventsKioskStaff,
  schoolEventsKioskEmployeeCheckin,
  schoolEventsKioskEmployeeCheckinByPin,
  schoolEventsKioskEmployeeCheckout,
  schoolEventsKioskPhotoStatus,
  schoolEventsKioskUploadPhoto
} from '../controllers/schoolEventsKioskPublic.controller.js';

const router = express.Router();

router.post('/agency/:slug/kiosk/unlock', unlockSchoolEventsKiosk);
router.get('/agency/:slug/kiosk/events', listSchoolEventsKioskEvents);
router.get('/agency/:slug/kiosk/events/:eventId/staff', listSchoolEventsKioskStaff);
router.get('/agency/:slug/kiosk/events/:eventId/staff/:userId/photo-status', schoolEventsKioskPhotoStatus);
router.post('/agency/:slug/kiosk/events/:eventId/photo', schoolEventsKioskUploadPhoto);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/employee', schoolEventsKioskEmployeeCheckin);
router.post('/agency/:slug/kiosk/events/:eventId/checkin/employee-pin', schoolEventsKioskEmployeeCheckinByPin);
router.post('/agency/:slug/kiosk/events/:eventId/checkout/employee', schoolEventsKioskEmployeeCheckout);

export default router;
