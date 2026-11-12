import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn((req, res, next) => req.headers.authorization ? next() : res.status(401).json({ denied: true })) }));
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: m.auth }));
vi.mock('../../controllers/userAdminDocs.controller.js', () => Object.fromEntries([
  'listUserAdminDocs','createUserAdminDocNote','createUserAdminDocUpload','viewUserAdminDoc','deleteUserAdminDoc',
  'restoreUserAdminDoc','setUserAdminDocLegalHold','releaseUserAdminDocLegalHold','createAdminDocAccessRequest',
  'listAdminDocAccessRequests','approveAdminDocAccessRequest','denyAdminDocAccessRequest','listAdminDocAccessGrants','revokeAdminDocAccessGrant'
].map(name => [name, (_req,res) => res.json({ handled: true })])));
import router from '../userAdminDocs.routes.js';
beforeEach(() => vi.clearAllMocks());
const request = (url, method = 'GET') => new Promise((resolve, reject) => {
  const res = { status: vi.fn().mockReturnThis(), json: data => resolve(data) };
  router.handle({ url, method, headers: {} }, res, error => error ? reject(error) : resolve({ passed: true }));
});
it('does not run database authentication for unrelated dashboard or inbox requests', async () => {
  for (const path of ['/communications/conversations','/dashboard/work-queue','/public/agency-services/itsco']) {
    expect(await request(path)).toEqual({ passed: true });
  }
  expect(m.auth).not.toHaveBeenCalled();
});
it('still rejects unauthenticated access to every admin document route before handling uploads or records', async () => {
  for (const layer of router.stack.filter(layer => layer.route)) {
    const url = layer.route.path.replace(/:[a-zA-Z]+/g, '42');
    const method = Object.keys(layer.route.methods)[0].toUpperCase();
    expect(await request(url, method)).toEqual({ denied: true });
  }
});
