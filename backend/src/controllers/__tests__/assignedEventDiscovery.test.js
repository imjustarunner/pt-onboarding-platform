import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) }, onTableWrite: vi.fn() }));
vi.mock('../../utils/userAgencyAffiliationAccess.js', () => ({ userHasAgencyOrAffiliatedOrgAccessForRequest: vi.fn() }));
import pool from '../../config/database.js';
import { userHasAgencyOrAffiliatedOrgAccessForRequest as access } from '../../utils/userAgencyAffiliationAccess.js';
import { listMyAssignedSkillBuilderEvents } from '../skillBuildersProviderHub.controller.js';
beforeEach(() => { vi.clearAllMocks(); });
it('returns an empty assignment list for an authorized dashboard user without event assignments', async () => {
  access.mockResolvedValue(true);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await listMyAssignedSkillBuilderEvents({ query: { agencyId: 450 }, user: { id: 1434, role: 'support' } }, res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ events: [] });
});
it('still rejects a dashboard user without agency access before looking up assignments', async () => {
  access.mockResolvedValue(false);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await listMyAssignedSkillBuilderEvents({ query: { agencyId: 999 }, user: { id: 1434, role: 'support' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(pool.execute).not.toHaveBeenCalled();
});
