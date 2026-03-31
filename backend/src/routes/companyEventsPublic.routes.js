import express from 'express';
import { getCompanyEventRsvpByToken, postCompanyEventRsvpByToken } from '../controllers/companyEvents.controller.js';

const router = express.Router();

// Tokenized RSVP links for invitees (public; no auth required).
router.get('/rsvp/:token', getCompanyEventRsvpByToken);
router.post('/rsvp/:token', postCompanyEventRsvpByToken);

export default router;
