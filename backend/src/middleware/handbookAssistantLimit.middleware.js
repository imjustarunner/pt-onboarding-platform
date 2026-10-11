import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';

export const handbookAssistantLimit = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => crypto.createHash('sha256').update(String(req.user?.id ? `user:${req.user.id}` : req.portalUser?.id ? `candidate:${req.portalUser.id}` : `recipient:${req.params.token || req.ip}`)).digest('hex'),
  message: { error: { message: 'You’ve asked several questions recently. Please wait a few minutes before asking another.' } }
});
