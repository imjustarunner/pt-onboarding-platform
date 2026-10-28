import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {separateHistoricalCarryovers} from '../payrollHistoricalCarryover.service.js';
import {applyPaySystemToBreakdown} from '../paySystem.service.js';
const profile={category:2,level:2,creditRate:44,hcodeRate:32,indirectRate:22,supportActivityRate:18,compensationPolicyVersion:'itsco-2026-10-service-credit-v3'};
const status={agreementBoundary:'2026-10-10',agreementStatusArgs:{assignment:{waive_probation:1,waive_minimum_workload:1},benefitTierLevel:1}};
const inputs=()=>({breakdown:{'90837':{category:'direct',units:2,finalizedUnits:2,oldDoneNotesUnits:1,payHours:2,hours:2,creditsHours:2,creditValue:1,rateUnit:'per_unit',amount:94}},stagingRows:[{serviceCode:'90837',carryoverMeta:{rawAuditRows:[{serviceDate:'2026-10-08'}]}}],ratesByCode:new Map([['90837',[{id:1,rate_amount:47}]]]),boundary:'2026-10-10'});
it('keeps historical carryover pay separate from current addendum rates',()=>{
 const args=inputs();separateHistoricalCarryovers(args);
 const meta=applyPaySystemToBreakdown({breakdown:args.breakdown,rateProfile:profile,status,datedUnitsByCode:new Map([['90837',[{serviceDate:'2026-10-12',units:1}]]])});
 expect(meta.servicePay).toBe(91);expect(meta.leaveBasis.legacyPaidBasis).toBe(1);
 expect(args.breakdown['90837__historical']).toMatchObject({amount:47,serviceDates:['2026-10-08'],payMethod:'historical_fixed'});
 expect(args.breakdown['90837'].amount).toBe(44);
});
it('requires historical rate evidence instead of using the new matrix',()=>{
 const args=inputs();args.ratesByCode.clear();expect(()=>separateHistoricalCarryovers(args)).toThrow('saved historical');
});
it('accepts a saved legacy card only when it predates the carried-over service',()=>{
 const args=inputs();args.ratesByCode.clear();args.breakdown['90837'].rateSource='rate_card';args.breakdown['90837'].rateAmount=35;
 expect(()=>separateHistoricalCarryovers({...args,rateCard:{updated_at:'2026-10-20'}})).toThrow('saved historical');
 separateHistoricalCarryovers({...args,rateCard:{updated_at:'2026-08-05'}});
 expect(args.breakdown['90837__historical'].amount).toBe(35);
});
it('holds undated or mixed-era carryovers for review',()=>{
 const args=inputs();args.stagingRows[0].carryoverMeta.rawAuditRows=[];expect(()=>separateHistoricalCarryovers(args)).toThrow('dated carryover');
 args.stagingRows[0].carryoverMeta.rawAuditRows=[{serviceDate:'2026-10-12'}];expect(()=>separateHistoricalCarryovers(args)).toThrow('dated carryover');
});
it('never turns unpaid supervision tracking into credit pay',()=>{
 const breakdown={'99414':{units:60,finalizedUnits:60,supervisionTrackingOnly:true,amount:0,category:'direct'}};
 const meta=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status,datedUnitsByCode:new Map()});
 expect(breakdown['99414'].amount).toBe(0);expect(meta.servicePay).toBe(0);
});
