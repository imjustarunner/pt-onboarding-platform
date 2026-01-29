import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { getExecutiveSnapshot, getExecutiveRevenueTimeseries } from '../controllers/executiveReport.controller.js';

const router = express.Router();

router.get('/snapshot', authenticate, requireSuperAdmin, getExecutiveSnapshot);
router.get('/timeseries/revenue', authenticate, requireSuperAdmin, getExecutiveRevenueTimeseries);

export default router;

