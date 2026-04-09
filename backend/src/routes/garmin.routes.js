/**
 * Garmin Connect routes — mirrors strava.routes.js exactly.
 * All handlers return 503 "Coming soon" until the integration is live.
 */
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  garminConnectStart,
  garminCallback,
  garminDisconnect,
  garminStatus,
  garminActivities,
  garminImport,
  garminWebhook,
} from '../controllers/garmin.controller.js';

const router = express.Router();

router.get('/connect',      authenticate, garminConnectStart);
router.get('/callback',     garminCallback);
router.delete('/disconnect', authenticate, garminDisconnect);
router.get('/status',       authenticate, garminStatus);
router.get('/activities',   authenticate, garminActivities);
router.post('/import',      authenticate, garminImport);
// Webhook does not require session auth — Garmin validates via HMAC signature
router.post('/webhook',     garminWebhook);

export default router;
