import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getLearningRecommendations } from '../controllers/learningRecommendations.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/students/:studentId', getLearningRecommendations);

export default router;
