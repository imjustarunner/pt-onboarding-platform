import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import {
  heartbeat,
  getMyPresence,
  listAgencyPresence,
  listAdminPresence,
  listPresence,
  listPresenceForAgency,
  getMyPresenceStatus,
  updateMyPresence,
  updateUserPresence,
  bulkUpdatePresence,
  nudgeUserPresence,
  markOffline,
  setAvailability
} from '../controllers/presence.controller.js';

const router = express.Router();

router.use(authenticate);

// Chat/heartbeat presence (existing)
router.post('/heartbeat', heartbeat);
router.get('/me', getMyPresence);
router.post('/availability', setAvailability);
router.post('/offline', markOffline);
router.get('/agency/:agencyId/team', listPresenceForAgency);
router.get('/agency/:agencyId', listAgencyPresence);
router.get('/admins', listAdminPresence);

// Team Board presence (status-based: In/Out/Traveling)
router.get('/', requireSuperAdmin, listPresence);
router.get('/status/me', getMyPresenceStatus);
router.put('/status/me', updateMyPresence);
router.post('/bulk-update', requireSuperAdmin, bulkUpdatePresence);
router.put('/status/:userId', requireSuperAdmin, updateUserPresence);
router.post('/status/:userId/nudge', requireSuperAdmin, nudgeUserPresence);

export default router;

