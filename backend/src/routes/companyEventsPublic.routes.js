import express from 'express';
import {
  getCompanyEventRsvpByToken,
  postCompanyEventRsvpByToken,
  getCompanyEventPublic,
  registerForCompanyEventPublic
} from '../controllers/companyEvents.controller.js';

const router = express.Router();

// Public event landing page — no auth required.
router.get('/public/:id', getCompanyEventPublic);
// Self-registration (no token; looks up user by email).
router.post('/public/:id/register', registerForCompanyEventPublic);

// Tokenized RSVP links for invitees (public; no auth required).
router.get('/rsvp/:token', getCompanyEventRsvpByToken);
router.post('/rsvp/:token', postCompanyEventRsvpByToken);

export default router;
