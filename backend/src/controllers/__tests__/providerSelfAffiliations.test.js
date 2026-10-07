import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), findById: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.findById } }));
vi.mock('../../services/schoolPortalDaySync.service.js', () => ({ syncSchoolPortalDayProvider: vi.fn() }));
vi.mock('../../services/d11Compliance.service.js', () => ({ enqueueD11ComplianceEnsure: vi.fn() }));

import { getProviderSchoolAssignments, listProviderAffiliations } from '../providerSelfAffiliations.controller.js';

const school = { id: 42, name: 'Russell', slug: 'russell', organization_type: 'school' };
const req = { user: { id: 1, role: 'admin' }, query: { providerUserId: '7' }, params: { schoolId: '42' } };
const response = () => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('provider school affiliation visibility', () => {
  let memberships;
  let assignments;

  beforeEach(() => {
    vi.clearAllMocks();
    memberships = [];
    assignments = [{ ...school, is_active: false }];
    mocks.findById.mockResolvedValue({ id: 7, role: 'provider' });
    mocks.execute.mockImplementation(async (sql, params) => {
      expect(params).toEqual([7]);
      if (sql.includes('JOIN user_agencies')) return [memberships];
      if (sql.includes('FROM provider_school_assignments psa')) {
        return [assignments.filter((row) => !sql.includes('psa.is_active = TRUE') || row.is_active)];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('keeps a removed school out of the profile on repeated reloads despite retained inactive days', async () => {
    for (let reload = 0; reload < 2; reload += 1) {
      const res = response();
      const next = vi.fn();
      await listProviderAffiliations(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ providerUserId: 7, affiliations: [] });
    }
  });

  it('retains explicitly assigned schools even when all days are inactive', async () => {
    memberships = [school];
    const res = response();
    await listProviderAffiliations(req, res, vi.fn());
    expect(res.json.mock.calls[0][0].affiliations).toEqual([expect.objectContaining(school)]);
  });

  it('preserves legacy schools with active days but missing membership', async () => {
    assignments[0].is_active = true;
    const res = response();
    await listProviderAffiliations(req, res, vi.fn());
    expect(res.json.mock.calls[0][0].affiliations).toEqual([expect.objectContaining(school)]);
  });

  it('does not grant assignment access through a removed school’s inactive days', async () => {
    const res = response();
    const next = vi.fn();
    await getProviderSchoolAssignments(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
