import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  stravaConnectStart,
  stravaCallback,
  stravaDisconnect,
  stravaStatus,
  stravaActivities,
  stravaImport,
  getAutoImportSettings,
  putAutoImportSettings,
  stravaWebhookVerify,
  stravaWebhookEvent,
} from '../controllers/strava.controller.js';

const router = express.Router();

router.get('/connect', authenticate, stravaConnectStart);
router.get('/callback', stravaCallback);
router.delete('/disconnect', authenticate, stravaDisconnect);
router.get('/status', authenticate, stravaStatus);
router.get('/activities', authenticate, stravaActivities);
router.post('/import', authenticate, stravaImport);

// Auto-import preferences (user-scoped)
router.get('/auto-import-settings', authenticate, getAutoImportSettings);
router.put('/auto-import-settings', authenticate, putAutoImportSettings);

// Strava webhook subscription (platform-scoped, no session auth — Strava validates via hub.challenge)
router.get('/webhook', stravaWebhookVerify);
router.post('/webhook', stravaWebhookEvent);

export default router;
