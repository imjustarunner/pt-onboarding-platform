import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: m }));
import { retainHirePacket } from '../hirePacketPreparation.service.js';
const db = { execute: m.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
let stored;
beforeEach(() => {
  vi.clearAllMocks(); m.getConnection.mockResolvedValue(db);
  stored = { agency_id: 2, config_json: { onboardingPackageId: 10, workflow: { resources: [{ id: 'orientation', phase: 'onboarding', title: 'Orientation' }], excludedResourceIds: ['old-orientation'] } } };
  m.execute.mockImplementation(async sql => {
    if (sql.includes('FROM users')) return [[{ status: 'PENDING_SETUP' }]];
    if (sql.includes('FROM hire_journeys')) return [[]];
    if (sql.includes('FROM hire_portal_packets')) return [[stored]];
    return [[]];
  });
});
describe('retaining the separate prepared onboarding package', () => {
  it('preserves onboarding choices when sending or updating pre-hire', async () => {
    await retainHirePacket({ userId: 8, agencyId: 2, actorId: 9, packet: { onboardingPackageId: null, documents: [{ id: 'offer' }], workflow: { resources: [{ id: 'welcome', phase: 'pre_hire' }] } } });
    const saved = JSON.parse(m.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO hire_portal_packets'))[1][2]);
    expect(saved).toMatchObject({ onboardingPackageId: 10, documents: [{ id: 'offer' }], workflow: { resources: [{ id: 'welcome', phase: 'pre_hire' }, { id: 'orientation', phase: 'onboarding' }], excludedResourceIds: ['old-orientation'] } });
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it('does not overwrite a package retained under another agency', async () => {
    stored.agency_id = 3;
    await expect(retainHirePacket({ userId: 8, agencyId: 2, packet: { workflow: {} } })).rejects.toMatchObject({ status: 403 });
    expect(db.rollback).toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
});
