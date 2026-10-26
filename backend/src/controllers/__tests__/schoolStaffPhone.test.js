import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn().mockResolvedValue() }));
vi.mock('../../services/schoolGroupProvisioning.service.js', () => ({ queueSchoolStaffGoogleGroupSync: vi.fn() }));
vi.mock('../../services/schoolGroupSubscription.service.js', async importOriginal => ({
  ...await importOriginal(),
  applySchoolGroupSubscription: vi.fn().mockResolvedValue(),
  resolveGroupEmailForSchool: vi.fn().mockResolvedValue(null),
  readSchoolGroupSubscriptions: vi.fn().mockResolvedValue(new Map())
}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Agency from '../../models/Agency.model.js';
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import AgencySchool from '../../models/AgencySchool.model.js';
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import { addSchoolStaff, updateSchoolStaff, listSchoolStaff } from '../schoolPortal.controller.js';

let req, res, next, user;
beforeEach(() => {
  vi.clearAllMocks();
  user = { id: 42, role: 'school_staff', first_name: 'School', last_name: 'Contact', email: 'contact@school.example', phone_number: '303-555-0123', is_active: 0 };
  req = { params: { organizationId: '20', userId: '42' }, user: { id: 3, role: 'super_admin' }, body: {}, query: {} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  pool.execute.mockResolvedValue([[]]);
  pool.getConnection.mockResolvedValue({ beginTransaction: vi.fn(), execute: vi.fn().mockResolvedValue([[]]), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() });
  vi.spyOn(User, 'findById').mockImplementation(async () => user);
  vi.spyOn(User, 'findByEmail').mockImplementation(async () => user);
  vi.spyOn(User, 'getAgencyMembership').mockResolvedValue({ agency_id: 20 });
  vi.spyOn(User, 'getAgencies').mockResolvedValue([{ id: 20 }]);
  vi.spyOn(User, 'assignToAgency').mockResolvedValue();
  vi.spyOn(User, 'updateStatus').mockResolvedValue();
  vi.spyOn(User, 'generatePasswordlessToken').mockResolvedValue({ token: 'test-token', expiresAt: '2026-11-01' });
  vi.spyOn(User, 'update').mockImplementation(async (_id, updates) => {
    if (updates.phoneNumber !== undefined) user.phone_number = updates.phoneNumber;
  });
  vi.spyOn(ClientSchoolStaffRoiAccess, 'revokeForSchoolStaff').mockResolvedValue();
  vi.spyOn(Agency, 'findById').mockResolvedValue({ id: 20, organization_type: 'school', phone_number: '303-555-0100' });
  vi.spyOn(OrganizationAffiliation, 'getActiveAgencyIdForOrganization').mockResolvedValue(null);
  vi.spyOn(AgencySchool, 'getActiveAgencyIdForSchool').mockResolvedValue(null);
  // Do not run the add endpoint's background email task in a phone persistence test.
  vi.stubGlobal('setImmediate', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it.each([' 303-555-0111 ', '', null])('saves or clears an existing override (%s)', async input => {
  req.body.phoneNumber = input;
  await updateSchoolStaff(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(User.update).toHaveBeenCalledWith(42, { phoneNumber: input?.trim() || null });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
});

it('does not erase an override when an older client omits the field', async () => {
  await updateSchoolStaff(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(User.update).not.toHaveBeenCalled();
  expect(user.phone_number).toBe('303-555-0123');
});

it('persists an override when adding an existing staff account to a school', async () => {
  req.body = { email: user.email, phoneNumber: '303-555-0111', isSchoolAdmin: true };
  await addSchoolStaff(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(User.update).toHaveBeenCalledWith(42, { phoneNumber: '303-555-0111' });
  expect(res.status).toHaveBeenCalledWith(201);
});

it.each(['1'.repeat(21), { phone: 'invalid' }])('rejects invalid phone values before any write', async input => {
  req.body.phoneNumber = input;
  await updateSchoolStaff(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, statusCode: 400 }));
  expect(User.update).not.toHaveBeenCalled();
});

it('returns the override, school default, for the staff screen', async () => {
  pool.execute.mockImplementation(async sql => [sql.includes('JOIN users u') ? [user] : []]);
  req.query.includeContext = 'true';
  await listSchoolStaff(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    schoolPhoneNumber: '303-555-0100',
    staff: [expect.objectContaining({ phone_number: '303-555-0123', effective_phone_number: '303-555-0123' })]
  }));
});

it('returns the school number without copying it into the staff override', async () => {
  user.phone_number = null;
  pool.execute.mockImplementation(async sql => [sql.includes('JOIN users u') ? [user] : []]);
  await listSchoolStaff(req, res, next);
  expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ phone_number: null, effective_phone_number: '303-555-0100' })]);
});
