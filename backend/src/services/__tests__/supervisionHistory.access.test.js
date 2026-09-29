import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ history: vi.fn(), getAgencies: vi.fn(), findUser: vi.fn(), findAgency: vi.fn(), upsert: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: mocks.getAgencies, findById: mocks.findUser, canBeAssignedAsSupervisor: () => true } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.findAgency } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { findHistoryBySupervisee: mocks.history, upsertByType: mocks.upsert } }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ resolveTenantRootAgencyId: async (id) => Number(id) }));
import { getSupervisionHistory, createAssignment } from '../../controllers/supervisorAssignment.controller.js';

const response = () => { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgencies.mockResolvedValue([{ id: 2 }]);
  mocks.history.mockResolvedValue([{ supervisor_name: 'Former supervisor' }]);
  mocks.findAgency.mockResolvedValue({ id: 2, organization_type: 'agency' });
});
it('allows an agency admin to see history after a provider loses all memberships, scoped to the actor', async () => {
  const res = response();
  await getSupervisionHistory({ user: { id: 507, role: 'admin' }, params: { superviseeId: '20' }, query: {} }, res, vi.fn());
  expect(mocks.getAgencies).toHaveBeenCalledWith(507);
  expect(mocks.history).toHaveBeenCalledWith(20, { agencyId: null, agencyIds: [2] });
  expect(res.json).toHaveBeenCalledWith([{ supervisor_name: 'Former supervisor' }]);
});
it('rejects other tenants and never gives former supervisors access through history', async () => {
  for (const req of [
    { user: { id: 507, role: 'admin' }, params: { superviseeId: '20' }, query: { agencyId: '6' } },
    { user: { id: 10, role: 'provider', has_supervisor_privileges: 1 }, params: { superviseeId: '20' }, query: {} }
  ]) {
    const res = response();
    await getSupervisionHistory(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  }
  expect(mocks.history).not.toHaveBeenCalled();
});
it('supports self and superadmin history without treating it as an assignment', async () => {
  for (const user of [{ id: 20, role: 'provider' }, { id: 1, role: 'super_admin' }]) {
    await getSupervisionHistory({ user, params: { superviseeId: '20' }, query: { agencyId: '2' } }, response(), vi.fn());
    expect(mocks.history).toHaveBeenLastCalledWith(20, { agencyId: 2, agencyIds: null });
  }
});
it('rejects malformed history identifiers', async () => {
  const res = response();
  await getSupervisionHistory({ user: { id: 1, role: 'admin' }, params: { superviseeId: 'bad' }, query: {} }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mocks.history).not.toHaveBeenCalled();
});
it('prevents assigning either an inactive supervisor or an inactive supervisee', async () => {
  for (const inactiveId of [10, 20]) {
    mocks.findUser.mockImplementation(async id => ({ id, role: 'provider', status: id === inactiveId ? 'INACTIVE_EMPLOYEE' : 'ACTIVE_EMPLOYEE' }));
    const res = response();
    await createAssignment({ user: { id: 1, role: 'admin' }, body: { supervisorId: 10, superviseeId: 20, agencyId: 2, supervisorType: 'manager' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toMatch(/Inactive/);
  }
  expect(mocks.upsert).not.toHaveBeenCalled();
});
