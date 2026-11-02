import express from 'express';
import rateLimit from 'express-rate-limit';
import { createNotifyreWebhook } from './notifyre.routes.js';

const router = express.Router();
router.post('/webhook', rateLimit({ windowMs: 60000, max: 1200, standardHeaders: true, legacyHeaders: false }),
  express.raw({ type: 'application/json', limit: '256kb' }), createNotifyreWebhook({auricwellAlias:true}));
export default router;
