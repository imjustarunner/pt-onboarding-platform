import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../guardianWorkspace.service.js',()=>({guardianWorkspace:vi.fn()}));
vi.mock('../clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn()}));
vi.mock('../../models/GuardianInsuranceProfile.model.js',()=>({decodeInsuranceProfile:vi.fn()}));
vi.mock('../familyLedger/policy.js',()=>({requireBillingStaff:vi.fn()}));
vi.mock('../clientBillingAccount.service.js',()=>({clientBillingAccount:vi.fn()}));
vi.mock('../familyLedger/views.js',()=>({listBalances:vi.fn()}));
import {guardianFinancialWorkspace,insuranceSummary} from '../guardianFinancialWorkspace.service.js';
const actor={id:7,role:'admin'},input={actor,guardianId:20};let d;
beforeEach(()=>{
 d={cards:vi.fn(async()=>[{id:9,card_brand:'Visa',card_last4:'4242',stripe_payment_method_id:'private-method-id'}]),workspace:vi.fn(async()=>({clients:[{client_id:4,agency_id:2,full_name:'Synthetic Client',agency_name:'Practice'}]})),support:vi.fn(),insurance:vi.fn(async()=>({primary:{insurerName:'Synthetic Insurance',memberId:'SECRET-12345678',subscriberName:'Parent',cardFrontUrl:'private-card-path'}})),billing:vi.fn(),account:vi.fn(async()=>({responsibleParty:{kind:'account',userId:20,contact:{fullName:'Parent',address:'1 Test Lane'}}})),balances:vi.fn(async()=>[{payerUserId:20,dueCents:2500},{payerUserId:21,dueCents:9000}]),decode:vi.fn(row=>row),db:{execute:vi.fn(async()=>[[{status:'active'}]])}};
});
it('reads saved insurance, masks identifiers and distinguishes the actual responsible payer',async()=>{
 const result=await guardianFinancialWorkspace(input,d);
 expect(result.clients[0]).toMatchObject({insurance:{state:'recorded',source:'chart',policies:[{memberLastFour:'5678',subscriberName:'Parent'}]},billing:{isResponsibleParty:true,payerStatus:'active',dueCents:2500}});
 expect(JSON.stringify(result)).not.toContain('SECRET-12345678');expect(JSON.stringify(result)).not.toContain('private-card-path');expect(JSON.stringify(result)).not.toContain('private-method-id');expect(result.clients[0].billing.paymentMethods[0]).toMatchObject({brand:'Visa',lastFour:'4242'});
 expect(d.insurance).toHaveBeenCalledExactlyOnceWith(4,2);expect(d.workspace).toHaveBeenCalledWith(input,{includeBalances:false});
});
it('falls back only to an insurance submission bound to this client and labels it unreviewed',async()=>{
 d.insurance.mockResolvedValue(null);d.db.execute.mockImplementation(async(sql,args)=>sql.includes('guardian_insurance_profiles')?[[{primary_insurer_name:'Submitted Policy',primary_member_id:'12345678'}]]:[[{}]]);
 const result=await guardianFinancialWorkspace(input,d);expect(result.clients[0].insurance).toMatchObject({source:'submitted',state:'recorded',policies:[{insurerName:'Submitted Policy',memberLastFour:'5678'}]});
 expect(d.db.execute.mock.calls[0][1]).toEqual([2,4,4]);
});
it('shows a read failure as unavailable rather than claiming insurance does not exist',async()=>{
 d.insurance.mockRejectedValue(new Error('Database unavailable'));const result=await guardianFinancialWorkspace(input,d);
 expect(result.clients[0].insurance.state).toBe('unavailable');expect(result.clients[0].insurance.message).toContain('could not be loaded');
});
it('does not infer responsibility from the guardian role or expose billing without permission',async()=>{
 d.account.mockResolvedValue({responsibleParty:{kind:'account',userId:21,contact:{fullName:'Other payer'}}});
 expect((await guardianFinancialWorkspace(input,d)).clients[0].billing.isResponsibleParty).toBe(false);
 d.billing.mockRejectedValue(Object.assign(new Error('denied'),{status:403}));d.account.mockClear();d.balances.mockClear();
 expect((await guardianFinancialWorkspace(input,d)).clients[0].billing.available).toBe(false);expect(d.account).not.toHaveBeenCalled();expect(d.balances).not.toHaveBeenCalled();
});
it('never reads private data before the workspace scope check succeeds',async()=>{
 d.workspace.mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));await expect(guardianFinancialWorkspace(input,d)).rejects.toMatchObject({status:403});expect(d.insurance).not.toHaveBeenCalled();expect(d.account).not.toHaveBeenCalled();
});
it('does not turn an empty policy object into recorded coverage',()=>{expect(insuranceSummary({primary:{}}).state).toBe('missing');});
