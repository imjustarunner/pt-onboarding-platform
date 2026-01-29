import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { uploadPlatformRevenueReport, listPlatformRevenueUploads, getPlatformRevenueSummary } from '../controllers/platformRevenue.controller.js';

const router = express.Router();

// Platform-level only (super admin).
router.post('/uploads', authenticate, requireSuperAdmin, uploadPlatformRevenueReport);
router.get('/uploads', authenticate, requireSuperAdmin, listPlatformRevenueUploads);
router.get('/summary', authenticate, requireSuperAdmin, getPlatformRevenueSummary);

export default router;

