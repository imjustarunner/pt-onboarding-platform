import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { agentLimiter } from '../middleware/rateLimiter.middleware.js';
import { assist } from '../controllers/agents.controller.js';

const router = express.Router();

router.post('/assist', authenticate, agentLimiter, assist);

export default router;

