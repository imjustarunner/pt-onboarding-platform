import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../services/paySystem.service.js',()=>({loadUserPaySystemContext:vi.fn(),applyPaySystemToBreakdown:vi.fn(),classifyPayType:vi.fn()}));
vi.mock('../../models/PayrollRate.model.js',()=>({default:{findBestRate:vi.fn()}}));
vi.mock('../../models/PayrollCompensationLevel.model.js',()=>({default:{getForUser:vi.fn()}}));
vi.mock('../../models/PayrollPaySystemRate.model.js',()=>({default:{isAgencyEnabled:vi.fn()}}));
import {loadUserPaySystemContext} from '../../services/paySystem.service.js';
import PayrollRate from '../../models/PayrollRate.model.js';
import {computeDefaultAppliedAmountForTimeClaim} from '../payroll.controller.js';
const claim=(categoryGroup,serviceCode=null)=>({agency_id:2,user_id:7,claim_date:'2026-10-10',claim_type:'indirect_time',payload:{categoryGroup,serviceCode,totalMinutes:20}});
beforeEach(()=>{vi.clearAllMocks();PayrollRate.findBestRate.mockResolvedValue(null);loadUserPaySystemContext.mockResolvedValue({enabled:true,status:{useReducedRates:false},rateProfile:{indirectRate:22,indirectRateProbation:18,supportActivityRate:18,supportActivityRateProbation:16,roleCompensation:{cpa:{adminRate:23}}}});});
it('pays excess indirect at the new dated rate without rounding minutes into hundredths of an hour',async()=>{expect(await computeDefaultAppliedAmountForTimeClaim({claim:claim('indirect_service'),rateCard:{indirect_rate:30}})).toBe(7.33);});
it('uses the minimum-workload indirect rate when applicable',async()=>{loadUserPaySystemContext.mockResolvedValue({enabled:true,status:{useReducedRates:true},rateProfile:{indirectRate:22,indirectRateProbation:18}});expect(await computeDefaultAppliedAmountForTimeClaim({claim:claim('indirect_service')})).toBe(6);});
it('uses the assigned administrative rate instead of the ordinary indirect rate',async()=>{expect(await computeDefaultAppliedAmountForTimeClaim({claim:claim('admin_duties','Admin Time'),rateCard:{indirect_rate:30}})).toBe(7.67);});
it('retains the saved admin rate before activation and never substitutes an unrelated rate',async()=>{loadUserPaySystemContext.mockResolvedValue({enabled:false});PayrollRate.findBestRate.mockResolvedValue({rate_amount:23});expect(await computeDefaultAppliedAmountForTimeClaim({claim:claim('admin_duties','Admin Time'),rateCard:{indirect_rate:30}})).toBe(7.67);PayrollRate.findBestRate.mockResolvedValue(null);expect(await computeDefaultAppliedAmountForTimeClaim({claim:claim('admin_duties','Admin Time'),rateCard:{indirect_rate:30}})).toBeNull();});
it('pays support activities at their own rate',async()=>{expect(await computeDefaultAppliedAmountForTimeClaim({claim:claim('support_activity','MEETING'),rateCard:{indirect_rate:30}})).toBe(6);});

it('holds excess-only claims for review when the automatic allowance is not active',async()=>{loadUserPaySystemContext.mockResolvedValue({enabled:false});const c=claim('indirect_service');c.payload.excessIndirect={code:'H0004',units:20,actualMinutes:70};expect(await computeDefaultAppliedAmountForTimeClaim({claim:c,rateCard:{indirect_rate:22}})).toBeNull();});

it('applies the meeting-specific hourly rate in the actual payroll amount calculation',async()=>{
 const {default:pool}=await import('../../config/database.js');pool.execute.mockResolvedValue([[{rate_type:'custom',hourly_rate:32}]]);
 const c={...claim('support_activity','MEETING'),id:611,claim_type:'meeting_training',payload:{source:'meeting_compensation_auto',serviceCode:'MEETING',totalMinutes:45}};
 expect(await computeDefaultAppliedAmountForTimeClaim({claim:c})).toBe(24);
});

it('uses the assigned indirect rate for verified clinical FFS excess time',async()=>{const c=claim('indirect_service');c.payload.ffsExcess={allowanceNeedsReview:false};expect(await computeDefaultAppliedAmountForTimeClaim({claim:c})).toBe(7.33);});
it('requires payroll to verify an unconfigured clinical allowance before proposing payment',async()=>{const c=claim('indirect_service');c.payload.ffsExcess={allowanceNeedsReview:true};expect(await computeDefaultAppliedAmountForTimeClaim({claim:c,rateCard:{indirect_rate:22}})).toBeNull();});
it('does not substitute a legacy rate for clinical excess without an active pay profile',async()=>{loadUserPaySystemContext.mockResolvedValue({enabled:false});const c=claim('indirect_service');c.payload.ffsExcess={allowanceNeedsReview:false};expect(await computeDefaultAppliedAmountForTimeClaim({claim:c,rateCard:{indirect_rate:22}})).toBeNull();});

it('pays event travel at the Support Activity rate using exact minutes despite rounded display hours', async () => {
  const c = claim('support_activity', 'MEETING'); c.payload.source = 'event_travel_report'; c.credits_hours = 0.33;
  expect(await computeDefaultAppliedAmountForTimeClaim({ claim: c, approveCreditsHours: 0.33, rateCard: { indirect_rate: 99 } })).toBe(6);
});
it('does not substitute indirect pay when the event travel support rate is missing', async () => {
  loadUserPaySystemContext.mockResolvedValue({ enabled: false }); PayrollRate.findBestRate.mockResolvedValue(null);
  const c = claim('support_activity', 'MEETING'); c.payload.source = 'event_travel_report';
  expect(await computeDefaultAppliedAmountForTimeClaim({ claim: c, rateCard: { indirect_rate: 99 } })).toBeNull();
});
it('uses the applicable reduced Support Activity rate for event travel', async () => {
  loadUserPaySystemContext.mockResolvedValue({ enabled: true, status: { useReducedRates: true }, rateProfile: { supportActivityRate: 18, supportActivityRateProbation: 15 } });
  const c = claim('support_activity', 'MEETING'); c.payload.source = 'event_travel_report';
  expect(await computeDefaultAppliedAmountForTimeClaim({ claim: c })).toBe(5);
});
