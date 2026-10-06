import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), user: vi.fn(), tasks: vi.fn(), journey: vi.fn(), extras: vi.fn(), background: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.user } }));
vi.mock('../hireJourney.service.js', () => ({ journeyTasks: mocks.tasks, getJourney: mocks.journey }));
vi.mock('../hirePortalExtras.service.js', () => ({ loadPortalPrehireExtras: mocks.extras }));
vi.mock('../backgroundCheckAuthorization.service.js', () => ({ getBackgroundCheckAuthorizationSummary: mocks.background }));
import { candidatePrehireProgress } from '../hireCandidateProgress.service.js';

let completed;
beforeEach(() => {
  vi.clearAllMocks(); completed = ['profile', 'headshot'];
  mocks.user.mockResolvedValue({ id: 1, status: 'PREHIRE_REVIEW' });
  mocks.tasks.mockResolvedValue([
    { id: 10, taskType: 'document', title: 'Employment agreement', phase: 'pre_hire', metadata: { contractGeneration: true }, status: 'completed', isRequired: true },
    { id: 11, taskType: 'document', title: 'Hiring: Authorization for Background Check', phase: 'pre_hire', status: 'pending', isRequired: true },
    { id: 12, taskType: 'document', title: 'Optional resource', phase: 'pre_hire', status: 'pending', isRequired: false },
    { id: 13, taskType: 'document', title: 'Future onboarding', phase: 'onboarding', status: 'pending', isRequired: true }
  ]);
  mocks.journey.mockResolvedValue({ prehireCompletedAt: '2026-10-06' });
  mocks.extras.mockResolvedValue({ jdAcknowledged: true, prehireDocs: [] });
  mocks.background.mockResolvedValue({ signed: true });
  mocks.execute.mockImplementation(async sql => sql.includes('FROM hire_portal_submissions')
    ? [[...['profile', 'headshot'].map(step_key => ({ phase: 'pre_hire', step_key, completed_at: completed.includes(step_key) ? '2026-10-06' : null }))]]
    : sql.includes('config_json FROM') ? [[{ config_json: { workflow: { resources: [] } } }]] : [[]]);
});
describe('staff progress uses the applicant required checklist', () => {
  it('reports five of five, excluding duplicate background tasks, optional items and future onboarding', async () => {
    expect(await candidatePrehireProgress(1, 2)).toEqual({ total: 5, completed: 5, percent: 100, allDone: true });
    expect(mocks.background).toHaveBeenCalledWith(1, 2);
    expect(mocks.extras).toHaveBeenCalledWith({ userId: 1, agencyId: 2, hiringProfile: undefined });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('encrypted_value'))).toBe(false);
  });
  it('does not assume 100 percent from PREHIRE_REVIEW when a required item is unfinished', async () => {
    completed = ['profile'];
    expect(await candidatePrehireProgress(1, 2)).toMatchObject({ total: 5, completed: 4, percent: 80, allDone: false });
  });
  it('includes extra required documents in the same denominator', async () => {
    mocks.extras.mockResolvedValue({ jdAcknowledged: true, prehireDocs: [{ id: 'additional', title: 'Additional form', kind: 'signature', signed: false }] });
    expect(await candidatePrehireProgress(1, 2)).toMatchObject({ total: 6, completed: 5, percent: 83, allDone: false });
  });
});
