import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../services/transitionWeek.service.js', () => ({ readTransitionWeek: vi.fn(), saveTransitionWeek: vi.fn() }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
import { requireTransitionManager } from '../transitionWeek.controller.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); m.execute.mockResolvedValue([[{ id: 12 }]]); });
it('denies non-administrators and inactive/missing tenant membership, including broad legacy roles', async () => {
  const next = vi.fn();
  for (const role of ['provider','support','staff']) {
    const res = response(); await requireTransitionManager({ user: { id: 12, role }, query: { agencyId: 6 } }, res, next); expect(res.status).toHaveBeenCalledWith(403);
  }
  m.execute.mockResolvedValue([[]]);
  const res = response(); await requireTransitionManager({ user: { id: 12, role: 'super_admin' }, query: { agencyId: 6 } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
});
it('uses actual membership and prevents caching of authorized evidence', async () => {
  const req = { user: { id: 12, role: 'admin' }, params: { agencyId: '6' } }, res = response(), next = vi.fn();
  await requireTransitionManager(req, res, next);
  expect(m.execute.mock.calls[0][1]).toEqual([12,6]); expect(req.transitionAgencyId).toBe(6); expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store'); expect(next).toHaveBeenCalledOnce();
});
