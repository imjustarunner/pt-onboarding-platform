import express from 'express';
import { publicIntakeLimiter } from '../middleware/rateLimiter.middleware.js';
import { viewSmsConsentRequest, signSmsConsentRequest, createSmsConsentRequest,
  listSmsConsentRequests, reviewSmsConsentRequest, getSignedSmsEvidence } from '../services/smsConsentRequest.service.js';
import { smsConsentExample } from '../utils/smsConsentExamples.js';
import VonageService from '../services/vonage.service.js';

const handle = (fn) => async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json(await fn(req)); } catch (error) { next(error); }
};
export const publicSmsConsentRouter = express.Router();
publicSmsConsentRouter.get('/consent-example/:brandSlug', handle(async (req) => smsConsentExample(req.params.brandSlug, req.query)));
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
