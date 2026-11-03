import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { planCredentialingPayerCatalog, payerCatalogPlanToken } from '../credentialingPayerCatalog.service.js';
import { isActiveCredentialPayerRow } from '../credentialPayerEligibility.service.js';
const payer = (id, name = 'Aetna', extra = {}) => ({ id: 1, agency_id: 2, payer_name: name, directory_name: name, directory_status: 'id_match', claimmd_payer_id: id, ...extra });
const plan = (extra = {}) => planCredentialingPayerCatalog({ agencyId: 2, payers: [payer('60054')], definitions: [], links: [], ...extra });
describe('verified payer catalog planning', () => {
  it('links only an exact unique normalized name', () => {
    expect(plan({ definitions: [{ id: 3, agency_id: 2, name: '  AETNA ' }] }).operations).toEqual([{ action: 'link_existing', payerId: '60054', requestId: 1, definitionId: 3, name: '  AETNA ' }]);
  });
  it('creates a catalog definition but never creates a provider credential or status', () => {
    const operation = plan().operations[0];
    expect(operation).toMatchObject({ action: 'create_definition', payerId: '60054', name: 'Aetna' });
    expect(operation).not.toHaveProperty('providerId'); expect(operation).not.toHaveProperty('status');
  });
  it('does not guess aliases or similar carrier names', () => {
    expect(plan({ definitions: [{ id: 3, agency_id: 2, name: 'Aetna PPO' }] }).operations[0].action).toBe('create_definition');
  });
  it('never imports another tenant or an unverified route', () => {
    expect(plan({ payers: [payer('A', 'Other', { agency_id: 6 }), payer('B', 'Pending', { directory_status: 'alias_review' })] }).operations).toEqual([]);
    expect(plan({ definitions: [{ id: 3, agency_id: 6, name: 'Aetna' }] }).operations[0].definitionId).toBeNull();
  });
  it('leaves duplicate names and conflicting saved links for review', () => {
    expect(plan({ definitions: [{ id: 3, agency_id: 2, name: 'Aetna' }, { id: 4, agency_id: 2, name: 'Aetna' }] }).conflicts).toHaveLength(1);
    expect(plan({ definitions: [{ id: 3, agency_id: 2, name: 'Aetna' }], links: [{ agency_id: 2, insurance_definition_id: 3, payer_id: 'OTHER' }] }).operations).toEqual([]);
  });
  it('does not create identical ambiguous names for different routing IDs', () => {
    const result = plan({ payers: [payer('A'), payer('B')] });
    expect(result.operations).toEqual([]); expect(result.conflicts).toHaveLength(2);
  });
  it('coalesces duplicate verified routes and is idempotent after linking', () => {
    expect(plan({ payers: [payer('A'), payer('A', 'Aetna alias')] }).operations).toHaveLength(1);
    expect(plan({ links: [{ agency_id: 2, insurance_definition_id: 4, payer_id: '60054' }] }).operations).toEqual([]);
  });
  it('fingerprints the exact agency and reviewed operations', () => {
    const first = plan();
    expect(payerCatalogPlanToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(payerCatalogPlanToken(first)).toBe(payerCatalogPlanToken(plan()));
    expect(payerCatalogPlanToken(first)).not.toBe(payerCatalogPlanToken({ ...first, agencyId: 6 }));
    expect(payerCatalogPlanToken(first)).not.toBe(payerCatalogPlanToken(plan({ payers: [payer('CHANGED')] })));
  });
});
describe('credential date and status eligibility', () => {
  const row = { effective_date: '2020-01-01', billing_payer_id: 'A', billing_payer_name: 'Carrier' };
  const today = { asOfDate: '2026-11-03' };
  it('retains valid recorded effective credentials and explicit active credentials', () => {
    expect(isActiveCredentialPayerRow(row, today)).toBe(true);
    expect(isActiveCredentialPayerRow({ ...row, credential_status: 'active', revalidation_due: '2026-11-03' }, today)).toBe(true);
  });
  it.each(['denied','terminated','not_started','action_required','in_review'])('excludes explicit %s even with an old effective date', credential_status => {
    expect(isActiveCredentialPayerRow({ ...row, credential_status }, today)).toBe(false);
  });
  it.each(['','0000-00-00','2026-02-30','1900-INVALID',new Date(NaN)])('rejects invalid or missing effective dates %s', effective_date => {
    expect(isActiveCredentialPayerRow({ ...row, effective_date, credential_status: 'active' }, today)).toBe(false);
  });
  it('excludes future, overdue and malformed review dates', () => {
    expect(isActiveCredentialPayerRow({ ...row, effective_date: '2026-11-04' }, today)).toBe(false);
    expect(isActiveCredentialPayerRow({ ...row, revalidation_due: '2026-11-02' }, today)).toBe(false);
    expect(isActiveCredentialPayerRow({ ...row, revalidation_due: 'garbage' }, today)).toBe(false);
    expect(isActiveCredentialPayerRow(row, { asOfDate: '2026-02-30' })).toBe(false);
  });
  it('can expose recorded network participation without inventing an electronic billing route', () => {
    const unlinked = { effective_date: '2020-01-01' };
    expect(isActiveCredentialPayerRow(unlinked, today)).toBe(false);
    expect(isActiveCredentialPayerRow(unlinked, { ...today, requireVerifiedPayer: false })).toBe(true);
  });
});
