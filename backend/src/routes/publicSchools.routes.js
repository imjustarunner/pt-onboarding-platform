import express from 'express';
import { searchPublicSchools, renderPublicSchoolPrintablePacket } from '../controllers/publicSchools.controller.js';
import { publicSchoolPrintablePacketLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Public school finder (no auth)
router.get('/search', searchPublicSchools);
router.get('/:slug/printable-packet', publicSchoolPrintablePacketLimiter, renderPublicSchoolPrintablePacket);

export default router;

