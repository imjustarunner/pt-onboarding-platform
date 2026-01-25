import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getMyOfficeReviewSummary, confirmMyBookingPlan } from '../controllers/officeReview.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/me/summary', getMyOfficeReviewSummary);
router.post('/me/booking-plans/:planId/confirm', confirmMyBookingPlan);

export default router;

