import { describe, expect, it, vi } from 'vitest';
vi.mock('../hireJourney.service.js', () => ({ getJourney: vi.fn(), journeyTasks: vi.fn() }));
import { getJourney } from '../hireJourney.service.js';
import { enforcePortalWritePhase } from '../../middleware/portalWritePhase.middleware.js';
describe('candidate handbook Q&A is read-only', () => {
  it('permits answers after onboarding closes without permitting workflow edits', async () => {
    const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { method: 'POST', path: '/resources/handbook/answer', portalUser: { id: 7, status: 'PREHIRE_REVIEW' } };
    await enforcePortalWritePhase(req, res, next);
    expect(next).toHaveBeenCalledWith(); expect(getJourney).not.toHaveBeenCalled();
    getJourney.mockResolvedValue({ prehireCompletedAt: '2026-10-10' }); next.mockClear();
    await enforcePortalWritePhase({ ...req, path: '/workflow/handbook' }, res, next);
    expect(res.status).toHaveBeenCalledWith(409); expect(next).not.toHaveBeenCalled();
  });
});
