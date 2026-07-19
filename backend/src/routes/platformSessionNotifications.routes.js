import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  getPlatformSessionNotifications,
  putPlatformSessionNotifications
} from '../controllers/sessionNotification.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus);
router.get('/', getPlatformSessionNotifications);
router.put('/', putPlatformSessionNotifications);

export default router;
