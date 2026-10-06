import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ state: vi.fn(), save: vi.fn(), check: vi.fn(), agency: vi.fn() }));
vi.mock('../../controllers/prehirePortal.controller.js', () => ({ portalStateForUser: mocks.state, getPortalTask: vi.fn(), viewPortalSignedFile: vi.fn() }));
vi.mock('../hirePortalWorkflow.service.js', () => ({ savePortalStep: mocks.save, portalStepSubmissions: vi.fn(), validatePreemployment: vi.fn() }));
vi.mock('../hireGroupAccount.service.js', () => ({ checkHireWorkEmailAvailability: mocks.check }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.agency } }));
import { saveWorkflowStep } from '../../controllers/hirePortalWorkflow.controller.js';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.mockResolvedValue({ candidate: { status: 'ONBOARDING' }, agency: { id: 2 }, workflow: { steps: { onboarding: [{ key: 'work-email', kind: 'work-email' }] } } });
  mocks.agency.mockResolvedValue({ id: 2 });
});
async function save(email) {
  const next = vi.fn(), res = { json: vi.fn() };
  await saveWorkflowStep({ portalUser: { id: 1 }, params: { stepKey: 'work-email' }, body: { email } }, res, next);
  return { next, res };
}
describe('custom onboarding work email', () => {
  it('accepts an available custom agency address without requiring it in the suggestions', async () => {
    mocks.check.mockResolvedValue({ available: true });
    const { next } = await save(' Devon.Custom@ITSCO.health ');
    expect(next).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledWith({ email: 'devon.custom@itsco.health', userId: 1, agency: { id: 2 } });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ value: { email: 'devon.custom@itsco.health', preferenceOnly: true } }));
  });
  it.each([['wrong_domain', 400], ['taken_in_app', 400], ['taken_in_directory', 400], ['directory_error', 503]])('does not save when the address check returns %s', async (reason, status) => {
    mocks.check.mockResolvedValue({ available: false, reason, expectedDomain: 'itsco.health' });
    const { next } = await save('custom@itsco.health');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
