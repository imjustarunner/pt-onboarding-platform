import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ byEmail: vi.fn(), byId: vi.fn(), execute: vi.fn(), change: vi.fn(), validate: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findByEmail: m.byEmail, findById: m.byId, changePassword: m.change, validatePasswordlessToken: m.validate } }));
vi.mock('../../services/email.service.js', () => ({ default: { isConfigured: () => false } }));
vi.mock('../summitStats.controller.js', () => ({ getPlatformAgencyId: vi.fn() }));
import { login, resetPasswordWithToken, initialSetup } from '../auth.controller.js';
beforeEach(() => {
  vi.clearAllMocks();
  // findByEmail historically omits is_active; the authoritative read must catch it.
  const user = { id: 42, role: 'school_staff', status: 'ACTIVE_EMPLOYEE', email: 'school@example.test' };
  m.byEmail.mockResolvedValue(user); m.validate.mockResolvedValue({ ...user, passwordless_token_purpose: 'reset' });
  m.byId.mockResolvedValue({ ...user, is_active: 0 });
  m.execute.mockResolvedValue([[{ ...user, is_active: 0 }]]);
});
const fixture = () => ({
  req: { params: { token: 'old-token' }, body: { username: 'school@example.test', password: 'UniquePassword!9473' }, headers: {} },
  res: { status: vi.fn().mockReturnThis(), json: vi.fn(), cookie: vi.fn() }, next: vi.fn()
});
it('rejects password login despite an ACTIVE_EMPLOYEE status and an incomplete lookup record', async () => {
  const { req, res, next } = fixture();
  await login(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_DISABLED', status: 403 }));
  expect(res.cookie).not.toHaveBeenCalled(); expect(m.change).not.toHaveBeenCalled();
});
it.each([['reset', resetPasswordWithToken], ['setup', initialSetup]])('cannot reactivate a disabled account using an old %s link', async (_name, handler) => {
  const { req, res, next } = fixture();
  await handler(req, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(403);
  expect(m.change).not.toHaveBeenCalled(); expect(res.cookie).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.every(([sql]) => !/UPDATE|INSERT/i.test(sql))).toBe(true);
});
