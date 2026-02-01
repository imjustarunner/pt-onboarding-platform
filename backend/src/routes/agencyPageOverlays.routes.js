import express from 'express';
import { authenticate, requireAgencyAccess, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  getRouteOverlays,
  upsertTutorialOverlay,
  upsertHelperOverlay,
  deleteTutorialOverlay,
  deleteHelperOverlay
} from '../controllers/agencyPageOverlays.controller.js';

const router = express.Router();

// Anyone in the org can read overlays (best-effort; if table missing returns missingTable=true)
router.get('/agencies/:agencyId/routes/:routeName', authenticate, requireAgencyAccess, getRouteOverlays);

// Only agency admins/support/staff (and super_admin) can publish/update overlays.
router.put('/agencies/:agencyId/routes/:routeName/tutorial', authenticate, requireAgencyAdmin, upsertTutorialOverlay);
router.put('/agencies/:agencyId/routes/:routeName/helper', authenticate, requireAgencyAdmin, upsertHelperOverlay);

router.delete('/agencies/:agencyId/routes/:routeName/tutorial', authenticate, requireAgencyAdmin, deleteTutorialOverlay);
router.delete('/agencies/:agencyId/routes/:routeName/helper', authenticate, requireAgencyAdmin, deleteHelperOverlay);

export default router;

