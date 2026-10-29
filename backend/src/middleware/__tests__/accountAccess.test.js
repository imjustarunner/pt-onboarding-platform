import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), verify: vi.fn(), security: vi.fn() }));
vi.mock('jsonwebtoken', () => ({ default: { verify: m.verify } }));
vi.mock('../../config/config.js', () => ({ default: { jwt: { secret: 'test-only' } } }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../services/productIdentity.service.js', () => ({ assertFullSuitePrincipal: async () => {} }));
vi.mock('../../services/passkeys.service.js', () => ({ assertPasskeySession: async () => {} }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [] } }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../services/personalSessionHistory.service.js', () => ({ recordAccountSession: async () => {} }));
vi.mock('../../services/sessionSecurity.service.js', () => ({ getSessionSecurity: m.security, sessionRouteAllowed: () => true, invalidateSessionPolicyCache: () => {} }));
vi.mock('../accountSecurity.middleware.js', () => ({ enforceAccountSecurity: (_req, _res, next) => next() }));
import { authenticate, authenticateOptional } from '../auth.middleware.js';
beforeEach(() => {
  vi.clearAllMocks();
  m.verify.mockReturnValue({ id: 42, role: 'school_staff', status: 'ACTIVE_EMPLOYEE' });
  m.security.mockResolvedValue({ state: { phase: 'active' } });
});
const fixture = () => ({
  req: { method: 'GET', originalUrl: '/api/school-portal/20/clients', headers: {}, cookies: { authToken: 'previously-issued-token' } },
  res: { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn().mockReturnThis() }, next: vi.fn()
});

it.each(['cookie', 'bearer'])('blocks a previously signed-in user via %s before loading any session or protected data', async source => {
  m.execute.mockResolvedValue([[{ status: 'ACTIVE_EMPLOYEE', is_active: 0 }]]);
  const { req, res, next } = fixture();
  if (source === 'bearer') { req.cookies = {}; req.headers.authorization = 'Bearer previous-token'; }
  await authenticate(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ error: { code: 'ACCOUNT_DISABLED', message: expect.any(String) } });
  expect(next).not.toHaveBeenCalled(); expect(m.security).not.toHaveBeenCalled(); expect(req.user).toBeUndefined();
});

it('does not silently attach a disabled identity through optional authentication', async () => {
  m.execute.mockResolvedValue([[{ status: 'ACTIVE_EMPLOYEE', is_active: 0 }]]);
  const { req, res, next } = fixture();
  await authenticateOptional(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DISABLED' }));
  expect(req.user).toBeUndefined(); expect(m.security).not.toHaveBeenCalled();
});

it('keeps enabled school sessions working', async () => {
  m.execute.mockResolvedValue([[{ status: 'ACTIVE_EMPLOYEE', is_active: 1 }]]);
  const { req, res, next } = fixture();
  await authenticate(req, res, next);
  expect(next).toHaveBeenCalledWith(); expect(req.user.id).toBe(42); expect(res.status).not.toHaveBeenCalled();
});
