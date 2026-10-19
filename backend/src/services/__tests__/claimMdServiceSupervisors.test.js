import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), audit: vi.fn(), clinical: vi.fn(), access: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: async () => mocks }, onTableWrite: vi.fn() }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: mocks.access } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.clinical } }));
vi.mock('../familyBillingPolicy.service.js', () => ({ auditBilling: mocks.audit }));
vi.mock('../resolveClaimProviders.service.js', () => ({ getProviderClaimBillingMode: async () => ({ mode: 'self' }) }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { findBySupervisee: async () => [{ supervisor_id: 506, supervisor_type: 'clinical', is_primary: 1 }] } }));
import { getServiceBillingSupervisors, putServiceBillingSupervisor } from '../../controllers/serviceBillingSupervisor.controller.js';
import { normalizeServiceSupervisor, selectServiceSupervisor, resolveServiceSupervisor, saveServiceSupervisor } from '../serviceBillingSupervisor.service.js';
import { resolveDocumentationPolicy, resolveNoteDocumentationPolicy, evaluateSupervisedBilling } from '../supervisedBillingPolicy.service.js';

const entry = { providerUserId: 8, supervisorUserId: 501, serviceCode: 'H0002', effectiveFrom: '2026-10-14', effectiveThrough: null };
const policy = { revision: 1, entries: [entry] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT feature_flags')) return [[{ feature_flags: { serviceBillingSupervisors: policy, keepOtherFeature: true } }]];
    if (sql.includes('SELECT u.id,u.first_name')) return [[{ id: 501, first_name: 'Billing', last_name: 'Supervisor', credential: 'LPC' }]];
    if (sql.includes('SELECT user_id FROM user_agencies')) return [[{ user_id: 8 }]];
    if (sql.includes('clinical_supervision_policies')) return [[]];
    return [{ affectedRows: 1 }];
  });
  mocks.clinical.mockResolvedValue([[{ provider_user_id: 8, service_code: 'H0002', scheduled_start_at: '2026-10-14 15:00:00', metadata_json: { serviceDate: '2026-10-14' } }]]);
});

describe('service billing supervisors', () => {
  it('uses actual service dates, including both boundaries, without changing other providers or services', () => {
    const bounded = { ...policy, entries: [{ ...entry, effectiveThrough: '2026-10-19' }] };
    for (const dateOfService of ['2026-10-14', '2026-10-19']) expect(selectServiceSupervisor(bounded, { ...entry, dateOfService }).supervisorUserId).toBe(501);
    for (const change of [{ dateOfService: '2026-10-13' }, { dateOfService: '2026-10-20' }, { dateOfService: null }, { dateOfService: '2026-02-30' }, { serviceCode: '90834' }, { providerUserId: 9 }])
      expect(selectServiceSupervisor(bounded, { ...entry, dateOfService: '2026-10-14', ...change })).toBeNull();
  });
  it('rejects self-supervision, invalid dates and overlapping configuration', () => {
    expect(() => normalizeServiceSupervisor({ ...entry, supervisorUserId: 8 }, 8)).toThrow();
    expect(() => normalizeServiceSupervisor({ ...entry, effectiveFrom: '2026-02-30' }, 8)).toThrow();
    expect(() => selectServiceSupervisor({ ...policy, entries: [entry, entry] }, { ...entry, dateOfService: '2026-10-14' })).toThrow(/Overlapping/);
  });
  it('routes H0002 to the billing cosigner while retaining the primary clinical supervisor', async () => {
    const resolved = await resolveDocumentationPolicy(2, 8, undefined, { serviceCode: 'H0002', dateOfService: '2026-10-14' });
    expect(resolved).toMatchObject({ supervisorUserId: 501, clinicalSupervisorIds: [506], billingMode: 'billing_supervisor', cosignTiming: 'before_submission' });
    expect(await resolveDocumentationPolicy(2, 8, undefined, { serviceCode: '90834', dateOfService: '2026-10-14' })).toMatchObject({ supervisorUserId: 506, billingMode: 'self' });
    expect(await resolveDocumentationPolicy(2, 8)).toMatchObject({ supervisorUserId: 506, billingMode: 'self' });
  });
  it('uses the linked service, ignoring note creation time and caller-supplied metadata', async () => {
    const note = { agency_id: 2, client_id: 10, clinical_session_id: 11, created_by_user_id: 8, created_at: '2027-01-01', metadata_json: { serviceCode: '90834' } };
    expect(await resolveNoteDocumentationPolicy(note)).toMatchObject({ supervisorUserId: 501 });
    expect(mocks.clinical.mock.calls[0][1]).toEqual([11, 2, 10]);
    mocks.clinical.mockResolvedValue([[{ provider_user_id: 9, service_code: 'H0002' }]]);
    await expect(resolveNoteDocumentationPolicy(note)).rejects.toThrow(/match/);
  });
  it('uses the service timezone at the October 14 boundary', async () => {
    mocks.clinical.mockResolvedValue([[{ provider_user_id: 8, service_code: 'H0002', scheduled_start_at: '2026-10-14 02:00:00', source_timezone: 'America/Denver', metadata_json: {} }]]);
    expect(await resolveNoteDocumentationPolicy({ agency_id: 2, client_id: 10, clinical_session_id: 11, created_by_user_id: 8 })).toMatchObject({ supervisorUserId: 506 });
  });
  it('rejects non-admin changes and cross-agency access', async () => {
    const next = vi.fn();
    const req = { user: { id: 8, role: 'provider' }, body: { agencyId: 2, providerUserId: 8 }, query: {} };
    await putServiceBillingSupervisor(req, { json: vi.fn() }, next);
    expect(next.mock.calls[0][0].status).toBe(403); expect(mocks.commit).not.toHaveBeenCalled();
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('No agency access'), { status: 403 }));
    next.mockClear();
    await getServiceBillingSupervisors({ ...req, user: { id: 501, role: 'admin' } }, { json: vi.fn() }, next);
    expect(next.mock.calls[0][0].status).toBe(403);
  });
  it('fails closed for a supervisor who is no longer active or licensed in the agency', async () => {
    mocks.execute.mockImplementation(async sql => sql.startsWith('SELECT feature_flags') ? [[{ feature_flags: { serviceBillingSupervisors: policy } }]] : [[]]);
    await expect(resolveServiceSupervisor({ ...entry, agencyId: 2, dateOfService: '2026-10-14' })).rejects.toThrow(/no longer/);
  });
  it('keeps unsigned and unverified payer workflows blocked', async () => {
    const resolved = await resolveDocumentationPolicy(2, 8, undefined, { serviceCode: 'H0002', dateOfService: '2026-10-14' });
    const result = evaluateSupervisedBilling({ policy: resolved, payerPolicy: null, dateOfService: '2026-10-14', serviceProvider: {}, supervisor: { id: 501 }, note: {} });
    expect(result.blockers).toContain('Provider signature is required');
    expect(result.blockers).toContain('Supervisor cosign is required before submission');
    expect(result.blockers).toContain('Verify the payer/product provider mapping for this date of service');
    expect(result.serviceSupervisorRevision).toBe(1);
  });
  it('saves dated defaults under a lock, preserves other flags and audits the actor', async () => {
    const next = await saveServiceSupervisor({ agencyId: 2, providerUserId: 8, actorUserId: 501, input: { ...entry, serviceCode: 'H0001', revision: 1, reason: 'Reviewed service oversight' } });
    expect(next.revision).toBe(2); expect(next.entries).toHaveLength(2);
    expect(next.entries[1]).toMatchObject({ changedByUserId: 501, reason: 'Reviewed service oversight' });
    expect(mocks.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))[0]).toContain('JSON_SET');
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: 501, agencyId: 2, objectId: 8 }), mocks);
    expect(mocks.commit).toHaveBeenCalledOnce();
  });
  it.each([{ revision: 0 }, { revision: 1 }])('rejects stale or overlapping changes without committing: %o', async change => {
    await expect(saveServiceSupervisor({ agencyId: 2, providerUserId: 8, actorUserId: 501, input: { ...entry, reason: 'Reviewed oversight', ...change } })).rejects.toThrow();
    expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.commit).not.toHaveBeenCalled();
  });
});
