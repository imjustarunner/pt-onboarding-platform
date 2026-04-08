import express from 'express';
import { getAgencyUsers, getUserProgress, getTrackProgress, getModuleProgress, sendPasswordResetToUser } from '../controllers/agencyDashboard.controller.js';
import { authenticate, requireBackofficeAdmin, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// requireAdmin allows club_manager so SSC club managers can access their member list.
// getAgencyUsers itself verifies the user belongs to the requested agency.
router.get('/:agencyId/users', authenticate, requireAdmin, getAgencyUsers);
router.post('/:agencyId/users/:userId/send-password-reset', authenticate, requireAdmin, sendPasswordResetToUser);
router.get('/:agencyId/users/:userId/progress', authenticate, requireBackofficeAdmin, getUserProgress);
router.get('/:agencyId/users/:userId/tracks/:trackId/progress', authenticate, requireBackofficeAdmin, getTrackProgress);
router.get('/:agencyId/users/:userId/modules/:moduleId/progress', authenticate, requireBackofficeAdmin, getModuleProgress);

export default router;

