import express from 'express';
import { publicIntakeLimiter } from '../middleware/rateLimiter.middleware.js';
import { viewSmsConsentRequest, signSmsConsentRequest, createSmsConsentRequest,
  listSmsConsentRequests, reviewSmsConsentRequest, getSignedSmsEvidence } from '../services/smsConsentRequest.service.js';
import { buildSmsConsentDisclosure } from '../utils/smsConsentDisclosure.js';
import VonageService from '../services/vonage.service.js';

const handle = (fn) => async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json(await fn(req)); } catch (error) { next(error); }
};
export const publicSmsConsentRouter = express.Router();
publicSmsConsentRouter.get('/consent-example/itsco', handle(async (req) => ({
  example: true,
  disclosure: buildSmsConsentDisclosure({ brandName: 'ITSCO', legalName: 'ITSCO, LLC',
    supportContact: 'support@itsco.health', termsUrl: 'https://www.itsco.health/itsco/terms',
    privacyUrl: 'https://www.itsco.health/itsco/privacypolicy', purposes: req.query.program === 'marketing' ? ['marketing'] : ['care', 'reminders', 'workforce'] },
    { signerRole: req.query.audience === 'staff' ? 'staff' : 'client' })
})));
publicSmsConsentRouter.post('/consent-request/view', publicIntakeLimiter, handle((req) => viewSmsConsentRequest(req.body?.token)));
publicSmsConsentRouter.post('/consent-request/sign', publicIntakeLimiter, handle((req) => signSmsConsentRequest({
  token: req.body?.token, input: req.body, ip: req.ip, userAgent: String(req.get('user-agent') || '').slice(0, 500)
})));

export const listConsentRequests = handle((req) => listSmsConsentRequests(Number(req.params.agencyId)));
export const createConsentRequest = handle((req) => createSmsConsentRequest({
  agencyId: Number(req.params.agencyId), numberId: Number(req.body?.numberId), phone: req.body?.phone,
  signerRole: req.body?.signerRole, actorUserId: req.user.id
}));
export const reviewConsentRequest = handle((req) => reviewSmsConsentRequest({
  agencyId: Number(req.params.agencyId), requestId: Number(req.params.requestId), actorUserId: req.user.id,
  signerVerified: req.body?.signerVerified,
  sendConfirmation: (message) => VonageService.sendSms(message)
}));
export const downloadConsentEvidence = handle((req) => getSignedSmsEvidence({
  agencyId: Number(req.params.agencyId), requestId: Number(req.params.requestId)
}));
