import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context:vi.fn(), rate:vi.fn() }));
vi.mock('../../models/PayrollRate.model.js',()=>({default:{findBestRate:m.rate}}));
vi.mock('../paySystem.service.js',()=>({loadUserPaySystemContext:m.context}));
import { supervisionNoteHourlyRate, isSupervisionNoteClaim } from '../supervisionNotePay.service.js';
import { createClaimReviewContext } from '../payrollClaimReview.service.js';
const input={agencyId:2,userId:7,asOf:'2026-11-06'};
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue({enabled:false});m.rate.mockResolvedValue(null);});
it('uses half the dated supervisor rate, independently of support, indirect, and workload rates',async()=>{
 m.context.mockResolvedValue({enabled:true,status:{useReducedRates:true},rateProfile:{indirectRate:24,supportActivityRate:18,roleCompensation:{supervisor:{hourlyRate:65}}}});
 expect(await supervisionNoteHourlyRate(input)).toBe(32.5);expect(m.rate).not.toHaveBeenCalled();
});
it('preserves a configured employee Admin Time rate on legacy schedules',async()=>{
 m.rate.mockResolvedValue({rate_amount:32.5});expect(await supervisionNoteHourlyRate(input)).toBe(32.5);
 expect(m.rate).toHaveBeenCalledExactlyOnceWith({agencyId:2,userId:7,serviceCode:'Admin Time',asOf:'2026-11-06'});
});
it('derives legacy Admin Time from individual supervision when no Admin Time rate exists',async()=>{
 m.rate.mockImplementation(async({serviceCode})=>serviceCode==='99415'?{rate_amount:65}:null);
 expect(await supervisionNoteHourlyRate({...input,agencyId:6})).toBe(32.5);
 expect(m.rate.mock.calls.map(([q])=>q.serviceCode)).toEqual(['Admin Time','99415']);
});
it('holds missing or invalid rates for review without falling back to support or ordinary indirect pay',async()=>{
 expect(await supervisionNoteHourlyRate(input)).toBeNull();
 m.rate.mockResolvedValue({rate_amount:Infinity});expect(await supervisionNoteHourlyRate(input)).toBeNull();
 m.context.mockResolvedValue({enabled:true,rateProfile:{indirectRate:24,supportActivityRate:18}});m.rate.mockResolvedValue(null);
 expect(await supervisionNoteHourlyRate(input)).toBeNull();expect(m.rate.mock.lastCall[0].serviceCode).toBe('Admin Time');
});
it('does not conceal an agreement validation error by substituting an older rate',async()=>{
 m.context.mockRejectedValue(Object.assign(new Error('Review the executed agreement'),{code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED'}));
 await expect(supervisionNoteHourlyRate(input)).rejects.toMatchObject({code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED'});expect(m.rate).not.toHaveBeenCalled();
});
it('shares reads within a request while retaining effective-date boundaries',async()=>{
 m.context.mockImplementation(async({periodEnd})=>({enabled:true,rateProfile:{roleCompensation:{supervisor:{hourlyRate:periodEnd.toISOString().startsWith('2026-11-06')?65:80}}}}));
 const rateContext=createClaimReviewContext();expect(await Promise.all([1,2,3].map(()=>supervisionNoteHourlyRate({...input,rateContext})))).toEqual([32.5,32.5,32.5]);
 expect(await supervisionNoteHourlyRate({...input,asOf:'2026-11-07',rateContext})).toBe(40);expect(m.context).toHaveBeenCalledTimes(2);
});
it('recognizes both manual supervision notes and tracked co-sign review without relabeling ordinary admin or mentorship meetings',()=>{
 expect(isSupervisionNoteClaim({claim_type:'indirect_time',payload:{categoryGroup:'supervision_note'}})).toBe(true);
 expect(isSupervisionNoteClaim({claim_type:'indirect_time',payload:{source:'cosign_review_activity'}})).toBe(true);
 expect(isSupervisionNoteClaim({claim_type:'indirect_time',payload:{categoryGroup:'admin_duties'}})).toBe(false);
 expect(isSupervisionNoteClaim({claim_type:'meeting_training',payload:{serviceCode:'Individual Meeting'}})).toBe(false);
});
