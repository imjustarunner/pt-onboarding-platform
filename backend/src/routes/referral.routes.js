import express from 'express';
import { createReferral, getReferrals, updateReferralStatus } from '../controllers/referral.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Referral routes (authenticated)
// POST /api/referrals - Create new referral (school staff)
router.post('/', authenticate, createReferral);

// GET /api/referrals - Get referrals (filtered by user's organization)
router.get('/', authenticate, getReferrals);

// PUT /api/referrals/:id/status - Update referral status (admin only)
router.put('/:id/status', authenticate, requireBackofficeAdmin, updateReferralStatus);

export default router;
