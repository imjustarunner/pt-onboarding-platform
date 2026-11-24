vi.mock('../providerServiceOfferings.service.js', () => ({requireAssignmentService:vi.fn()}));
vi.mock('../clientServiceCatalog.service.js', () => ({ clientServiceKindsForAgency: vi.fn().mockResolvedValue(['counseling','tutoring']) }));
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: {} }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ requireClinicalScope: vi.fn() }));
import pool from '../../config/database.js';
import { assertAssignableProvider, bookingDefaultsForChartAgency, clientAgencyIds, syncPrimaryClientBookingDefaults } from '../clientAssignmentScope.service.js';
import { saveClientService } from '../clientServiceEnrollment.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM clients c') && sql.includes('FOR UPDATE')) return [[{ id: 4, agency_id: 2, status: 'ACTIVE', client_status_key: 'current' }]];
    if (sql.includes('SELECT agency_id FROM clients')) return [[{ agency_id: 2 }]];
    if (sql.includes('SELECT agency_id FROM client_agency_assignments')) return [[{ agency_id: 6 }], []];
    if (sql.includes('SELECT c.id FROM clients')) return [[{ id: 4 }]];
    if (sql.includes('SELECT u.id FROM users')) return [[{ id: 20 }]];
    if (sql.startsWith('SELECT id,service_kind,label,organization_id FROM client_service_enrollments')) return [[{ id: 11 }]];
    if (sql.includes('FROM client_service_enrollments e JOIN clients')) return [[{ id: 11, provider_user_id: 20 }]];
    return [{ affectedRows: 1 }];
  });
});

it('includes the chart agency and active agency affiliations in provider scope', async () => {
  expect(await clientAgencyIds(4)).toEqual([2, 6]);
  await assertAssignableProvider({ clientId: 4, providerUserId: 20 });
  const [sql, values] = pool.execute.mock.calls.find(([sql]) => sql.includes('SELECT u.id FROM users'));
  expect(values).toEqual([20, 2, 6]);
  expect(sql).toContain('COALESCE(ua.is_active, 1) = 1');
  expect(sql).toContain('COALESCE(u.has_provider_access, 0) = 1');
  expect(sql).toContain('availabilityByAgency');
  expect(sql).toContain('care.agency_id=ua.agency_id AND care.is_active=1');
  expect(sql).toContain("IN ('admin','super_admin') AND u.sees_clients=1");
});

it('rejects a service provider at an agency unrelated to the client', async () => {
  await expect(assertAssignableProvider({ clientId: 4, providerUserId: 20, agencyId: 99 }))
    .rejects.toMatchObject({ status: 400 });
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('SELECT u.id FROM users'))).toBe(false);
});

it('rejects inactive, unrelated or administrative-only provider candidates', async () => {
  const original = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async sql => sql.includes('SELECT u.id FROM users') ? [[]] : original(sql));
  await expect(assertAssignableProvider({ clientId: 4, providerUserId: 20 })).rejects.toMatchObject({ status: 400 });
});

it('syncs a changed default office to the chart agency without overwriting other defaults', async () => {
  await syncPrimaryClientBookingDefaults(4, { default_office_location_id: 77 });
  const [sql, values] = pool.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO client_agency_assignments'));
  expect(values).toEqual([4, 2, 77]);
  expect(sql).toContain('default_office_location_id = VALUES(default_office_location_id)');
  expect(sql).not.toContain('default_place_of_service');
});

it('assigns a provider to a specific existing enrollment instead of creating another counseling service', async () => {
  await saveClientService({ clientId: 4, agencyId: 6, userId: 9, input: {
    serviceId: 11, serviceKind: 'counseling', providerUserId: 20, organizationId: 0, label: 'Counseling'
  } });
  const changes = pool.execute.mock.calls.filter(([sql]) => /^(INSERT|UPDATE)/.test(sql));
  expect(changes).toHaveLength(1);
  expect(changes[0][0]).toContain('UPDATE client_service_enrollments');
  expect(changes[0][1]).toEqual(['counseling', 20, 0, 'Counseling', 9, 11, 4, 6]);
});

it('will not update another client or agency’s service enrollment', async () => {
  const original = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async sql => sql.startsWith('SELECT id,service_kind,label,organization_id FROM client_service_enrollments') ? [[]] : original(sql));
  await expect(saveClientService({ clientId: 4, agencyId: 6, userId: 9, input: {
    serviceId: 99, serviceKind: 'counseling', providerUserId: 20
  } })).rejects.toMatchObject({ status: 404 });
  expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});

it('keeps both existing records when a reassignment conflicts with an existing matching enrollment', async () => {
  const original = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async sql => {
    if (sql.startsWith('UPDATE client_service_enrollments')) throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
    return original(sql);
  });
  await expect(saveClientService({ clientId: 4, agencyId: 6, userId: 9, input: {
    serviceId: 11, serviceKind: 'counseling', providerUserId: 20
  } })).rejects.toMatchObject({ status: 409 });
  expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
});

it('uses the target agency’s saved office when switching chart agencies', async () => {
  pool.execute.mockResolvedValue([[{ default_office_location_id: 88, default_place_of_service: '11', default_service_location_id: 101 }]]);
  expect(await bookingDefaultsForChartAgency({ clientId: 4, agencyId: 6,
    previousClient: { agency_id: 2, default_office_location_id: 77 } }))
    .toEqual({ default_office_location_id: 88, default_place_of_service: '11', default_service_location_id: 101 });
});

it('clears the previous agency’s office when the target agency has no defaults', async () => {
  pool.execute.mockResolvedValue([[{ default_office_location_id: null, default_place_of_service: null, default_service_location_id: null }]]);
  expect(await bookingDefaultsForChartAgency({ clientId: 4, agencyId: 6,
    previousClient: { agency_id: 2, default_office_location_id: 77, default_place_of_service: '11', default_service_location_id: 100 } }))
    .toEqual({ default_office_location_id: null, default_place_of_service: null, default_service_location_id: null });
});

it('preserves legacy defaults for the same chart agency but honors an explicit clearing', async () => {
  pool.execute.mockResolvedValue([[{ default_office_location_id: null, default_place_of_service: null, default_service_location_id: null }]]);
  const context = { clientId: 4, agencyId: 2, previousClient: { agency_id: 2, default_office_location_id: 77 } };
  expect(await bookingDefaultsForChartAgency(context)).toMatchObject({ default_office_location_id: 77 });
  expect(await bookingDefaultsForChartAgency({ ...context, explicitDefaults: { default_office_location_id: null } }))
    .toMatchObject({ default_office_location_id: null });
});

it('refuses a tutoring-only provider on a clinical service before writing the assignment',async()=>{
 const {requireAssignmentService}=await import('../providerServiceOfferings.service.js');
 requireAssignmentService.mockRejectedValueOnce(Object.assign(new Error('Choose a provider who offers this service'),{status:409}));
 await expect(saveClientService({clientId:4,agencyId:6,userId:1,input:{serviceKind:'counseling',serviceId:11,providerUserId:20}},pool)).rejects.toMatchObject({status:409});
 expect(requireAssignmentService).toHaveBeenCalledWith(6,20,'counseling',pool);
 expect(pool.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE)/.test(sql))).toBe(false);
});
