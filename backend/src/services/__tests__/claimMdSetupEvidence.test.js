import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../resolveClaimProviders.service.js', () => ({ getProviderClaimBillingMode: vi.fn() }));
import { billingSetupEvidence, buildBillingSetupEvidence } from '../billingSetupEvidence.service.js';
import { providerBillingNpi } from '../providerBillingNpi.service.js';

const sample = () => ({ providers: [{ id: 12 }, { id: 30 }], policy: { entries: [] },
  reports: [{ provider_user_id: 12, payer_name: 'CCHA', line_count: 3, paid_line_count: 2, first_service_date: '2026-01-01', last_service_date: '2026-09-30', patient_name: 'Must not escape' }],
  credentials: [{ user_id: 30, definition_id: 4, payer_name: 'CCHA', effective_date: '2026-03-01', password: 'Must not escape' }],
  groups: [{ definition_id: 4, group_id: 8, npi_number: '1234567890', office_location_id: 9, effective_date: '2026-04-01' }],
  modes: new Map([[12, { mode: 'billing_supervisor', billingSupervisorUserId: 30 }]]), lastImportAt: '2026-10-13' });

describe('billing setup reuses existing data', () => {
  it('combines history with inherited credentialing while keeping verified routing unset', () => {
    const result = buildBillingSetupEvidence(sample());
    const pair = result.pairs[0];
    expect(pair).toMatchObject({ providerUserId: 12, payerName: 'CCHA', payerId: null, reportLines: 3, paidReportLines: 2, requiresSupervision: true, supervisorUserId: 30 });
    expect(pair.credentials[0]).toMatchObject({ inherited: true, effectiveDate: '2026-03-01' });
    expect(pair.billingGroups[0]).toMatchObject({ npi: '1234567890', officeId: 9 });
    expect(JSON.stringify(result)).not.toMatch(/Must not escape|routingVerified|cutoverReviewed|claim_lifecycle/);
  });
  it('does not infer payer aliases, electronic IDs, or credentialing for unassigned providers', () => {
    const data = sample(); data.credentials.push({ user_id: 999, definition_id: 6, payer_name: 'Foreign' });
    data.reports.push({ provider_user_id: 999, payer_name: 'Foreign', line_count: 1 });
    data.reports.push({ provider_user_id: 12, payer_name: 'Colorado Access', line_count: 1 });
    data.policy.entries = [{ providerUserId: 30, payerName: 'CCHA', payerId: 'EXAMPLE' }];
    const pairs = buildBillingSetupEvidence(data).pairs;
    expect(pairs.some(p => p.payerName === 'Foreign')).toBe(false);
    expect(pairs.find(p => p.providerUserId === 12 && p.payerName === 'CCHA').payerId).toBeNull();
    expect(pairs.find(p => p.payerName === 'Colorado Access').credentials).toEqual([]);
  });
  it('reuses only the exact saved provider–payer mapping and keeps report dates separate from cutover', () => {
    const data = sample(); data.policy.entries = [{ providerUserId: 12, payerName: ' ccha ', payerId: 'EXAMPLE' }];
    const pair = buildBillingSetupEvidence(data).pairs[0];
    expect(pair.payerId).toBe('EXAMPLE'); expect(pair.startDate).toBeUndefined();
  });
  it('scopes every database read to the billing practice and selects no patient or portal credentials', async () => {
    const execute = vi.fn(async () => [[]]);
    await billingSetupEvidence(377, [], { entries: [] }, { db: { execute } });
    expect(execute).toHaveBeenCalledTimes(7);
    for (const [sql, args] of execute.mock.calls) {
      expect(args.every(id => id === 377)).toBe(true);
      expect(sql).toContain('agency_id = ?');
      expect(sql).not.toMatch(/SELECT \*|patient_name|member_id|ciphertext|password|diagnosis/);
    }
  });
  it('reuses payroll provider/service history without treating it as payer coverage or generating claims', () => {
    const data = sample(); data.payroll = [{ provider_user_id: 12, service_code: 'H0002', last_service_date: '2026-10-09' },
      { provider_user_id: 12, service_code: 'H0002', last_service_date: '2026-10-01' }, { provider_user_id: 999, service_code: '90834' }];
    const result = buildBillingSetupEvidence(data);
    expect(result.providerActivity).toEqual([{ providerUserId: 12, serviceCodes: ['H0002'], lastServiceDate: '2026-10-09' }]);
    expect(result.pairs[0].payerId).toBeNull();
  });
  it('uses existing catalog aliases and explicit credentialing links without inventing enrollment approval', () => {
    const data = sample();
    data.catalog = [{ payer_name: 'Colorado Community Health Alliance', claimmd_payer_id: 'COCHA', source_names_json: '["CCHA"]' }];
    data.links = [{ insurance_definition_id: 4, payer_id: 'COCHA' }];
    expect(buildBillingSetupEvidence(data).pairs[0]).toMatchObject({ payerId: 'COCHA', payerMappingConflict: false });
    data.policy.entries = [{ providerUserId: 12, payerName: 'CCHA', payerId: 'OTHER' }];
    expect(buildBillingSetupEvidence(data).pairs[0]).toMatchObject({ payerId: null, payerMappingConflict: true });
  });
});

describe('claim NPI from credentialing', () => {
  it('uses the agency credentialing NPI ahead of global fields and an old core value', async () => {
    const execute = vi.fn(async () => [[
      { field_key: 'provider_identity_npi_number', agency_id: null, value: '1111111111' },
      { field_key: 'provider_identity_npi_number', agency_id: 377, value: '2222222222' }
    ]]);
    expect(await providerBillingNpi({ agencyId: 377, userId: 12, coreNpi: '3333333333' }, { execute })).toBe('2222222222');
    expect(execute.mock.calls[0][1]).toEqual([377, 12, 377]);
  });
  it('falls back to core NPI only when credentialing is empty', async () => {
    expect(await providerBillingNpi({ agencyId: 377, userId: 12, coreNpi: '3333333333' }, { execute: async () => [[]] })).toBe('3333333333');
  });
  it('rejects equally preferred conflicting NPI records', async () => {
    await expect(providerBillingNpi({ agencyId: 377, userId: 12 }, { execute: async () => [[
      { field_key: 'npi', agency_id: 377, value: '1111111111' },
      { field_key: 'npi', agency_id: 377, value: '2222222222' }
    ]] })).rejects.toThrow('Conflicting');
  });
});
