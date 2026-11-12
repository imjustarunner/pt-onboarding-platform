import {beforeEach,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db,onTableWrite:vi.fn()}));
import {computeLineAmount,applyPaySystemToBreakdown,classifyPayType} from '../paySystem.service.js';
import PayrollRate from '../../models/PayrollRate.model.js';
import TemplateRates from '../../models/PayrollRateTemplateRate.model.js';
import Levels from '../../models/PayrollCompensationLevel.model.js';
import Rule from '../../models/PayrollServiceCodeRule.model.js';
const profile={creditRate:44,hcodeRate:32,indirectRate:18,autoIndirectMinutesPerHour:10,tierBonus:{1:5}};
beforeEach(()=>{vi.clearAllMocks();PayrollRate.__hasPayPercentColumn=true;Rule.__hasPayMethodColumn=true;db.execute.mockResolvedValue([[]]);});
it.each(['Pro-Bono Service',' pro bono service ','PROBONO','PRO_BONO_SERVICE'])('always pays %s at zero despite configured rates and buckets',serviceCode=>{
 for(const pay_system_bucket of ['credit','hcode','support_activity','flat']) {
  const line=computeLineAmount({rateProfile:profile,status:{tierLevel:1},serviceCode,quantity:10,rule:{category:'direct',pay_system_bucket,flat_rate_amount:999,credit_value:1}});
  expect(classifyPayType(serviceCode,{pay_system_bucket})).toBe('skip');
  expect(line).toMatchObject({rate:0,amount:0,hourEquivalent:0,totalWithAutoIndirect:0,autoIndirectAmount:0,autoIndirectHours:0});
 }
});
it.each(['fixed_rate','historical_fixed','percent_collected','percent_billed'])('clears stale %s Pro Bono pay before any bypass or bonus math',payMethod=>{
 const breakdown={'PRO-BONO SERVICE':{units:1,finalizedUnits:1,amount:44,rateAmount:44,category:'direct',payMethod,hours:1,creditsHours:1,payHours:1,creditValue:1,hcodeGrossAmount:47}};
 const result=applyPaySystemToBreakdown({breakdown,rateProfile:profile,status:{tierLevel:1}});
 expect(breakdown['PRO-BONO SERVICE']).toMatchObject({amount:0,rateAmount:0,hours:0,creditsHours:0,payHours:0,hcodeGrossAmount:0});
 expect(result.servicePay).toBe(0);expect(result.autoIndirectAmount).toBe(0);expect(result.bonuses.totalBonusAmount).toBe(0);
});
it('saves and returns zero for per-user Pro Bono rate edits',async()=>{
 db.execute.mockImplementation(async sql=>sql.startsWith('SELECT * FROM payroll_rates')?[[{service_code:'PRO-BONO SERVICE',rate_amount:88,pay_percent:90,pay_method:'percent_collected'}]]:[[]]);
 const saved=await PayrollRate.upsert({agencyId:2,userId:7,serviceCode:'PRO-BONO SERVICE',rateAmount:88,payPercent:90,payMethod:'percent_collected'});
 expect(db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'))[1].slice(3,6)).toEqual([0,null,'fixed_rate']);expect(saved.rate_amount).toBe(0);
 expect((await PayrollRate.listForUser(2,7))[0].rate_amount).toBe(0);
});
it('cannot restore Pro Bono pay through a rate template or compensation level',async()=>{
 await TemplateRates.replaceAllForTemplate({templateId:1,agencyId:2,rates:[{serviceCode:'PRO-BONO SERVICE',rateAmount:99}]});
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO payroll_rate_template_rates'))[1][3]).toBe(0);
 db.execute.mockClear();await Levels.saveLevelRates(2,1,2,[{serviceCode:'PRO-BONO SERVICE',rateAmount:99}]);
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO payroll_compensation_level_rates'))[1][4]).toBe(0);
});
it('does not allow an agency rule to make Pro Bono a paid flat add-on',async()=>{
 Rule.__hasPayMethodColumn=true;Rule.__hasPayMethodColumns=true;
 db.execute.mockImplementation(async sql=>sql.includes('information_schema')?[[{COLUMN_NAME:'pay_method'}]]:[[]]);
 await Rule.upsert({agencyId:2,serviceCode:'PRO-BONO SERVICE',paySystemBucket:'flat',flatRateAmount:100,countsForTier:1,creditValue:1});
 const params=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO payroll_service_code_rules'))[1];
 expect(params.slice(0,2)).toEqual([0,'skip']);expect(params[8]).toBe(0);expect(params[9]).toBe(0);
});
