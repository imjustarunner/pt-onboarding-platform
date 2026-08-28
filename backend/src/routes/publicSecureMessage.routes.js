import express from 'express';
import {
  resolveSecureMessageClaim,
  buildSecureClaimRedirect,
  markSecureMessageRead
} from '../services/secureMessageNotify.service.js';

const router = express.Router();

router.get('/:token', async (req, res, next) => {
  try {
    const row = await resolveSecureMessageClaim(req.params.token);
    if (!row) return res.status(404).json({ error: { message: 'Invalid secure message link' } });
    await markSecureMessageRead({
      notificationId: row.id,
      via: 'email_claim',
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
    const redirect = await buildSecureClaimRedirect(row);
    res.json({ ok: true, ...redirect, notificationId: row.id });
  } catch (e) {
    next(e);
  }
});

export default router;
