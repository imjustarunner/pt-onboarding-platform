import express from 'express';
import { getAgencyUsers, getUserProgress, getTrackProgress, getModuleProgress } from '../controllers/agencyDashboard.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:agencyId/users', authenticate, requireBackofficeAdmin, getAgencyUsers);
router.get('/:agencyId/users/:userId/progress', authenticate, requireBackofficeAdmin, getUserProgress);
router.get('/:agencyId/users/:userId/tracks/:trackId/progress', authenticate, requireBackofficeAdmin, getTrackProgress);
router.get('/:agencyId/users/:userId/modules/:moduleId/progress', authenticate, requireBackofficeAdmin, getModuleProgress);

export default router;

