import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  generateSourceAdaptedLearningContent,
  generatePersonalizedLearningContent
} from '../controllers/learningContentGeneration.controller.js';

const router = express.Router();
router.use(authenticate);

router.post('/generate/source-adapted', generateSourceAdaptedLearningContent);
router.post('/generate/personalized', generatePersonalizedLearningContent);

export default router;
