import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),agreement:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../employmentAgreementPolicy.service.js',()=>({effectiveCompensationAgreement:m.agreement}));
import {enrollCompletedFutureHire,futureHirePayContext} from '../futureHirePay.service.js';
let agencies,prior,user,existing,salary;
const rates={category:2,level:3,creditRate:40,hcodeRate:30,indirectRate:20,supportRate:20,creditRateProbation:38,hcodeRateProbation:28};
const context={agencyId:6,userId:9000,periodStart:'2026-11-21',periodEnd:'2026-12-04',enrollment:{effective_start:'2026-11-21'}};
beforeEach(()=>{vi.clearAllMocks();agencies=[{id:6,slug:'nlu'}];prior=[];user={completed_at:null,is_demo:0};existing=[];salary=[];m.agreement.mockResolvedValue({effectiveOn:'2026-11-21',data:{schedule:{...rates}}});m.execute.mockImplementation(async sql=>{
 if(sql.startsWith('SELECT completed_at'))return [[user]];
 if(sql.includes('FROM user_activity_log'))return [prior];
 if(sql.includes('JOIN user_agencies'))return [agencies];
 if(sql.startsWith('SELECT user_id FROM payroll_user_compensation_levels'))return [existing];
 if(sql.startsWith('SELECT slug'))return [[agencies[0]]];
 if(sql.includes('FROM payroll_salary_positions'))return [salary];
 return [{affectedRows:1}];
});});
it.each(['ACTIVE_EMPLOYEE','PENDING_SETUP','INACTIVE_EMPLOYEE','ARCHIVED'])('never enrolls current or reactivated staff from %s',async status=>{expect(await enrollCompletedFutureHire({db:m,userId:193,before:{status}})).toEqual([]);expect(m.execute).not.toHaveBeenCalled();});
it('enrolls a first completed hire at all three agencies without enabling existing staff or changing rates',async()=>{agencies=[{id:2,slug:'itsco'},{id:6,slug:'nlu'},{id:377,slug:'tisi'}];expect(await enrollCompletedFutureHire({db:m,userId:9000,before:{status:'ONBOARDING'},actorUserId:501})).toEqual([2,6,377]);const writes=m.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql));expect(writes).toHaveLength(3);expect(writes.every(([sql])=>sql.startsWith('INSERT IGNORE INTO payroll_future_hire_enrollments'))).toBe(true);expect(writes[0][1]).toEqual([2,9000,501]);});
it('preserves a previous explicit payroll enrollment or opt-out',async()=>{existing=[{user_id:9000}];expect(await enrollCompletedFutureHire({db:m,userId:9000,before:{status:'ONBOARDING'}})).toEqual([]);expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);});
it.each(['completed','audit','demo'])('excludes prior hires and demo accounts: %s',async kind=>{if(kind==='completed')user.completed_at='2026-10-01';if(kind==='audit')prior=[{id:1}];if(kind==='demo')user.is_demo=1;expect(await enrollCompletedFutureHire({db:m,userId:9000,before:{status:'ONBOARDING'}})).toEqual([]);expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);});
it('keeps pre-enrollment periods unchanged',async()=>{expect(await futureHirePayContext({...context,periodEnd:'2026-11-20'},m)).toMatchObject({enabled:false,notYetEffective:true});expect(m.agreement).not.toHaveBeenCalled();});
it('blocks missing signed or explicitly authorized pay terms',async()=>{m.agreement.mockResolvedValue(null);await expect(futureHirePayContext(context,m)).rejects.toThrow('executed or individually authorized');});
it('does not infer rates from an individual free-text contract',async()=>{m.agreement.mockResolvedValue({data:{schedule:{compensationBasis:'approved_individual_agreement',serviceTerms:{tutoring:{compensationTerms:'Approved offer'}}}}});await expect(futureHirePayContext(context,m)).rejects.toThrow('reviewed numeric pay terms');});
it('keeps NLU category four distinct from ITSCO category three',async()=>{m.agreement.mockResolvedValue({data:{schedule:{...rates,category:4}}});expect((await futureHirePayContext(context,m)).assignment.category).toBe(4);agencies=[{slug:'itsco'}];await expect(futureHirePayContext(context,m)).rejects.toThrow('approved category and level');});
it('blocks salary overlaps before pay is calculated',async()=>{salary=[{id:1}];await expect(futureHirePayContext(context,m)).rejects.toThrow('salary excluding service pay');});
it('supports explicitly reviewed individual ISI rates without a shared matrix or invented category',async()=>{agencies=[{id:377,slug:'tisi'}];const schedule={...rates,category:null,level:null,compensationBasis:'approved_individual_agreement',individualPaySystemApproved:true,autoIndirectMinutes:0,leaveAdminRatio:0};for(const k of ['tierBonusFfs','tierBonusHcode','spanishBonus','locationBonus'])schedule[k]={1:0,2:0,3:0};m.agreement.mockResolvedValue({data:{schedule}});expect(await futureHirePayContext({...context,agencyId:377},m)).toMatchObject({individual:true,assignment:{category:null,level:null,pay_system_enabled:1}});expect(m.execute.mock.calls.some(([sql])=>sql.includes('payroll_pay_system_rates'))).toBe(false);delete schedule.individualPaySystemApproved;await expect(futureHirePayContext({...context,agencyId:377},m)).rejects.toThrow('payroll approval');});
it('propagates enrollment write failures so the enclosing account transaction rolls back',async()=>{const priorImpl=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.startsWith('INSERT')?Promise.reject(Error('write failed')):priorImpl(sql,args));await expect(enrollCompletedFutureHire({db:m,userId:9000,before:{status:'ONBOARDING'}})).rejects.toThrow('write failed');});

it('accepts explicitly nonclinical NLU agreements with intentionally unset clinical rates',async()=>{
 const schedule={...rates,category:1,nluCompensationPolicyVersion:'nlu-four-category-2026-11-21',clinicalEligible:false,creditRate:null,hcodeRate:null,creditRateProbation:null,hcodeRateProbation:null};
 m.agreement.mockResolvedValue({data:{schedule}});
 expect((await futureHirePayContext(context,m)).assignment.category).toBe(1);
 schedule.creditRate=40;await expect(futureHirePayContext(context,m)).rejects.toThrow('reviewed numeric pay terms');
 schedule.creditRate=null;delete schedule.nluCompensationPolicyVersion;await expect(futureHirePayContext(context,m)).rejects.toThrow('reviewed numeric pay terms');
});
