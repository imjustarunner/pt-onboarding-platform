import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ main: vi.fn(), clinical: vi.fn(), agency: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.main } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.clinical } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.agency } }));
vi.mock('../agencyTaxId.service.js', () => ({ unpackAgencyTaxId: row => row.decoded || row.tax_id || null }));
import { getClaimMdBillingProfile, resolveClaimMdBillingProfile, assertClaimBillingNpi, listClaimMdBillingProfiles, assertExclusiveClaimMdTaxId } from '../claimMdBillingProfile.service.js';
const office = { id: 8, agency_id: 377, name: 'Office A', practice_name: 'Test Group LLC', practice_npi: '1306688650', street_address: '1 Test Lane', city: 'Test City', state: 'CO', postal_code: '80000', phone: '5555550100' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.main.mockImplementation(async sql => [sql.includes('agency_service_locations') ? [{ billing_office_location_id: 8 }] : [office]]);
  mocks.clinical.mockResolvedValue([[{ id: 10, billing_office_location_id: 8, service_location_id: 20 }]]);
  mocks.agency.mockResolvedValue({ tax_id: '123456789', tax_id_type: 'ein', name: 'Agency label', street_address: 'Wrong agency address' });
});
describe('Claim.MD office billing identity', () => {
  it('uses the selected office legal name/address and agency tax identity', async () => {
    const p = await resolveClaimMdBillingProfile(377, 10);
    expect(p.billingNpi).toBe('1306688650');
    expect(p.practice).toEqual(expect.objectContaining({ name: 'Test Group LLC', street_address: '1 Test Lane', tax_id: '123456789' }));
    expect(mocks.clinical).toHaveBeenCalledWith(expect.stringContaining('agency_id = ?'), [10, 377]);
    expect(mocks.main).toHaveBeenLastCalledWith(expect.stringContaining('agency_id = ?'), [8, 377]);
  });
  it('uses the service location mapping when the session has no billing office', async () => {
    mocks.clinical.mockResolvedValue([[{ id: 10, service_location_id: 20 }]]);
    expect((await resolveClaimMdBillingProfile(377, 10)).officeId).toBe(8);
  });
  it('rejects conflicting offices instead of guessing between groups', async () => {
    mocks.clinical.mockResolvedValue([[{ id: 10, billing_office_location_id: 9, service_location_id: 20 }]]);
    await expect(resolveClaimMdBillingProfile(377, 10)).rejects.toThrow('different billing offices');
    expect(mocks.agency).not.toHaveBeenCalled();
  });
  it('rejects an unavailable or cross-tenant office even if its numeric ID is supplied', async () => {
    mocks.main.mockResolvedValue([[]]);
    await expect(getClaimMdBillingProfile(377, 999)).rejects.toThrow('another agency');
    expect(mocks.main).toHaveBeenCalledWith(expect.stringContaining('agency_id = ?'), [999, 377]);
  });
  it('rejects cross-tenant sessions and service locations', async () => {
    mocks.clinical.mockResolvedValueOnce([[]]);
    await expect(resolveClaimMdBillingProfile(377, 999)).rejects.toThrow('session');
    mocks.main.mockResolvedValueOnce([[]]);
    await expect(resolveClaimMdBillingProfile(377, 10)).rejects.toThrow('service location');
  });
  it('requires explicit office selection for submission but preserves unrelated draft preparation', async () => {
    mocks.clinical.mockResolvedValue([[{ id: 10 }]]);
    await expect(resolveClaimMdBillingProfile(377, 10)).rejects.toThrow('Select a billing office');
    expect(await resolveClaimMdBillingProfile(377, 10, { required: false })).toBeNull();
  });
  it('allows incomplete drafts but blocks enrollment/review when the office is incomplete', async () => {
    mocks.main.mockResolvedValue([[{ ...office, postal_code: null }]]);
    await expect(getClaimMdBillingProfile(377, 8)).rejects.toThrow('postal_code');
    expect((await getClaimMdBillingProfile(377, 8, { requireComplete: false })).officeId).toBe(8);
  });
  it('blocks NPI overrides that no longer match the selected billing identity', () => {
    expect(() => assertClaimBillingNpi({ billingNpi: '1306688650' }, '1972246940')).toThrow('differs');
    expect(() => assertClaimBillingNpi({ billingNpi: '1306688650' }, '1306688650')).not.toThrow();
  });
  it('lists only owned billing offices and never selects tax ID or credential material', async () => {
    await listClaimMdBillingProfiles(377);
    const [sql, params] = mocks.main.mock.calls[0];
    expect(params).toEqual([377]); expect(sql).toContain('use_as_billing_address = 1');
    expect(sql).not.toMatch(/SELECT \*|tax_id|account_key/);
  });
  it('recognizes the owner of an encrypted Tax ID for ERA isolation', async () => {
    mocks.main.mockResolvedValue([[{ id: 377, tax_id_ciphertext: 'ciphertext', decoded: '12-3456789' }]]);
    await expect(assertExclusiveClaimMdTaxId(377, '123456789')).resolves.toBeUndefined();
  });
  it('blocks combined remittances when encrypted and legacy Tax IDs share ownership', async () => {
    mocks.main.mockResolvedValue([[{ id: 377, tax_id_ciphertext: 'ciphertext', decoded: '12-3456789' }, { id: 2, tax_id: '123456789' }]]);
    await expect(assertExclusiveClaimMdTaxId(377, '123456789')).rejects.toThrow('cannot be isolated');
  });
  it('fails closed when a potentially shared Tax ID cannot be decrypted', async () => {
    mocks.main.mockResolvedValue([[{ id: 2, tax_id_ciphertext: 'ciphertext' }]]);
    await expect(assertExclusiveClaimMdTaxId(377, '123456789')).rejects.toThrow('could not be verified');
  });
});
