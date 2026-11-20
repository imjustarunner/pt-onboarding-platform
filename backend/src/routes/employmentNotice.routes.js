import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { runEmploymentNoticeCampaign } from '../services/employmentNoticeCampaign.service.js';
import { deliverEmploymentNoticeMail } from '../services/employmentNoticeDelivery.service.js';
import { acknowledgeEmploymentNotice, getEmploymentNotice } from '../services/employmentNotice.service.js';
import { identifyLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();
router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  next();
});

const handle = fn => async (req, res, next) => {
  try {
    if (!req.is('application/json')) return res.status(415).end();
    const result = await fn(req.body || {});
    if (!result) return res.status(404).json({ error: { message: 'This notice link is unavailable. Open the original notice email or contact leadership.' } });
    return res.json(result);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: { message: error.message } });
    return next(error);
  }
};

router.post('/read', identifyLimiter, handle(({ key }) => getEmploymentNotice(key)));
router.post('/acknowledge', identifyLimiter, handle(acknowledgeEmploymentNotice));


const verifier = new OAuth2Client();
router.post('/:operation(deliver|preflight|stage|apply-permissions)', async (req, res) => {
  if (process.env.EMPLOYMENT_NOTICE_ENABLED !== 'true') return res.sendStatus(404);
  const expectedEmail = process.env.EMPLOYMENT_NOTICE_DELIVERY_IDENTITY;
  const version = process.env.EMPLOYMENT_NOTICE_DELIVERY_VERSION;
  const audience = process.env.EMPLOYMENT_NOTICE_DELIVERY_AUDIENCE;
  const expectedSubject = process.env.EMPLOYMENT_NOTICE_DELIVERY_SUBJECT;
  const token = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!expectedEmail || !expectedSubject || !version || !audience || !token) return res.sendStatus(403);

  let claims;
  try { claims = (await verifier.verifyIdToken({ idToken: token, audience })).getPayload(); }
  catch { return res.sendStatus(403); }
  if (claims?.sub !== expectedSubject || claims.email !== expectedEmail || claims.email_verified !== true) {
    return res.sendStatus(403);
  }

  try {
    const action = req.params.operation;
    const result = action === 'deliver'
      ? await deliverEmploymentNoticeMail({ version, automationIdentity: expectedEmail })
      : await runEmploymentNoticeCampaign(action, expectedEmail);
    return res.status(result.held ? 503 : 200).json(result);
  } catch (error) {
    const conflict = error.status === 409;
    return res.status(conflict ? 409 : 503).json({
      error: { message: conflict ? error.message : 'The employment notice operation could not be verified.' }
    });
  }
});

export default router;
