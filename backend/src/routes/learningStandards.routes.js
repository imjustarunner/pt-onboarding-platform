import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getLearningStandardsCatalog } from '../controllers/learningStandards.controller.js';

const router = express.Router();

router.use(authenticate);
router.get('/catalog', getLearningStandardsCatalog);

export default router;
