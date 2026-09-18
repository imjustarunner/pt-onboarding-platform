import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { status, begin, confirm, challenge, reset, forget, sessions, sessionEvents, endSession, sendEmailCode, verifyEmailCode } from '../controllers/accountSecurity.controller.js';
import { ownProtection, requestFileAccess, printIntent } from '../controllers/activityProtection.controller.js';
const router = express.Router();
router.use(authenticate);
router.use((req, res, next) => {
  // Custom header requires a successful CORS preflight for cross-site writes.
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-Account-Security') !== '1') return res.status(403).json({ error: { message: 'Use the account security screen to make this change.' } });
  next();
});
router.get('/', status);
router.get('/activity-protection', ownProtection);
router.post('/activity-protection/requests', requestFileAccess);
router.post('/activity-protection/print', printIntent);
router.post('/authenticator/begin', authLimiter, begin);
router.post('/authenticator/confirm', authLimiter, confirm);
router.post('/authenticator/verify', authLimiter, challenge);
router.post('/authenticator/reset', authLimiter, reset);
router.post('/email/send', authLimiter, sendEmailCode);
router.post('/email/verify', authLimiter, verifyEmailCode);
router.delete('/devices/:deviceId', forget);
router.get('/sessions', sessions);
router.get('/sessions/:reference/events', sessionEvents);
router.post('/sessions/:reference/end', endSession);
export default router;
