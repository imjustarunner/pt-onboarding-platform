import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { heartbeat, getMyPresence, listAgencyPresence, markOffline, setAvailability } from '../controllers/presence.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/heartbeat', heartbeat);
router.get('/me', getMyPresence);
router.post('/availability', setAvailability);
router.post('/offline', markOffline);
router.get('/agency/:agencyId', listAgencyPresence);

export default router;

