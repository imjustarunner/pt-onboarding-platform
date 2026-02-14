import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { downloadCompanyEventIcsForMe, listMyCompanyEvents, respondToMyCompanyEvent } from '../controllers/companyEvents.controller.js';

const router = express.Router();

router.get('/company-events', authenticate, listMyCompanyEvents);
router.get('/company-events/:eventId/ics', authenticate, downloadCompanyEventIcsForMe);
router.post('/company-events/:eventId/respond', authenticate, respondToMyCompanyEvent);

export default router;
