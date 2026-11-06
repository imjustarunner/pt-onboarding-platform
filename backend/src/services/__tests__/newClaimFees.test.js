import { describe, it, expect, vi } from 'vitest';
vi.mock('../feeSchedule.service.js', async () => {
  const { resolveModifiersFromEntries } = await import('../../utils/feeScheduleRates.js');
  return {
    resolveCanonicalFeeQuote: vi.fn(),
    resolveClaimModifiers: vi.fn(async input => resolveModifiersFromEntries(input))
  };
});
import { priceNewClaimLines } from '../newClaimFees.service.js';

describe('new claim fee snapshots', () => {
  const input = { agencyId: 2, payerId: '60054', providerUserId: 90, dateOfService: '2026-11-03', durationMinutes: 45 };
  it('resolves the billed provider and payer and captures rate provenance for every missing charge', async () => {
    const quote = vi.fn().mockResolvedValue({amountCents:12000,rateCents:6000,rateUnit:'unit',source:'provider',sourceLabel:'Provider override',rateRevisionId:12,payerId:'60054',providerUserId:90,providerRateEligible:true});
    const lines = [{procedureCode:'H0004',units:2}];
    const priced = await priceNewClaimLines({...input,lines},quote);
    expect(quote).toHaveBeenCalledWith({...input,mode:'insurance',serviceCode:'H0004',units:2});
    expect(priced[0]).toMatchObject({chargeCents:12000,feeSource:{source:'provider',rateRevisionId:12,providerUserId:90,needsRate:false}});
    expect(lines).toEqual([{procedureCode:'H0004',units:2}]);
  });
  it('preserves explicit zero and entered charges without consulting live rates', async () => {
    const quote = vi.fn();
    const result=await priceNewClaimLines({...input,lines:[{procedureCode:'H0002',chargeCents:0},{procedureCode:'90837',chargeCents:12500}]},quote);
    expect(result.map(l=>l.chargeCents)).toEqual([0,12500]);expect(quote).not.toHaveBeenCalled();
  });
  it('snapshots scoped modifier defaults and preserves modifiers entered on the claim', async () => {
    const quote = vi.fn();
    const modifiers = vi.fn().mockResolvedValue({ modifiers: ['U9'], source: 'payer' });
    const result = await priceNewClaimLines({ ...input, credentialKey: 'hcbs_1', lines: [
      { procedureCode: 'H0002', chargeCents: 0 },
      { procedureCode: '90837', chargeCents: 12500, modifiers: ['95'] }
    ] }, quote, modifiers);
    expect(modifiers).toHaveBeenCalledExactlyOnceWith({ agencyId: 2, payerId: '60054', providerUserId: 90, credentialKey: 'hcbs_1', serviceCode: 'H0002' });
    expect(result.map(line => ({ modifiers: line.modifiers, source: line.modifierSource }))).toEqual([
      { modifiers: ['U9'], source: 'payer' }, { modifiers: ['95'], source: 'entered' }
    ]);
    expect(quote).not.toHaveBeenCalled();
  });
  it('marks a missing rate separately from an explicit free fee and propagates lookup errors', async () => {
    const quote=vi.fn().mockResolvedValueOnce({amountCents:null,rateCents:null,source:'unset'}).mockResolvedValueOnce({amountCents:0,rateCents:0,source:'practice'});
    const result=await priceNewClaimLines({...input,lines:[{procedureCode:'UNKNOWN'},{procedureCode:'H0002'}]},quote);
    expect(result.map(l=>l.feeSource.needsRate)).toEqual([true,false]);
    await expect(priceNewClaimLines({...input,lines:[{procedureCode:'H0002'}]},vi.fn().mockRejectedValue(new Error('Unavailable')))).rejects.toThrow('Unavailable');
  });
  it.each([-1,1.5,'bad'])('rejects malformed charge %s',async chargeCents=>{
    await expect(priceNewClaimLines({...input,lines:[{procedureCode:'H0002',chargeCents}]},vi.fn())).rejects.toThrow('whole cents');
  });
});
