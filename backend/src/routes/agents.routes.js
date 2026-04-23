import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { agentLimiter } from '../middleware/rateLimiter.middleware.js';
import { assist, getCapabilities } from '../controllers/agents.controller.js';

const router = express.Router();

router.post('/assist', authenticate, agentLimiter, assist);
router.get('/capabilities', authenticate, agentLimiter, getCapabilities);

export default router;

