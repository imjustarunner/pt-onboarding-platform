import { recordSecureMessageEvent } from '../services/secureMessageBoundary.service.js';
import express from 'express';
import {
  resolveSecureMessageClaim,
  buildSecureClaimRedirect
} from '../services/secureMessageNotify.service.js';

const router = express.Router();

router.get('/:token', async (req, res, next) => {
  try {
    const row = await resolveSecureMessageClaim(req.params.token);
    if (!row) return res.status(404).json({ error: { message: 'Invalid secure message link' } });
    res.set('Cache-Control', 'no-store');
    await recordSecureMessageEvent({ agencyId: row.agency_id, threadId: row.chat_thread_id,
      notificationId: row.id, eventType: 'notification_link_opened', req });
    const redirect = await buildSecureClaimRedirect(row);
    res.json({ ok: true, ...redirect, notificationId: row.id });
  } catch (e) {
    next(e);
  }
});

export default router;
