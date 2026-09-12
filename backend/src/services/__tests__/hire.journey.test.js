import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../portalTraining.service.js', () => ({ portalModuleForms: vi.fn(async () => ({ fields: [] })) }));
import { taskPhase, taskProgress, creditedActivitySeconds, recordOnboardingActivity, completeOnboarding, requireOnboardingSubmitted } from '../hireJourney.service.js';

const db = { execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); mocks.getConnection.mockResolvedValue(db); });
describe('process separation', () => {
  it('keeps contracts in prehire after promotion', () => expect(taskPhase({ metadata: '{"contractGeneration":true}' }, 'ONBOARDING')).toBe('pre_hire'));
  it('uses explicit package provenance before user status', () => expect(taskPhase({ metadata: { portalPhase: 'onboarding' } }, 'PREHIRE_REVIEW')).toBe('onboarding'));
  it('does not require optional tasks to close the process', () => expect(taskProgress([{ isRequired: true, status: 'completed' }, { isRequired: false, status: 'pending' }]).allDone).toBe(true));
  it('blocks missing required work', () => expect(taskProgress([{ isRequired: true, status: 'pending' }]).allDone).toBe(false));
  it('blocks activation before onboarding submission', async () => {
    mocks.execute.mockResolvedValue([[]]);
    await expect(requireOnboardingSubmitted(1)).rejects.toThrow('submit their completed onboarding');
  });
});
describe('server activity', () => {
  const base = { lastSeen: '2026-09-11T00:00:00Z', now: '2026-09-11T00:00:15Z', sameSession: true, previousActive: true, active: true };
  it('credits only observed active intervals', () => expect(creditedActivitySeconds(base)).toBe(15));
  it.each([{ active: false }, { previousActive: false }, { sameSession: false }, { now: '2026-09-11T00:03:00Z' }])('ignores idle, tab changes, and long gaps: %j', (change) => expect(creditedActivitySeconds({ ...base, ...change })).toBe(0));
  it('caps one heartbeat interval', () => expect(creditedActivitySeconds({ ...base, now: '2026-09-11T00:00:40Z' })).toBe(30));
  it('rejects forged client duration fields and invalid heartbeats', async () => {
    await expect(recordOnboardingActivity(1, { durationSeconds: 3600 })).rejects.toThrow('Invalid activity');
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it('never credits prehire', async () => {
    mocks.execute.mockResolvedValue([[{ status: 'PREHIRE_OPEN' }]]);
    expect(await recordOnboardingActivity(1, { sessionId: 'abcdefghijklmnop', sequence: 1, active: true })).toEqual({ tracking: false });
    expect(db.commit).not.toHaveBeenCalled();
  });
  it('ignores retried heartbeat sequences', async () => {
    mocks.execute.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT status')) return [[{ status: 'ONBOARDING' }]];
      if (sql.includes('server_now')) return [[{ activity_session: 'abcdefghijklmnop', activity_sequence: 5 }]];
      return [{}];
    });
    expect(await recordOnboardingActivity(1, { sessionId: 'abcdefghijklmnop', sequence: 5, active: true })).toEqual({ tracking: true, creditedSeconds: 0 });
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO hire_onboarding_time'))).toBe(false);
  });
});
describe('payroll submission', () => {
  function completionDb({ completed = false, failClaim = false, pending = false } = {}) {
    mocks.execute.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT status')) return [[{ status: 'ONBOARDING' }]];
      if (sql.includes('SELECT * FROM hire_journeys')) return [[{ agency_id: 8, onboarding_completed_at: completed ? new Date() : null }]];
      if (sql.includes('FROM tasks WHERE')) return [[{ id: 2, task_type: 'document', metadata: { portalPhase: 'onboarding' }, is_required: 1, status: pending ? 'pending' : 'completed' }]];
      if (sql.startsWith('SELECT * FROM hire_onboarding_time')) return [[{ seconds: 1800, work_date: '2026-09-11', payroll_claim_id: null }]];
      if (sql.startsWith('SELECT work_date')) return [[]];
      if (sql.includes('INSERT INTO payroll_time_claims')) { if (failClaim) throw new Error('payroll unavailable'); return [{ insertId: 42 }]; }
      return [{}];
    });
  }
  it('creates a payroll claim with the existing totalMinutes contract', async () => {
    completionDb(); await completeOnboarding(1);
    const call = mocks.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO payroll_time_claims'));
    expect(JSON.parse(call[1][4])).toMatchObject({ totalMinutes: 30, actualSeconds: 1800, source: 'onboarding_portal' });
    expect(db.commit).toHaveBeenCalledTimes(1);
  });
  it('does not create duplicate claims after submission', async () => {
    completionDb({ completed: true }); await completeOnboarding(1);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO payroll_time_claims'))).toBe(false);
  });
  it('rolls back completion when payroll persistence fails', async () => {
    completionDb({ failClaim: true }); await expect(completeOnboarding(1)).rejects.toThrow('payroll unavailable');
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('SET onboarding_completed_at'))).toBe(false);
  });
  it('does not submit incomplete required documents', async () => {
    completionDb({ pending: true }); await expect(completeOnboarding(1)).rejects.toThrow('required onboarding');
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO payroll_time_claims'))).toBe(false);
  });
});
