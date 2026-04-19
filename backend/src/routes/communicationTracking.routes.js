import express from 'express';
import { trackEmailOpen } from '../controllers/communicationTracking.controller.js';

const router = express.Router();

// Public open-tracking pixel — no auth (recipients are not logged in).
// Both `/track-open/:token` and `/track-open/:token.gif` are supported.
router.get('/track-open/:token', trackEmailOpen);

export default router;
