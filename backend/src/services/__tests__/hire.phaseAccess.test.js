import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ journeyTasks: vi.fn(), getJourney: vi.fn() }));
vi.mock('../hireJourney.service.js', () => m);
import { enforcePortalWritePhase } from '../../middleware/portalWritePhase.middleware.js';
beforeEach(() => { vi.clearAllMocks(); m.getJourney.mockResolvedValue(null); });
async function request(path, status, tasks = []) {
  m.journeyTasks.mockResolvedValue(tasks);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; const next = vi.fn();
  await enforcePortalWritePhase({ method: 'POST', path, portalUser: { id: 1, status } }, res, next);
  return { res, next };
}
describe('portal process permissions', () => {
  it('rejects changing closed prehire submissions', async () => {
    const { res, next } = await request('/background-check', 'PREHIRE_REVIEW');
    expect(res.status).toHaveBeenCalledWith(409); expect(next).not.toHaveBeenCalled();
  });
  it('rejects another phase or another user task', async () => {
    const { res } = await request('/tasks/42/sign', 'ONBOARDING', [{ id: 42, phase: 'pre_hire', status: 'pending' }]);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('does not let acknowledgment bypass a required signature', async () => {
    const { res } = await request('/tasks/42/acknowledge', 'ONBOARDING', [{ id: 42, phase: 'onboarding', status: 'pending', taskType: 'document', actionType: 'signature' }]);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('uses the current assignment when a module was also used in prehire', async () => {
    const { next } = await request('/modules/9/complete', 'ONBOARDING', [
      { referenceId: 9, taskType: 'training', phase: 'pre_hire', status: 'completed' },
      { referenceId: 9, taskType: 'training', phase: 'onboarding', status: 'pending' }
    ]);
    expect(next).toHaveBeenCalledWith();
  });
  it('leaves People Operations messaging available after submission', async () => {
    const { next } = await request('/messages', 'PREHIRE_REVIEW'); expect(next).toHaveBeenCalledWith();
  });
});

import { isHirePortalOnly } from '../../utils/hirePortalToken.js';
describe('portal token cannot become a staff session', () => {
  it('blocks a portal-purpose token even after employment activation', () => expect(isHirePortalOnly({ status: 'ACTIVE_EMPLOYEE', passwordless_token_purpose: 'prehire_portal' })).toBe(true));
  it('blocks legacy onboarding setup tokens from consuming the personal link', () => expect(isHirePortalOnly({ status: 'ONBOARDING', passwordless_token_purpose: 'setup' })).toBe(true));
  it('preserves the password-reset flow', () => expect(isHirePortalOnly({ status: 'ONBOARDING', passwordless_token_purpose: 'reset' })).toBe(false));
});
