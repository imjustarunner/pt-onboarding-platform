import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { resolveClaimBillingSupervisorId: vi.fn(async () => null) } }));
import pool from '../../config/database.js';
import { credentialPayerAcceptance } from '../credentialPayerEligibility.service.js';
import { listProviderAcceptedInsurancesForDisplay } from '../providerAcceptedInsurance.service.js';

const current = { id: 1, insurance_definition_id: 1, name: 'Aetna', effective_date: '2020-01-01',
  billing_payer_id: 'AETNA', billing_payer_name: 'Aetna', credential_status: 'active' };
const asOfDate = '2026-11-04';
let rows, overrides;
beforeEach(() => {
  vi.clearAllMocks();
  rows = [{ ...current }, { ...current, id: 2, insurance_definition_id: 2, name: 'Cigna', billing_payer_name: 'Cigna', billing_payer_id: 'CIGNA', effective_date: null }];
  overrides = [];
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM user_insurance_credentialing uic')) return [rows];
    if (sql.includes('provider_insurance_overrides')) return [overrides];
    if (sql.includes('SELECT credential, title')) return [[{ credential: 'LPC', title: 'Therapist' }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
});
it('recognizes current recorded participation without changing electronic-payer verification rules', () => {
  expect(credentialPayerAcceptance(current, { asOfDate })).toMatchObject({ eligible: true });
  const unlinked = { ...current, billing_payer_id: null, billing_payer_name: null };
  expect(credentialPayerAcceptance(unlinked, { asOfDate })).toMatchObject({ eligible: false, reason: expect.stringContaining('verified electronic billing payer') });
  expect(credentialPayerAcceptance(unlinked, { asOfDate, requireVerifiedPayer: false })).toMatchObject({ eligible: true });
});
it.each([
  [{ effective_date: null }, 'effective date has not been recorded'],
  [{ effective_date: '2026-02-30' }, 'recorded effective date'],
  [{ effective_date: '2099-01-01' }, 'in the future'],
  [{ credential_status: 'inactive' }, 'status is inactive'],
  [{ credential_status: 'pending' }, 'status is pending'],
  [{ revalidation_due: '2020-01-01' }, 'overdue'],
  [{ revalidation_due: '2026-02-30' }, 'recorded revalidation date']
])('keeps an unverified saved row ineligible with a concrete reason: %j', (change, reason) => {
  expect(credentialPayerAcceptance({ ...current, ...change }, { asOfDate }))
    .toMatchObject({ eligible: false, reason: expect.stringContaining(reason) });
});
it('supports mysql Date objects and treats the effective/revalidation day as inclusive', () => {
  expect(credentialPayerAcceptance({ ...current, effective_date: new Date('2026-11-04T00:00:00Z'),
    revalidation_due: new Date('2026-11-04T00:00:00Z') }, { asOfDate })).toMatchObject({ eligible: true });
});
it('separates pending saved credentials from actual insurance exclusions without accepting the pending payer', async () => {
  const result = await listProviderAcceptedInsurancesForDisplay({ userId: 785, agencyId: 2, forMatching: true });
  expect(result.accepted.map(row => row.name)).toEqual(['Aetna']);
  expect(result.excluded).toEqual([]);
  expect(result.reviewRequired).toEqual([expect.objectContaining({ name: 'Cigna', reason: expect.stringContaining('effective date has not been recorded') })]);
  expect(result.known).toBe(true);
});
it('preserves explicit payer exclusions and does not turn an allowed override into a credential', async () => {
  overrides = [{ label: 'Aetna', is_allowed: 0 }, { label: 'Cigna', is_allowed: 1 }];
  const result = await listProviderAcceptedInsurancesForDisplay({ userId: 785, agencyId: 2, forMatching: true });
  expect(result.accepted).toEqual([]);
  expect(result.excluded).toEqual(['Aetna']);
  expect(result.reviewRequired).toEqual([expect.objectContaining({ name: 'Cigna' })]);
});
it('keeps future, expired and inactive saved credentials out of the public acceptance list', async () => {
  rows = [{ ...current, effective_date: '2099-01-01' }, { ...current, id: 2, insurance_definition_id: 2,
    name: 'Cigna', billing_payer_name: 'Cigna', credential_status: 'inactive' },
  { ...current, id: 3, insurance_definition_id: 3, name: 'Medicaid', billing_payer_name: 'Medicaid', revalidation_due: '2020-01-01' }];
  expect(await listProviderAcceptedInsurancesForDisplay({ userId: 785, agencyId: 2 })).toEqual([]);
});
