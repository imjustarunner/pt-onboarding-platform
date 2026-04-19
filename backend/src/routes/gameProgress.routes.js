import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getGameProgress, upsertGameProgress } from '../controllers/gameProgress.controller.js';

const router = express.Router();

router.get('/progress/:gameKey', authenticate, getGameProgress);
router.put('/progress/:gameKey', authenticate, upsertGameProgress);

export default router;
