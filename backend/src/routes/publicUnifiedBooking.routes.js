import express from 'express';
import {
  publicBookingOptions,
  publicCreateAppointmentRequest
} from '../controllers/publicUnifiedBooking.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/:agencySlug/booking-options', publicBookingOptions);
router.post('/:agencySlug/appointments', publicCreateAppointmentRequest);

export default router;
