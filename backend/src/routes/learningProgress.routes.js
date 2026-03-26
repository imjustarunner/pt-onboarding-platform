import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getStudentDomainProgress,
  getStudentGoalsProgress,
  getStudentEvidenceTimeline,
  createLearningEvidence
} from '../controllers/learningProgress.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/students/:studentId/domains', getStudentDomainProgress);
router.get('/students/:studentId/goals', getStudentGoalsProgress);
router.get('/students/:studentId/evidence-timeline', getStudentEvidenceTimeline);
router.post('/evidence', createLearningEvidence);

export default router;
