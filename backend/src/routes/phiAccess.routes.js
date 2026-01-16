import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { createPhiAccessLog } from '../controllers/phiAccess.controller.js';

const router = express.Router();

// POST /api/phi-access
router.post('/', authenticate, createPhiAccessLog);

export default router;

