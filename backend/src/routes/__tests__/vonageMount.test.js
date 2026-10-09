import { readFileSync } from 'node:fs';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../controllers/vonageWebhook.controller.js', () => ({
  inboundSmsWebhook: vi.fn((req, res) => res.json({ received: 'inbound' })),
  deliveryStatusWebhook: vi.fn((req, res) => res.json({ received: 'status' }))
}));
vi.mock('../../services/vonage.service.js', () => ({ default: {
  validateWebhook: vi.fn(({ signature }) => signature === 'valid-carrier-signature')
} }));
import router from '../vonage.routes.js';
import VonageService from '../../services/vonage.service.js';
import { inboundSmsWebhook, deliveryStatusWebhook } from '../../controllers/vonageWebhook.controller.js';

let server;
let origin;
let auditActions;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  const app = express();
  auditActions = [];
  app.use((req, res, next) => { res.once('finish', () => auditActions.push(req.evidenceAction)); next(); });
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const staffAuthentication = (req, res) => res.status(401).json({ error: 'No token provided' });
  // Replay the real server's relative mounting order. The broad staff routers
  // must not consume a carrier callback before its signature can be checked.
  const mounts = [...readFileSync(new URL('../../server.js', import.meta.url), 'utf8')
    .matchAll(/app\.use\('([^']+)', (vonageRoutes|userCommunicationRoutes|userAdminDocsRoutes)\);/g)];
  expect(mounts.filter(m => m[2] === 'vonageRoutes')).toHaveLength(1);
  for (const [, path, name] of mounts) app.use(path, name === 'vonageRoutes' ? router : staffAuthentication);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  vi.unstubAllEnvs();
});

describe('production Vonage callbacks mounted alongside staff APIs', () => {
  it.each(['inbound', 'status'])('requires a carrier signature for %s, not a staff token', async endpoint => {
    const response = await fetch(`${origin}/api/vonage/${endpoint}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Missing Vonage signature' });
    expect(inboundSmsWebhook).not.toHaveBeenCalled();
    expect(deliveryStatusWebhook).not.toHaveBeenCalled();
    expect(auditActions).toEqual(['vonage_signature_missing']);
  });
  it.each(['inbound', 'status'])('accepts signed GET and POST %s callbacks without a login', async endpoint => {
    const params = { to: '17195550100', text: 'HELP', sig: 'valid-carrier-signature' };
    for (const method of ['GET', 'POST']) {
      const response = await fetch(`${origin}/api/vonage/${endpoint}${method === 'GET' ? '?' + new URLSearchParams(params) : ''}`, {
        method, ...(method === 'POST' ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) } : {})
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: endpoint });
      expect(VonageService.validateWebhook).toHaveBeenLastCalledWith({ signature: params.sig, params: { to: params.to, text: params.text } });
    }
  });
  it('rejects an invalid signature without invoking a callback', async () => {
    const response = await fetch(`${origin}/api/vonage/inbound?sig=invalid`);
    expect(response.status).toBe(403);
    expect(inboundSmsWebhook).not.toHaveBeenCalled();
    expect(auditActions).toEqual(['vonage_signature_invalid']);
  });
  it('continues requiring staff login for the private API', async () => {
    expect((await fetch(`${origin}/api/communications/pending`)).status).toBe(401);
  });
});
