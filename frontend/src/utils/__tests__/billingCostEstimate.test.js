import { describe, it, expect } from 'vitest';
import { estimateBillingCosts } from '../billingCostEstimate';
const input = (patch={}) => ({plan:'unlimited',clients:500,secondaryClients:100,visits:2000,secondaryVisits:400,claims:2400,eras:2400,extraChecks:0,taxIdFeesCents:3000,cardVolumeCents:1000000,cardTransactions:400,processorBps:290,processorFixedCents:30,markupBps:100,otherProcessorFeesCents:0,...patch});
describe('account-wide billing cost estimates', () => {
  it('shares the allowance across both policies, with payer-rate bounds after 1000 checks', () => {
    const value=estimateBillingCosts(input());
    expect(value.scenarios).toEqual([
      {id:'monthly',label:'Monthly',checks:600,excessChecks:0,eligibilityLowCents:0,eligibilityHighCents:0,totalLowCents:15000,totalHighCents:15000},
      {id:'weekly',label:'Weekly (monthly average)',checks:2600,excessChecks:1600,eligibilityLowCents:3200,eligibilityHighCents:16000,totalLowCents:18200,totalHighCents:31000},
      {id:'each_visit',label:'Before each visit',checks:2400,excessChecks:1400,eligibilityLowCents:2800,eligibilityHighCents:14000,totalLowCents:17800,totalHighCents:29000}
    ]);
    expect(value.claimCostCents).toBe(0);expect(value.eraCostCents).toBe(0);
  });
  it('counts CLP responses separately from claims on Small Volume and Basic', () => {
    const small=estimateBillingCosts(input({plan:'small',claims:110,eras:120,clients:90,secondaryClients:10,extraChecks:1,taxIdFeesCents:0}));
    expect(small.claimCostCents).toBe(500);expect(small.eraCostCents).toBe(1000);
    expect(small.scenarios[0].totalHighCents).toBe(7550);
    const basic=estimateBillingCosts(input({plan:'basic',claims:10,eras:20,clients:20,secondaryClients:10,taxIdFeesCents:0}));
    expect(basic.scenarios[0].totalHighCents).toBe(4800);
  });
  it('keeps platform fees separate from Stripe costs and includes the fixed per-payment charge', () => {
    expect(estimateBillingCosts(input()).cards).toEqual({processorCents:41000,platformCents:10000,combinedCents:51000});
    expect(estimateBillingCosts(input({markupBps:0,otherProcessorFeesCents:500})).cards).toEqual({processorCents:41500,platformCents:0,combinedCents:41500});
  });
  it.each([{plan:''},{clients:-1},{secondaryClients:501},{secondaryVisits:2001},{visits:1.5},{clients:''},{clients:Infinity},{processorBps:NaN},{cardTransactions:0},{cardVolumeCents:0},{markupBps:10001}])('rejects incomplete or impossible assumptions: %j', patch => {
    expect(()=>estimateBillingCosts(input(patch))).toThrow();
  });
  it('does not treat zero usage as a free account, and adds manual checks to every scenario', () => {
    const value=estimateBillingCosts(input({clients:0,secondaryClients:0,visits:0,secondaryVisits:0,claims:0,eras:0,taxIdFeesCents:0,extraChecks:1001,cardVolumeCents:0,cardTransactions:0}));
    expect(value.cards.combinedCents).toBe(0);
    expect(value.scenarios.every(s=>s.checks===1001&&s.totalLowCents===12002&&s.totalHighCents===12010)).toBe(true);
  });
});
