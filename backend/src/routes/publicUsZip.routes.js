import express from 'express';
import { publicUsZipLimiter } from '../middleware/rateLimiter.middleware.js';
import { lookupPublicUsZip } from '../controllers/publicUsZip.controller.js';

const router = express.Router();
router.get('/:zip', publicUsZipLimiter, lookupPublicUsZip);
export default router;
