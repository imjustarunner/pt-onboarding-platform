import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {classifyPayType} from '../payrollCodeClassification.js';
import {computeLineAmount,applyPaySystemToBreakdown} from '../paySystem.service.js';
import {compensationCodes} from '../payrollSubmissionContext.service.js';
import {normalizeEstimateLines} from '../../controllers/payrollPaySystem.controller.js';
const profile={creditRate:44,hcodeRate:32,indirectRate:22,supportActivityRate:18,autoIndirectMinutesPerHour:10};
const rules=[{service_code:'90791',category:'direct',pay_system_bucket:'credit',credit_value:1,pay_divisor:1},{service_code:'H0031',category:'direct',pay_system_bucket:'hcode',credit_value:1/60,pay_divisor:60},{service_code:'H0004',category:'direct',pay_system_bucket:'hcode',credit_value:.25,pay_divisor:4}];
it('uses saved pay categories rather than code prefixes',()=>{
 expect(classifyPayType('H0004',{category:'direct',pay_system_bucket:'credit'})).toBe('credit');
 expect(classifyPayType('90791',{category:'direct',pay_system_bucket:'hcode'})).toBe('hcode');
 expect(classifyPayType('Outreach',{category:'direct',pay_system_bucket:'support_activity'})).toBe('support_activity');
});
it('pays 90791 as one credit, H0031 per 60 minutes and H0004 per four units',()=>{
 const amounts=rules.map((rule,i)=>computeLineAmount({rateProfile:profile,status:{},serviceCode:rule.service_code,quantity:[1,60,4][i],rule}));
 expect(amounts.map(r=>r.amount)).toEqual([44,32,32]);
 expect(amounts.map(r=>r.payType)).toEqual(['credit','hcode','hcode']);
 const guide=compensationCodes(rules);expect(guide.map(r=>r.group)).toEqual(['clinical_session','direct_care','direct_care']);expect(guide[1].quantityLabel).toBe('Documented service minutes ÷ 60');
});
it('hides Payroll-hidden codes and rejects stale calculator entries',()=>{
 const hidden={service_code:'OUTREACH',category:'direct',show_in_rate_sheet:0,pay_system_bucket:'support_activity'};
 expect(compensationCodes([...rules,hidden])).toHaveLength(3);
 expect(()=>normalizeEstimateLines([{serviceCode:'OUTREACH',quantity:1}],[],new Map(rules.map(r=>[r.service_code,r])))).toThrow('not available');
});
it('uses the saved event bucket and rejects unavailable events',()=>{
 expect(normalizeEstimateLines([{kind:'event',eventTypeId:2,quantity:1,payBucket:'direct'}],[{id:2,payBucket:'support'}])[0].payBucket).toBe('support');
 expect(()=>normalizeEstimateLines([{kind:'event',eventTypeId:3}],[])).toThrow('available activity');
});
it('outreach receives support pay even with an old role outreach rate',()=>{
 const result=computeLineAmount({rateProfile:{...profile,roleCompensation:{cpa:{outreachRate:99}}},status:{},serviceCode:'Outreach',quantity:2,rule:{category:'direct',pay_system_bucket:'support_activity',credit_value:1,pay_divisor:1}});
 expect(result.payType).toBe('support_activity');expect(result.amount).toBe(36);
});
it('uses the saved category in actual payroll breakdown calculations too',()=>{
 const breakdown={H0004:{units:4,finalizedUnits:4,category:'direct',creditValue:.25,payDivisor:4,paySystemBucket:'support_activity'}};
 const result=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{}});
 expect(breakdown.H0004.payType).toBe('support_activity');expect(result.servicePay).toBe(18);
});
