import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), read: vi.fn(), enforce: true }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m } }));
vi.mock('../staffCareEligibility.service.js', () => ({ staffCareEligibility: () => ({ canProvideCare: true }), readStaffCareEligibility: async () => ({ canProvideCare: true }) }));
vi.mock('../transitionWeek.service.js', () => ({ readTransitionWeek: m.read }));
import { saveClientSessionBookingRollout } from '../clientSessionBookingRollout.service.js';
const input = { providerUserIds: [1], enabled: true, transitionReviewed: true, revision: 0, note: 'Reviewed frozen group' };
beforeEach(() => {
  vi.clearAllMocks(); m.enforce = true;
  m.read.mockResolvedValue({ state: { ranking: { rows: [{ providerId: 1, cohort: 1 }, { providerId: 6, cohort: 2 }] }, cohorts: {} } });
  m.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT feature_flags')) return [[{ feature_flags: { clientSessionBookingRollout: { revision: 0, entries: [] }, transitionWeek: { enforceCohorts: m.enforce } } }]];
    if (sql.startsWith('SELECT id,slug')) return [[{ id: 2, slug: 'itsco', feature_flags: {} }]];
    if (sql.includes('FROM users u')) return [[{ id: 1, first_name: 'Example' }, { id: 6, first_name: 'Other example' }]];
    return [{ affectedRows: 1 }];
  });
});
const save = patch => saveClientSessionBookingRollout({ agencyId: 2, actorUserId: 99, input: { ...input, ...patch } });
it('does not alter the legacy booking path until the explicit freeze enables enforcement', async () => {
  m.enforce = false; await save(); expect(m.read).not.toHaveBeenCalled(); expect(m.commit).toHaveBeenCalledOnce();
});
it('blocks actual booking activation when frozen cohort readiness is incomplete', async () => {
  await expect(save()).rejects.toThrow('readiness'); expect(m.commit).not.toHaveBeenCalled(); expect(m.rollback).toHaveBeenCalledOnce();
});
it('allows reviewed first-cohort activation and keeps scoped enforcement out of NLU', async () => {
  m.read.mockResolvedValue({ state: { ranking: { rows: [{ providerId: 1, cohort: 1 }] }, cohorts: { 1: { clinical_ready: { evidence: 'Verified' } } } } });
  await save(); expect(m.commit).toHaveBeenCalledOnce();
  m.read.mockClear(); await saveClientSessionBookingRollout({ agencyId: 6, actorUserId: 99, input }); expect(m.read).not.toHaveBeenCalled();
});
it('blocks attempts to enable providers from two cohorts in one existing booking request', async () => {
  await expect(save({ providerUserIds: [1,6] })).rejects.toThrow('one frozen group'); expect(m.commit).not.toHaveBeenCalled();
});
it('blocks a ready later group without the preceding monitored workday', async () => {
  m.read.mockResolvedValue({ state: { ranking: { rows: [{ providerId: 6, cohort: 2 }] }, cohorts: { 2: { clinical_ready: { evidence: 'Ready' } } } } });
  await expect(save({ providerUserIds: [6] })).rejects.toThrow('previous monitored workday');
});
it('keeps pausing available without completing a cohort', async () => {
  await save({ enabled: false, transitionReviewed: false }); expect(m.read).not.toHaveBeenCalled(); expect(m.commit).toHaveBeenCalledOnce();
});
