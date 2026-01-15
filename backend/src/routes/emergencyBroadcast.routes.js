import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { createAndSendBroadcast, listBroadcasts } from '../controllers/emergencyBroadcast.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', listBroadcasts);
router.post('/', createAndSendBroadcast);

export default router;

