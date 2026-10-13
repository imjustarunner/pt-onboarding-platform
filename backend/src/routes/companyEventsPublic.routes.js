import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { publicIntakeLimiter } from '../middleware/rateLimiter.middleware.js';
import { getCompanyEventStaffLink, respondToCompanyEventStaffLink } from '../controllers/companyEventStaffLink.controller.js';
import { checkInCompanyEventGuest, checkOutCompanyEventGuest, getCompanyEventGuestAttendanceState } from '../controllers/companyEventGuestAttendance.controller.js';
import {
  getCompanyEventRsvpByToken,
  postCompanyEventRsvpByToken,
  getCompanyEventPublic,
  registerForCompanyEventPublic
} from '../controllers/companyEvents.controller.js';

const router = express.Router();
router.get('/staff/:id/:token', publicIntakeLimiter, getCompanyEventStaffLink);
router.post('/staff/:id/:token/respond', authenticate, respondToCompanyEventStaffLink);

// Public event landing page — no auth required.
router.get('/public/:id', getCompanyEventPublic);
// Self-registration (no token; looks up user by email).
router.post('/public/:id/register', publicIntakeLimiter, registerForCompanyEventPublic);
router.post('/public/:id/check-in', publicIntakeLimiter, checkInCompanyEventGuest);
router.post('/public/:id/check-out', publicIntakeLimiter, checkOutCompanyEventGuest);
router.post('/public/:id/attendance', publicIntakeLimiter, getCompanyEventGuestAttendanceState);

// Tokenized RSVP links for invitees (public; no auth required).
router.get('/rsvp/:token', getCompanyEventRsvpByToken);
router.post('/rsvp/:token', postCompanyEventRsvpByToken);

export default router;
