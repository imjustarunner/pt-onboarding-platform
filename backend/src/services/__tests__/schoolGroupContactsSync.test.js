import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: {
  findByEmail: vi.fn(), getAgencyMembership: vi.fn(), assignToAgency: vi.fn(), create: vi.fn()
} }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: {
  isConfigured: () => true, listGroupsForMember: vi.fn(), listGroupMembers: vi.fn()
} }));
vi.mock('../unifiedEmail/schoolEmailInboundSync.service.js', () => ({ syncSchoolEmailInboundForAgency: vi.fn() }));
vi.mock('../unifiedEmail/reconcileSchoolGroupTicketIntake.service.js', () => ({ reconcileSchoolGroupTicketIntakeForAgency: vi.fn() }));

import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import { syncSchoolGroupContactsForAgency } from '../unifiedEmail/schoolGroupContactsSync.service.js';

let account;
const run = (options = {}) => syncSchoolGroupContactsForAgency({
  agencyId: 2, fetchUserNames: false, alsoSyncInboundRoutes: false, ...options
});

beforeEach(() => {
  vi.resetAllMocks();
  account = { status: 'ACTIVE_EMPLOYEE', is_active: 1, is_archived: 0 };
  // The lookup used by sync intentionally has no active/archive flags.
  User.findByEmail.mockResolvedValue({ id: 42, role: 'school_staff', status: 'ACTIVE_EMPLOYEE' });
  User.getAgencyMembership.mockResolvedValue(null);
  Directory.listGroupsForMember.mockResolvedValue([{ email: 'school@itsco.health' }]);
  Directory.listGroupMembers.mockResolvedValue([{ email: 'contact@district.example', type: 'USER', status: 'ACTIVE' }]);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM school_profiles')) return [[{ school_organization_id: 20, school_name: 'School', itsco_email: 'school@itsco.health' }]];
    if (sql.includes('FROM users WHERE id')) return [[account]];
    if (sql.startsWith('INSERT INTO school_contacts')) return [{ affectedRows: 1 }];
    return [[]];
  });
});

it.each([
  { is_archived: 1 }, { is_active: 0 }, { is_archived: '1' },
  { status: 'ARCHIVED' }, { status: 'INACTIVE_EMPLOYEE' }
])('reports a disabled group member without recreating their portal assignment: %j', async state => {
  Object.assign(account, state);
  const result = await run();
  expect(result).toMatchObject({ staffAssigned: 0, staffAlreadyMember: 0, staffSkippedDisabled: 1, errors: [],
    disabledStaff: [{ userId: 42, email: 'contact@district.example', schoolOrganizationId: 20 }] });
  expect(User.assignToAgency).not.toHaveBeenCalled();
  expect(User.create).not.toHaveBeenCalled();
  expect(result.matchedGroups[0].staffSkippedDisabled).toBe(1);
});

it('reports existing disabled accounts even if a group previously reattached their school', async () => {
  account.is_archived = 1;
  User.getAgencyMembership.mockResolvedValue({ is_active: 1 });
  expect(await run()).toMatchObject({ staffSkippedDisabled: 1, staffAlreadyMember: 0 });
});

it('preserves an explicitly inactive school membership for an otherwise enabled account', async () => {
  User.getAgencyMembership.mockResolvedValue({ is_active: 0 });
  expect(await run()).toMatchObject({ staffSkippedDisabled: 1, staffAlreadyMember: 0 });
  expect(User.assignToAgency).not.toHaveBeenCalled();
});

it('does not predict an assignment to a disabled identity during dry run', async () => {
  account.is_archived = 1;
  expect(await run({ dryRun: true })).toMatchObject({ staffSkippedDisabled: 1, staffAssigned: 0 });
  expect(pool.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});

it.each(['ACTIVE_EMPLOYEE', 'PENDING_SETUP'])('continues assigning eligible %s accounts', async status => {
  account.status = status;
  expect(await run()).toMatchObject({ staffAssigned: 1, staffSkippedDisabled: 0, errors: [] });
  expect(User.assignToAgency).toHaveBeenCalledExactlyOnceWith(42, 20);
});

it('stops assignment when the current account state cannot be read', async () => {
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM school_profiles')) return [[{ school_organization_id: 20, itsco_email: 'school@itsco.health' }]];
    if (sql.includes('FROM users WHERE id')) throw new Error('Account storage unavailable');
    return [{ affectedRows: 1 }];
  });
  const result = await run();
  expect(result.errors).toEqual([expect.objectContaining({ message: 'Account storage unavailable' })]);
  expect(User.assignToAgency).not.toHaveBeenCalled();
});
