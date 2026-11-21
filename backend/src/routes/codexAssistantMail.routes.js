import express from 'express';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/database.js';
import CommunicationLoggingService from '../services/communicationLogging.service.js';
import { sendCodexAssistantMail } from '../services/codexAssistantMail.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';

const verifier = new OAuth2Client();
const router = express.Router();
const limiter = rateLimit({ windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post(['/', '/preflight'], limiter, async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  if (process.env.CODEX_ASSISTANT_MAIL_ENABLED !== 'true') return res.sendStatus(404);
  const audience = process.env.CODEX_ASSISTANT_MAIL_AUDIENCE;
  const expectedEmail = process.env.CODEX_ASSISTANT_MAIL_IDENTITY;
  const expectedSubject = process.env.CODEX_ASSISTANT_MAIL_SUBJECT;
  const token = req.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!audience || !expectedEmail || !expectedSubject || !token) return res.sendStatus(403);

  let claims;
  try { claims = (await verifier.verifyIdToken({ idToken: token, audience })).getPayload(); }
  catch { return res.sendStatus(403); }
  if (claims?.sub !== expectedSubject || claims?.email !== expectedEmail || claims?.email_verified !== true) {
    return res.sendStatus(403);
  }
  if (!req.is('application/json')) return res.sendStatus(415);

  try {
    const result = await sendCodexAssistantMail({
      input: req.body, principal: claims.sub, preflight: req.path === '/preflight', configuration: process.env.CODEX_ASSISTANT_MAIL_ALIASES,
      db: pool, send: sendEmailFromIdentity,
      log: params => CommunicationLoggingService.logGeneratedCommunication(params)
    });
    return res.status(['ready', 'sent'].includes(result.status) ? 200 : 202).json(result);
  } catch (error) {
    if ([400, 403, 409].includes(error.status)) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    return res.status(503).json({ error: { code: 'CODEX_ASSISTANT_MAIL_UNAVAILABLE', message: 'Review the request receipt before retrying.' } });
  }
});

export default router;
