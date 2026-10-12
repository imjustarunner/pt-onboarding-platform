import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/OfficeLocationAgency.model.js', () => ({ default: { listAgenciesForOffice: vi.fn() } }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import OfficeLocationAgency from '../../models/OfficeLocationAgency.model.js';
import { officeAssignmentOptions, resolveOfficeAssignmentAgency } from '../officeAssignmentOptions.service.js';
const actor = { id: 1, role: 'admin' };
const user = { id: 2, role: 'super_admin', is_active: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  OfficeLocationAgency.listAgenciesForOffice.mockResolvedValue([{ id: 6, name: 'One' }, { id: 8, name: 'Two' }]);
  User.getAgencies.mockResolvedValue([{ id: 6 }]);
  pool.execute.mockResolvedValue([[]]);
});
it('scopes an admin directory to their agencies and includes staff accounts and photos', async () => {
  pool.execute.mockResolvedValue([[{ id: 2, first_name: 'Michael', last_name: 'Mendez', role: 'super_admin', agency_id: 6, profile_photo_path: 'profiles/2.jpg' }]]);
  expect(await officeAssignmentOptions(actor, 4)).toEqual({ agencies: [{ id: 6, name: 'One' }], people: [expect.objectContaining({ id: 2, agencyIds: [6], profile_photo_path: 'profiles/2.jpg' })] });
  const [sql, values] = pool.execute.mock.calls[0];
  expect(sql).toContain('ua.agency_id IN (?)');
  expect(values[0]).toBe(6);
  expect(values).toContain('super_admin');
  expect(sql).toContain('u.is_archived');
});
it('offers all office tenants to superadmins and deduplicates people with several memberships', async () => {
  pool.execute.mockResolvedValue([[{ ...user, agency_id: 6 }, { ...user, agency_id: 8 }]]);
  const options = await officeAssignmentOptions({ ...actor, role: 'super_admin' }, 4);
  expect(options.agencies).toHaveLength(2);
  expect(options.people).toEqual([expect.objectContaining({ id: 2, agencyIds: [6, 8] })]);
});
it('allows an active administrator to hold Assigned Available time under a shared tenant', async () => {
  await expect(resolveOfficeAssignmentAgency({ actor, officeLocationId: 4, user, agencyId: 6 })).resolves.toBe(6);
});
it('rejects tenant spoofing even when the person belongs to that tenant', async () => {
  User.getAgencies.mockImplementation(async id => [{ id: id === actor.id ? 6 : 8 }]);
  await expect(resolveOfficeAssignmentAgency({ actor, officeLocationId: 4, user, agencyId: 8 })).rejects.toMatchObject({ status: 403 });
});
it('requires a choice when several tenants match', async () => {
  User.getAgencies.mockResolvedValue([{ id: 6 }, { id: 8 }]);
  await expect(resolveOfficeAssignmentAgency({ actor, officeLocationId: 4, user })).rejects.toThrow('Select the agency');
});
it.each([{ role: 'guardian', has_provider_access: 1 }, { is_active: 0 }, { is_archived: 1 }, { status: 'TERMINATED' }])('rejects an ineligible assignment target %j', async patch => {
  await expect(resolveOfficeAssignmentAgency({ actor, officeLocationId: 4, user: { ...user, ...patch }, agencyId: 6 })).rejects.toMatchObject({ status: 400 });
});
it('does not expose the directory to a provider without management access', async () => {
  await expect(officeAssignmentOptions({ id: 3, role: 'provider' }, 4)).rejects.toMatchObject({ status: 403 });
  expect(pool.execute).not.toHaveBeenCalled();
});

import { assertOfficeAssignmentPlanningDate } from '../../utils/officeAssignmentPlanning.js';
it('allows future Assigned Available preparation beyond six weeks, within a year', () => {
  const now = new Date('2026-10-11T23:00:00Z');
  expect(() => assertOfficeAssignmentPlanningDate('2027-03-01', 'America/Denver', now)).not.toThrow();
  expect(() => assertOfficeAssignmentPlanningDate('2027-10-11', 'America/Denver', now)).not.toThrow();
  expect(() => assertOfficeAssignmentPlanningDate('2027-10-12', 'America/Denver', now)).toThrow('one year');
  expect(() => assertOfficeAssignmentPlanningDate('2027-02-30', 'America/Denver', now)).toThrow('valid');
});
it('uses the office date at midnight boundaries and clamps leap anniversaries', () => {
  expect(() => assertOfficeAssignmentPlanningDate('2027-10-12', 'America/Denver', new Date('2026-10-12T02:00:00Z'))).toThrow('one year');
  expect(() => assertOfficeAssignmentPlanningDate('2025-02-28', 'America/Denver', new Date('2024-02-29T19:00:00Z'))).not.toThrow();
  expect(() => assertOfficeAssignmentPlanningDate('2025-03-01', 'America/Denver', new Date('2024-02-29T19:00:00Z'))).toThrow('one year');
});

it('permits room reservations for staff without clinical provider access in either shared agency', async () => {
  User.getAgencies.mockResolvedValue([{ id: 6 }, { id: 8 }]);
  const staff = { ...user, role: 'admin', has_provider_access: 0 };
  for (const agencyId of [6, 8]) {
    await expect(resolveOfficeAssignmentAgency({ actor, officeLocationId: 4, user: staff, agencyId })).resolves.toBe(agencyId);
  }
});
