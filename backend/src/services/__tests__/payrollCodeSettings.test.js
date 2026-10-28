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

import {estimatePay} from '../paySystem.service.js';
import {shouldSuggest99051,resolveNoteAidBillingCodes} from '../../utils/noteAidBillingAddons.js';
import {applyFlatAddonHandbookAmendment,FLAT_ADDON_POLICY_HTML} from '../../content/flatAddonHandbookAmendment.js';
const flatRules = [
 {service_code:'90785',pay_system_bucket:'flat',flat_rate_amount:2,category:'direct',credit_value:1,pay_divisor:1},
 {service_code:'99051',pay_system_bucket:'flat',flat_rate_amount:2,category:'direct',credit_value:1,pay_divisor:1}
];
const bonusProfile={...profile,tierBonus:{3:2},spanishBonus:{3:5},locationBonus:{3:5}};
const bonusStatus={tierLevel:3,spanishBonusEligible:true,locationBonusEligible:true};
it('flat add-ons pay exactly $2/$2 without credits, hours, auto-indirect or conditional bonuses',()=>{
 const result=estimatePay({rateProfile:bonusProfile,status:bonusStatus,lines:[{serviceCode:'90785',quantity:2},{serviceCode:'99051',quantity:3}],rulesByCode:new Map(flatRules.map(r=>[r.service_code,r]))});
 expect(result.summary).toMatchObject({grandTotal:10,flatPay:10,credits:0,totalHourEquivalent:0,directPay:0,indirectPay:0,totalBonusAmount:0});
 expect(result.lines.map(l=>l.lineTotal)).toEqual([4,6]);
 expect(result.lines.every(l=>l.bucketLabel==='Flat add-on'&&l.payHours===0&&l.creditValue===0)).toBe(true);
 expect(compensationCodes(flatRules).map(c=>c.quantityLabel)).toEqual(['$2.00 per eligible occurrence · no credits or hours','$2.00 per eligible occurrence · no credits or hours']);
});
it('actual payroll uses the same flat amounts, including reduced rates, without leave or bonus hours',()=>{
 const breakdown=Object.fromEntries(flatRules.map(r=>[r.service_code,{units:3,finalizedUnits:3,category:'direct',paySystemBucket:'flat',flatRateAmount:r.flat_rate_amount,creditValue:1,payDivisor:1}]));
 const result=applyPaySystemToBreakdown({breakdown,rateProfile:{...bonusProfile,creditRateProbation:38},status:{...bonusStatus,useReducedRates:true}});
 expect(result.paySystemTotal).toBe(12);expect(result.bonuses.totalBonusAmount).toBe(0);
 expect(Object.values(result.leaveBasis).every(n=>n===0)).toBe(true);
 expect(breakdown['90785']).toMatchObject({amount:6,rateAmount:2,rateUnit:'per_unit',hours:0,creditsHours:0,payHours:0});
});
it('adding add-ons does not increase the clinical service bonus or hour basis',()=>{
 const calc=lines=>estimatePay({rateProfile:bonusProfile,status:bonusStatus,lines,rulesByCode:new Map([...rules,...flatRules].map(r=>[r.service_code,r]))});
 const base=calc([{serviceCode:'90791',quantity:1}]);
 const withAddons=calc([{serviceCode:'90791',quantity:1},{serviceCode:'90785',quantity:1},{serviceCode:'99051',quantity:1}]);
 expect(withAddons.summary.grandTotal-base.summary.grandTotal).toBe(4);
 expect(withAddons.summary.credits).toBe(base.summary.credits);
 expect(withAddons.summary.totalBonusAmount).toBe(base.summary.totalBonusAmount);
});
it('fails visibly for a missing flat rate or fractional occurrence instead of applying the clinical rate',()=>{
 expect(()=>computeLineAmount({rateProfile:profile,status:{},serviceCode:'90785',quantity:1,rule:{pay_system_bucket:'flat'}})).toThrow('flat payment');
 expect(()=>computeLineAmount({rateProfile:profile,status:{},serviceCode:'90785',quantity:.5,rule:flatRules[0]})).toThrow('whole number');
});
it('keeps historical fixed lines and other agencies legacy mappings unchanged',()=>{
 const breakdown={'90785':{units:1,amount:2.17,payMethod:'historical_fixed',creditsHours:0}};
 expect(applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{}}).servicePay).toBe(2.17);
 expect(classifyPayType('90785',{category:'direct'})).toBe('credit');
});
it('uses Denver 9–5 boundaries across standard/daylight time without automatically adding 99051',()=>{
 for(const [date,expected] of [['2026-10-28T14:59:00Z',true],['2026-10-28T15:00:00Z',false],['2026-10-28T22:59:00Z',false],['2026-10-28T23:00:00Z',true],['2026-10-31T18:00:00Z',true],['2026-11-02T15:59:00Z',true],['2026-11-02T16:00:00Z',false],['2026-11-02T07:00:00Z',true]])expect(shouldSuggest99051(date,{timeZone:'America/Denver'}),date).toBe(expected);
 expect(resolveNoteAidBillingCodes({primaryCode:'90837',durationMinutes:60,sessionStartAt:'2026-10-31T18:00:00Z'}).addons).toEqual([]);
});
it('adds the sourced handbook policy idempotently while removing obsolete credit rows and preserving other policies',()=>{
 const source={sections:[{slug:'service-code-approval-and-credit-reference',status:'ready',bodyHtml:'<table><tr><th>90785</th><td>0 credits</td></tr><tr><th>90837</th><td>1 credit</td></tr></table>'},{slug:'other',bodyHtml:'Keep me'}]};
 expect(applyFlatAddonHandbookAmendment(structuredClone(source),'nlu')).toEqual(source);
 const once=applyFlatAddonHandbookAmendment(structuredClone(source),'itsco');
 expect(applyFlatAddonHandbookAmendment(structuredClone(once),'itsco')).toEqual(once);
 expect(once.sections[0].bodyHtml).not.toContain('<th>90785</th>');expect(once.sections[0].bodyHtml).toContain('<th>90837</th>');expect(once.sections[1]).toEqual(source.sections[1]);
 expect(FLAT_ADDON_POLICY_HTML).toContain('hcpf.colorado.gov/sites/hcpf/files/January%202026');
 expect(FLAT_ADDON_POLICY_HTML).toContain('90834 × 2');
});

it('excludes 90785 from crisis, family and extended encounters under Colorado guidance',()=>{
 for (const [primaryCode,durationMinutes] of [['90839',60],['90834',90],['90837',90],['90847',60]]) {
  const result=resolveNoteAidBillingCodes({primaryCode,durationMinutes,includeInteractiveComplexity:true});
  expect(result.addons.some(a=>a.code==='90785')).toBe(false);
 }
 for (const code of ['90791','90832','90834','90837','90853'])expect(resolveNoteAidBillingCodes({primaryCode:code,durationMinutes:60,includeInteractiveComplexity:true}).addons).toContainEqual({code:'90785',units:1});
});
