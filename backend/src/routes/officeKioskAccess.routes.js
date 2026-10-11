import express from 'express';
import { kioskCookieName, kioskCookieOptions, unlockOffice, revokeToken } from '../services/officeKioskAccess.service.js';
import { kioskSameOrigin, requireOfficeDevice } from '../middleware/officeKioskAccess.middleware.js';
import { networkEvidence } from '../utils/securityEvidence.js';
const router = express.Router();
const action = fn => async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); await fn(req, res); }
  catch (error) {
    if (error.status) {
      if (error.status === 429) res.set('Retry-After', '3600');
      return res.status(error.status).json({ error: { message: error.message } });
    }
    next(error);
  }
};
router.use(kioskSameOrigin);
router.post('/unlock', action(async (req, res) => {
  const network = networkEvidence(req);
  // Match staff-login protection: only accept a verified proxy's client IP.
  const source = ['verified_google_lb', 'direct_peer'].includes(network.ipSource) ? network.clientIp : network.peerIp;
  const { token, session } = await unlockOffice(req.body?.code, source || 'unknown');
  // Replacing this browser's office also invalidates its previous token.
  await revokeToken(req.cookies?.[kioskCookieName()]);
  res.cookie(kioskCookieName(), token, kioskCookieOptions()).json(session);
}));
router.get('/session', requireOfficeDevice, (req, res) => res.json({ locationId: req.officeDevice.locationId, locationName: req.officeDevice.locationName }));
router.post('/lock', action(async (req, res) => {
  await revokeToken(req.cookies?.[kioskCookieName()]);
  const { maxAge, ...options } = kioskCookieOptions();
  res.clearCookie(kioskCookieName(), options).sendStatus(204);
}));
export default router;
