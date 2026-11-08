import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import {validateIntakeBilling} from '../intakeBillingValidation.service.js';
const input=info=>({agencyId:450,submission:{id:1},link:{inherits_office_master:1,intake_steps:[{type:'insurance_info'}]},intakeData:{responses:{submission:{insuranceInfo:{isSelfPay:true,...info},paymentInfo:{skipAcknowledged:true,requiresPaymentFollowup:true}}}}});
beforeEach(()=>pool.execute.mockReset());
it.each([{}, {authorizationAgreed:true},{authorizationSignature:'QA Parent'},{authorizationAgreed:false,authorizationSignature:'QA Parent'}])('rejects incomplete self-pay authorization before checking card availability: %j',async info=>{await expect(validateIntakeBilling(input(info))).rejects.toMatchObject({status:400});expect(pool.execute).not.toHaveBeenCalled();});
it('allows payment follow-up when the authorization is complete and card collection is unavailable',async()=>{pool.execute.mockResolvedValue([[]]);await validateIntakeBilling(input({authorizationAgreed:true,authorizationSignature:'QA Parent'}));expect(pool.execute).toHaveBeenCalledTimes(1);});
it('preserves the standalone school signature flow that does not display a checkbox',async()=>{const data=input({authorizationSignature:'QA Parent'});data.link={scope_type:'school',intake_steps:[{type:'insurance_info'}]};await validateIntakeBilling(data);expect(pool.execute).not.toHaveBeenCalled();});
const school=info=>({agencyId:450,submission:{id:1},link:{scope_type:'school',intake_steps:[{type:'insurance_info'}]},intakeData:{responses:{submission:{insuranceInfo:{...info}}}}});
it('lets a school family finish self-pay without a signature when the step showed none',async()=>{
  await validateIntakeBilling(school({isSelfPay:true,authorizationSourceMethod:'self_pay',primary:{insurerName:'Self-Pay',memberId:''}}));
  expect(pool.execute).not.toHaveBeenCalled();
});
it.each([
  {isSelfPay:true,primary:{insurerName:'Self-Pay'}},
  {isSelfPay:false,authorizationSourceMethod:'self_pay',primary:{insurerName:'Aetna'}},
  {isSelfPay:true,authorizationSourceMethod:'self_pay',primary:{insurerName:'Self-Pay',memberId:'ABC123'}},
  {isSelfPay:true,authorizationSourceMethod:'self_pay',primary:{insurerName:'Self-Pay',isMedicaid:true}}
])('still requires the authorization signature for anything but plain self-pay: %j',async info=>{
  await expect(validateIntakeBilling(school(info))).rejects.toMatchObject({status:400});
});
it('keeps requiring the agreement on office self-pay even with the school marker',async()=>{
  await expect(validateIntakeBilling(input({authorizationSourceMethod:'self_pay'}))).rejects.toMatchObject({status:400});
});
it.each(['later', 'na'])('honors the offered clinical %s choice with an active processor', async choice => {
  pool.execute.mockResolvedValue([[{ stripe_connect_account_id: 'acct_synthetic' }]]);
  const data = input({ authorizationAgreed: true, authorizationSignature: 'QA Parent' });
  data.intakeData.responses.submission.paymentInfo.paymentChoice = choice;
  await expect(validateIntakeBilling(data)).resolves.toBeUndefined();
  expect(pool.execute).not.toHaveBeenCalled();
});
it('does not use clinical deferral to bypass a required nonclinical payment', async () => {
  pool.execute.mockResolvedValueOnce([[{ stripe_connect_account_id: 'acct_synthetic' }]]).mockResolvedValueOnce([[]]);
  const data = input({ authorizationAgreed: true, authorizationSignature: 'QA Parent' });
  data.link.master_channel = 'tutoring'; data.link.intake_steps[0].paymentOnly = true;
  data.intakeData.responses.submission.paymentInfo.paymentChoice = 'later';
  await expect(validateIntakeBilling(data)).rejects.toMatchObject({ status: 409 });
});
