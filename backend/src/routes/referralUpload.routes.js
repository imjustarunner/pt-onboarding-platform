import express from 'express';
import { uploadReferralPacket } from '../controllers/referralUpload.controller.js';

const router = express.Router();

// Public route - no authentication required
// POST /api/organizations/:slug/upload-referral
router.post('/:slug/upload-referral', uploadReferralPacket);

export default router;
