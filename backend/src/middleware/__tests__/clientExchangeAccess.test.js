import { beforeEach, expect, it, vi } from 'vitest';
const find = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute: async (sql, args) => [[await find(args[0])]] } }));
import { requireExchangeAccess } from '../clientExchangeAccess.middleware.js';
const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => vi.clearAllMocks());
it.each(['staff', 'support', 'admin', 'super_admin'])('uses the current %s role even when the token has an old provider role', async role => {
  find.mockResolvedValue({ id: 555, role, is_active: 1 });
  const req = { user: { id: 555, role: 'provider' } }, next = vi.fn();
  await requireExchangeAccess(req, response(), next);
  expect(next).toHaveBeenCalledWith(); expect(req.user.role).toBe(role);
});
it('does not retain staff authority after demotion or account deactivation', async () => {
  find.mockResolvedValue({ role: 'provider', is_active: 1 });
  const req = { user: { id: 7, role: 'admin' } };
  await requireExchangeAccess(req, response(), vi.fn()); expect(req.user.role).toBe('provider');
  find.mockResolvedValue({ role: 'admin', is_active: 0 });
  const res = response(), next = vi.fn(); await requireExchangeAccess(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
});
it('preserves the restricted role in an explicit demo session', async () => {
  const req = { user: { id: 7, role: 'provider', demoMode: true } };
  await requireExchangeAccess(req, response(), vi.fn()); expect(find).not.toHaveBeenCalled(); expect(req.user.role).toBe('provider');
});
