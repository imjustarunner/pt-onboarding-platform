import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ESTIMATE_DEFAULTS, ESTIMATE_ACKNOWLEDGMENT, buildCostEstimate, costEstimateReadiness, estimateDisclosure, estimateWindow, insuredPlanningCost } from '../costEstimatePolicy.js';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn(), billingLink: vi.fn(), access: vi.fn(), insurance: vi.fn(), audit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../familyLedger/policy.js', () => ({ transaction: work => mocks.transaction(work) }));
vi.mock('../familyBillingPolicy.service.js', () => ({ positiveId: value => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw Object.assign(new Error('Invalid ID'), { status: 400 }); return n; }, billingError: (status, message) => Object.assign(new Error(message), { status }), requireBillingLink: mocks.billingLink, auditBilling: mocks.audit }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ clinicalAccess: mocks.access }));
vi.mock('../clientInsurance.service.js', () => ({ readClientInsurance: mocks.insurance }));
vi.mock('../claimMdBillingProfile.service.js', () => ({ getClaimMdBillingProfile: vi.fn(), listClaimMdBillingProfiles: vi.fn() }));
vi.mock('../clinicalDiagnosisAttach.service.js', () => ({ getPrimaryClinicalDiagnosis: vi.fn() }));
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { acknowledgeCostEstimate, getCostEstimate, issueCostEstimate, listCostEstimateRates, renderCostEstimatePdf, saveCostEstimateRate } from '../familyCostEstimates.service.js';

const fixture = (overrides = {}) => buildCostEstimate({
  agency: { id: 2, name: 'Example Care', npi: '1234567893', taxId: '123456789' },
  provider: { id: 4, name: 'Demo Provider', npi: '1234567893' },
  patient: { id: 8, name: 'Demo Client', dateOfBirth: '2010-01-01' },
  location: { address: 'Example office, Denver, CO', state: 'CO' },
  startDate: '2026-10-21', diagnosisCodes: ['F43.9'], coverageEvidence: 'Self-pay status verified by billing 2026-10-21',
  lines: [{ serviceCode: '90837', description: 'Individual psychotherapy', amountCents: 10000, quantity: 6, approved: true, revision: 1 }], ...overrides
});
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stored = (snapshot, overrides = {}) => ({ id: 12, agency_id: 2, client_id: 8, guardian_user_id: 10, status: 'issued', snapshot_hash: digest(snapshot), snapshot_encrypted: encryptFamilyBilling(snapshot, 'cost-estimate:2:8'), ...overrides });

beforeEach(() => { vi.clearAllMocks(); process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64'); mocks.billingLink.mockResolvedValue({}); mocks.access.mockResolvedValue({ scopes: ['clinical_documents'] }); mocks.insurance.mockResolvedValue(null); mocks.transaction.mockImplementation(work => work({ execute: mocks.execute })); mocks.execute.mockResolvedValue([[]]); });

describe('individualized estimates', () => {
  it('uses six weeks and six explicitly expected sessions, without implying coverage stops', () => {
    const result = fixture(); expect(result.startDate).toBe('2026-10-21'); expect(result.endDate).toBe('2026-12-01'); expect(result.totalCents).toBe(60000); expect(result.missing).toEqual([]);
    expect(estimateDisclosure(result).join(' ')).toContain('does not limit treatment or insurance coverage');
  });
  it('allows a tailored recurring plan up to 52 weeks and rejects longer estimates', () => { expect(estimateWindow('2026-01-01', 52).endDate).toBe('2026-12-30'); expect(() => estimateWindow('2026-01-01', 53)).toThrow(); });
  it('rejects Medicaid and Medicaid-secondary patient-pay estimates', () => { expect(() => fixture({ medicaid: true })).toThrow('Medicaid'); });
  it('requires a commercial self-pay election when insurance exists', () => { expect(() => fixture({ hasCoverage: true })).toThrow('elected'); expect(fixture({ hasCoverage: true, selfPayElection: true }).totalCents).toBe(60000); });
  it('holds an unspecified group price without inventing a rate', () => { const group = ESTIMATE_DEFAULTS.find(row => row.serviceCode === '90853'); const value = fixture({ lines: [{ ...group, quantity: 6 }] }); expect(value.totalCents).toBeNull(); expect(value.missing).toContain('Approved agency prices for each expected service'); });
  it('does not treat incomplete patient/provider/location information as ready', () => { const value = fixture({ provider: { name: '' }, patient: {}, location: {}, coverageEvidence: '' }); expect(value.missing).toEqual(expect.arrayContaining(['Client name', 'Assigned provider', 'Assigned provider NPI', 'Service location', 'Self-pay coverage review'])); });
  it('requires applicable diagnosis or an explicit reason for its absence', () => { expect(fixture({ diagnosisCodes: [] }).missing).toContain('Applicable diagnosis or documented not yet applicable'); expect(fixture({ diagnosisCodes: [], diagnosisNotApplicable: true }).missing).toContain('Reason diagnosis is not applicable'); expect(fixture({ diagnosisCodes: [], diagnosisNotApplicable: true, diagnosisReason: 'Initial assessment has not occurred' }).missing).toEqual([]); });
  it('never approves draft prices merely because they are in the source attachment', () => { expect(ESTIMATE_DEFAULTS.every(rate => !rate.approved)).toBe(true); expect(ESTIMATE_DEFAULTS.find(rate => rate.serviceCode === '99441').reviewReason).toBe('legacy_code_review'); expect(ESTIMATE_DEFAULTS.find(rate => rate.serviceCode === 'MRF001').reviewReason).toBe('patient_access_review'); });
  it('rejects deleted telephone codes and duplicate service rows for new estimates', () => { expect(() => fixture({ lines: [{ serviceCode: '99441', description: 'Legacy call', amountCents: 1500, approved: true }] })).toThrow('deleted'); const line = { serviceCode: '90837', description: 'Individual session', amountCents: 10000, approved: true }; expect(() => fixture({ lines: [line,line] })).toThrow('one expected quantity'); });
  it('checks the NPI checksum instead of accepting any ten digits', () => { expect(costEstimateReadiness({ ...fixture(), provider: { name: 'Provider', npi: '1111111111' } })).toContain('Assigned provider NPI'); });
  it('holds insured estimates with missing or out-of-period evidence or secondary coverage', () => {
    const facts = { verified: true, evidenceReference: 'Payer reviewed fixed per-session responsibility', perSessionResponsibilityCents: 2500, validFrom: '2026-10-21', validThrough: '2026-12-01', startDate: '2026-10-21', endDate: '2026-12-01', sessionCount: 6 };
    expect(insuredPlanningCost(facts).totalCents).toBe(15000); expect(insuredPlanningCost({ ...facts, verified: false }).totalCents).toBeNull(); expect(insuredPlanningCost({ ...facts, validThrough: '2026-10-22' }).totalCents).toBeNull(); expect(insuredPlanningCost({ ...facts, hasSecondaryCoverage: true }).totalCents).toBeNull(); expect(() => insuredPlanningCost({ ...facts, perSessionResponsibilityCents: null })).toThrow();
  });
  it('uses optional receipt wording, never a rights waiver or payment authorization', () => { expect(ESTIMATE_ACKNOWLEDGMENT).toContain('does not authorize a payment'); expect(ESTIMATE_ACKNOWLEDGMENT).toContain('waive any billing or dispute rights'); expect(estimateDisclosure(fixture()).join(' ')).toContain('120 calendar days'); });
});

describe('tenant and document protection', () => {
  it('returns the requested tenant’s independent catalog override while retaining unpriced groups', async () => { mocks.execute.mockResolvedValue([[{ serviceCode: '90837', description: 'Agency session', amountCents: 12000, unitLabel: 'session', approved: 1, revision: 3 }]]); const rates = await listCostEstimateRates(2); expect(mocks.execute.mock.calls[0][1]).toEqual([2]); expect(rates.find(r => r.serviceCode === '90837').amountCents).toBe(12000); expect(rates.find(r => r.serviceCode === '90853').amountCents).toBeNull(); });
  it('does not disclose a different guardian’s estimate', async () => { mocks.execute.mockResolvedValue([[stored(fixture())]]); await expect(getCostEstimate({ agencyId: 2, estimateId: 12, userId: 11 })).rejects.toMatchObject({ status: 404 }); });
  it('does not expose drafts to the family', async () => { mocks.execute.mockResolvedValue([[stored(fixture(), { status: 'draft' })]]); await expect(getCostEstimate({ agencyId: 2, estimateId: 12, userId: 10 })).rejects.toMatchObject({ status: 404 }); });
  it('rechecks clinical document access even when billing access remains active', async () => { mocks.execute.mockResolvedValue([[stored(fixture())]]); mocks.access.mockResolvedValue({ scopes: [] }); await expect(getCostEstimate({ agencyId: 2, estimateId: 12, userId: 10 })).rejects.toMatchObject({ status: 403 }); });
  it('rejects a changed snapshot rather than signing different terms', async () => { mocks.execute.mockResolvedValue([[stored(fixture())]]); await expect(acknowledgeCostEstimate({ agencyId: 2, estimateId: 12, userId: 10, accepted: true, signatureName: 'Demo Guardian', snapshotHash: 'changed' })).rejects.toMatchObject({ status: 409 }); expect(mocks.execute.mock.calls.every(([sql]) => !sql.startsWith('UPDATE'))).toBe(true); });
  it('records one encrypted receipt acknowledgment with no payment or waiver', async () => { const snapshot = fixture(); mocks.execute.mockResolvedValueOnce([[stored(snapshot)]]).mockResolvedValue([{}]); await expect(acknowledgeCostEstimate({ agencyId: 2, estimateId: 12, userId: 10, accepted: true, signatureName: 'Demo Guardian', snapshotHash: digest(snapshot) })).resolves.toEqual({ acknowledged: true }); const write = mocks.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE')); expect(write[1][0]).not.toContain('Demo Guardian'); expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cost_estimate_received' }), expect.anything()); });
  it('makes a repeated acknowledgment idempotent', async () => { const snapshot = fixture(); mocks.execute.mockResolvedValue([[stored(snapshot, { status: 'acknowledged' })]]); await expect(acknowledgeCostEstimate({ agencyId: 2, estimateId: 12, userId: 10, accepted: true, signatureName: 'Demo Guardian', snapshotHash: digest(snapshot) })).resolves.toEqual({ acknowledged: true, existing: true }); expect(mocks.execute.mock.calls.every(([sql]) => !sql.startsWith('UPDATE'))).toBe(true); });
  it('holds issuance when current coverage differs from the stored estimate', async () => { const snapshot = { ...fixture(), insuranceFingerprint: digest(null) }; mocks.execute.mockResolvedValue([[stored(snapshot, { status: 'draft' })]]); mocks.insurance.mockResolvedValue({ primary: { memberId: 'new-commercial' } }); await expect(issueCostEstimate({ agencyId: 2, estimateId: 12, actorUserId: 4 })).rejects.toThrow('Coverage changed'); });
  it('rejects stale price edits and never mutates existing claim or collection prices', async () => { mocks.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ revision: 3 }]]); await expect(saveCostEstimateRate({ agencyId: 2, actorUserId: 4, serviceCode: '90837', description: 'Individual session', amountCents: 10000, approved: true, revision: 2, reason: 'Fee review' })).rejects.toMatchObject({ status: 409 }); expect(mocks.execute.mock.calls.every(([sql]) => !sql.startsWith('INSERT'))).toBe(true); });
  it('renders a downloadable PDF without requiring acknowledgment first', async () => { const bytes = await renderCostEstimatePdf({ id: 12, status: 'issued', snapshot: fixture() }); expect(bytes.subarray(0, 4).toString()).toBe('%PDF'); const pdf = await PDFDocument.load(bytes); expect(pdf.getPageCount()).toBeGreaterThan(0); });
});
