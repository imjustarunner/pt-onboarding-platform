import express from 'express';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { getAgencySpecs } from '../controllers/dashboard.controller.js';

const router = express.Router();

// At-a-glance dashboard metrics (admin dashboards)
router.get('/agency-specs', authenticate, requireBackofficeAdmin, getAgencySpecs);

export default router;

