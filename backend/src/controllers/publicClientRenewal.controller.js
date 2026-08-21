import * as ClientRenewal from '../services/clientRenewal.service.js';
import { requestBaseUrl } from '../services/publicFormBranding.service.js';

/** GET /api/public/client-renewal/:token */
export async function getPublicRenewal(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    const renewal = await ClientRenewal.getRenewalByToken(token);
    if (!renewal) {
      return res.status(404).json({ error: { message: 'Invalid or expired link' } });
    }
    const payload = await ClientRenewal.buildPublicPayload(renewal, {
      baseUrl: requestBaseUrl(req)
    });
    res.json({ ok: true, ...payload });
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/client-renewal/:token/verify-contact */
export async function postVerifyContact(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    const renewal = await ClientRenewal.submitVerifyContact(token, req.body || {});
    const payload = await ClientRenewal.buildPublicPayload(renewal, {
      baseUrl: requestBaseUrl(req)
    });
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

/** POST /api/public/client-renewal/:token/opt-out */
export async function postOptOut(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    const renewal = await ClientRenewal.optOut(token);
    const payload = await ClientRenewal.buildPublicPayload(renewal, {
      baseUrl: requestBaseUrl(req)
    });
    res.json({ ok: true, optedOut: true, ...payload });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

/** POST /api/public/client-renewal/:token/mark-step */
export async function postMarkStep(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    const step = req.body?.step || req.body?.stepKey || req.query?.step;
    const renewal = await ClientRenewal.markStepDone(token, step);
    const payload = await ClientRenewal.buildPublicPayload(renewal, {
      baseUrl: requestBaseUrl(req)
    });
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

/** POST /api/public/client-renewal/:token/support-tickets */
export async function postSupportTicket(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    const result = await ClientRenewal.createRenewalSupportTicket(token, req.body || {});
    res.status(201).json(result);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
}
