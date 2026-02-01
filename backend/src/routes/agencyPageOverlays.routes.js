import express from 'express';
import { authenticate, requireAgencyAccess, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../middleware/auth.middleware.js';
import {
  getRouteOverlays,
  upsertTutorialOverlay,
  upsertHelperOverlay,
  deleteTutorialOverlay,
  deleteHelperOverlay
} from '../controllers/agencyPageOverlays.controller.js';
import {
  getPlatformHelperSettings,
  updatePlatformHelperSettings,
  uploadPlatformHelperImage,
  uploadPlatformHelperImageMiddleware
} from '../controllers/platformHelperSettings.controller.js';

const router = express.Router();

// Anyone in the org can read overlays (best-effort; if table missing returns missingTable=true)
router.get('/agencies/:agencyId/routes/:routeName', authenticate, requireAgencyAccess, getRouteOverlays);

// Only agency admins/support/staff (and super_admin) can publish/update overlays.
router.put('/agencies/:agencyId/routes/:routeName/tutorial', authenticate, requireAgencyAdmin, upsertTutorialOverlay);
router.put('/agencies/:agencyId/routes/:routeName/helper', authenticate, requireAgencyAdmin, upsertHelperOverlay);

router.delete('/agencies/:agencyId/routes/:routeName/tutorial', authenticate, requireAgencyAdmin, deleteTutorialOverlay);
router.delete('/agencies/:agencyId/routes/:routeName/helper', authenticate, requireAgencyAdmin, deleteHelperOverlay);

// Platform-wide helper settings (image, enabled flag). Superadmin only.
// Safe read for any authenticated user (providers need this when a helper is configured for a page).
router.get('/platform/helper-settings', authenticate, getPlatformHelperSettings);
router.put('/platform/helper-settings', authenticate, requireSuperAdmin, updatePlatformHelperSettings);
router.post('/platform/helper-image', authenticate, requireSuperAdmin, uploadPlatformHelperImageMiddleware, uploadPlatformHelperImage);

export default router;

