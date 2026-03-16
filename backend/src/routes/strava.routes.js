import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  stravaConnectStart,
  stravaCallback,
  stravaDisconnect,
  stravaStatus,
  stravaActivities,
  stravaImport
} from '../controllers/strava.controller.js';

const router = express.Router();

router.get('/connect', authenticate, stravaConnectStart);
router.get('/callback', stravaCallback);
router.delete('/disconnect', authenticate, stravaDisconnect);
router.get('/status', authenticate, stravaStatus);
router.get('/activities', authenticate, stravaActivities);
router.post('/import', authenticate, stravaImport);

export default router;
