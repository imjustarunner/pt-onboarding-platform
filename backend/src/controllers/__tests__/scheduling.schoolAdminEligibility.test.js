import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 30, organization_type: 'school' })) } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: vi.fn(async () => 2) } }));
vi.mock('../../services/schoolPortalDaySync.service.js', () => ({ syncSchoolPortalDayProvider: vi.fn() }));
vi.mock('../../services/d11Compliance.service.js', () => ({ enqueueD11ComplianceEnsure: vi.fn() }));
import pool from '../../config/database.js';
import { syncSchoolPortalDayProvider } from '../../services/schoolPortalDaySync.service.js';
import { listAddableSchoolProviders, addSchoolProviderWithSchedule } from '../schoolSoftSchedule.controller.js';
import { listProvidersForScheduling } from '../providerScheduling.controller.js';

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = () => ({ params: { schoolId: '30' }, user: { id: 7, role: 'super_admin' }, body: { providerUserId: 7, dayOfWeek: 'Monday', slotsTotal: 4, startTime: '08:00', endTime: '12:00' } });
let person;
beforeEach(() => {
  vi.clearAllMocks();
  person = { id: 7, role: 'super_admin', first_name: 'Example', last_name: 'Clinician', has_provider_access: 0,
    status: 'ACTIVE_EMPLOYEE', is_active: 1, membership_active: 1, sees_clients: 1 };
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT u.role,u.credential')) return [[person]];
    if (sql.includes('SELECT u.id AS provider_user_id')) return [[{ ...person, provider_user_id: 7, already_at_school: 0 }]];
    if (sql.includes('FROM users u') && sql.includes('JOIN user_agencies ua ON')) return [[person]];
    if (sql.startsWith('SELECT 1 FROM user_agencies')) return [[{ allowed: 1 }]];
    if (sql.includes('FROM users WHERE id')) return [[person]];
    if (sql.includes('SELECT * FROM provider_school_assignments')) return [[{ id: 10, provider_user_id: 7 }]];
    if (sql.includes('INSERT INTO provider_school_assignments')) return [{ insertId: 10 }];
    return [[]];
  });
});

it.each(['admin', 'super_admin'])('offers a care-enabled %s without a separate provider-access flag', async role => {
  person.role = role;
  const res = response(), next = vi.fn();
  await listAddableSchoolProviders(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ provider_user_id: 7, already_at_school: false })]);
  const [sql] = pool.execute.mock.calls.find(([sql]) => sql.includes('SELECT u.id AS provider_user_id'));
  expect(sql).toContain("'admin', 'super_admin'"); expect(sql).toContain('COALESCE(ua_agency.is_active, 1) = 1');
});

it.each(['admin', 'super_admin'])('saves a real school assignment for a care-enabled %s', async role => {
  person.role = role;
  const res = response(), next = vi.fn();
  await addSchoolProviderWithSchedule(request(), res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(201);
  expect(syncSchoolPortalDayProvider).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 30, providerUserId: 7, actorUserId: 7, weekday: 'Monday' }));
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO provider_school_assignments'), [7, 30, 'Monday', 4, 4, '08:00:00', '12:00:00']);
});

it.each([{ sees_clients: 0 }, { membership_active: 0 }, { is_active: 0 }, { is_archived: 1 }, { agency_role: 'staff', has_provider_access: 1 }])('keeps administrative access separate from care eligibility: %j', async change => {
  Object.assign(person, change);
  const listed = response(); await listAddableSchoolProviders(request(), listed, vi.fn());
  expect(listed.json).toHaveBeenCalledWith([]);
  const next = vi.fn(); await addSchoolProviderWithSchedule(request(), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, code: 'CARE_PROVIDER_ASSIGNMENT_REQUIRED' }));
  expect(pool.execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
});

it('honors the agency care override and includes the administrator in the active booking picker', async () => {
  person.sees_clients = 0;
  person.public_details_json = { availabilityByAgency: { 2: { seesClients: true }, 6: { seesClients: false } } };
  const listed = response(); await listAddableSchoolProviders(request(), listed, vi.fn());
  expect(listed.json.mock.calls[0][0]).toHaveLength(1);
  const active = response(); await listProvidersForScheduling({ query: { agencyId: 2, activeProvidersOnly: 'true' } }, active, vi.fn());
  expect(active.json).toHaveBeenCalledWith([person]);
  const other = response(); await listProvidersForScheduling({ query: { agencyId: 6, activeProvidersOnly: 'true' } }, other, vi.fn());
  expect(other.json).toHaveBeenCalledWith([]);
});

it('requires parent-agency membership before adding even a superadmin to a school', async () => {
  const base = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async sql => sql.startsWith('SELECT 1 FROM user_agencies') ? [[]] : base(sql));
  const res = response(); await addSchoolProviderWithSchedule(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400); expect(syncSchoolPortalDayProvider).not.toHaveBeenCalled();
});
