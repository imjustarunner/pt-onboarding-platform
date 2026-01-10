import express from 'express';
import { getAgencyUsers, getUserProgress, getTrackProgress, getModuleProgress } from '../controllers/agencyDashboard.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:agencyId/users', authenticate, requireAdmin, getAgencyUsers);
router.get('/:agencyId/users/:userId/progress', authenticate, requireAdmin, getUserProgress);
router.get('/:agencyId/users/:userId/tracks/:trackId/progress', authenticate, requireAdmin, getTrackProgress);
router.get('/:agencyId/users/:userId/modules/:moduleId/progress', authenticate, requireAdmin, getModuleProgress);

export default router;

