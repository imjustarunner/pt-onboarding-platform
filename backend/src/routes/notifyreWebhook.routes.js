import express from 'express';
import rateLimit from 'express-rate-limit';
import { acceptNotifyreWebhook } from '../services/auricwell/clientMessaging.js';

const router = express.Router();
router.post('/webhook', rateLimit({ windowMs: 60000, max: 1200, standardHeaders: true, legacyHeaders: false }),
  express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (process.env.AURICWELL_ENABLED !== 'true') return res.status(503).json({ error: 'Messaging unavailable.' });
    try { res.json(await acceptNotifyreWebhook(req.body, req.get('Notifyre-Signature'))); }
    catch (e) { res.status([400,403,409].includes(e.status) ? e.status : 503).json({ error: e.status === 403 ? 'Invalid signature.' : 'Webhook could not be accepted.' }); }
  });
export default router;
