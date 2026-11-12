import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import {validateIntakeBilling} from '../intakeBillingValidation.service.js';
const input=info=>({agencyId:450,submission:{id:1},link:{inherits_office_master:1,intake_steps:[{type:'insurance_info'}]},intakeData:{responses:{submission:{insuranceInfo:{isSelfPay:true,...info},paymentInfo:{skipAcknowledged:true,requiresPaymentFollowup:true}}}}});
beforeEach(()=>pool.execute.mockReset());
it.each([{}, {authorizationAgreed:true},{authorizationSignature:'QA Parent'},{authorizationAgreed:false,authorizationSignature:'QA Parent'}])('rejects incomplete self-pay authorization before checking card availability: %j',async info=>{await expect(validateIntakeBilling(input(info))).rejects.toMatchObject({status:400});expect(pool.execute).not.toHaveBeenCalled();});
it('allows payment follow-up when the authorization is complete and card collection is unavailable',async()=>{pool.execute.mockResolvedValue([[]]);await validateIntakeBilling(input({authorizationAgreed:true,authorizationSignature:'QA Parent'}));expect(pool.execute).toHaveBeenCalledTimes(1);});
it('preserves the standalone school signature flow that does not display a checkbox',async()=>{const data=input({authorizationSignature:'QA Parent'});data.link={scope_type:'school',intake_steps:[{type:'insurance_info'}]};await validateIntakeBilling(data);expect(pool.execute).not.toHaveBeenCalled();});
it('rejects a cleared school agreement until the new explicit signature also records agreement', async () => {
  const data = input({ authorizationAgreed: false, authorizationSignature: 'QA New Signature' });
  data.link = { scope_type: 'school', intake_steps: [{ type: 'insurance_info' }] };
  await expect(validateIntakeBilling(data)).rejects.toMatchObject({ status: 400 });
  data.intakeData.responses.submission.insuranceInfo.authorizationAgreed = true;
  await expect(validateIntakeBilling(data)).resolves.toBeUndefined();
  expect(pool.execute).not.toHaveBeenCalled();
});
it('rejects duplicate child Medicaid IDs and accepts the corrected, independently assigned IDs', async () => {
  vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 4).toString('base64'));
  try {
    const info = { primary: { insurerName: 'Medicaid', memberId: 'QA-ONE', isMedicaid: true },
      authorizationAgreed: true, authorizationSignature: 'QA Parent',
      medicaidByClient: [{ clientIndex: 0, memberId: 'QA-ONE' }, { clientIndex: 1, memberId: 'QA-ONE' }] };
    const data = { agencyId: 450, submission: { id: 1 }, link: { scope_type: 'school', intake_steps: [{ type: 'insurance_info' }] },
      intakeData: { clients: [{}, {}], responses: { submission: { insuranceInfo: info } } } };
    await expect(validateIntakeBilling(data)).rejects.toMatchObject({ status: 400, message: 'Each client must have their own Medicaid member ID.' });
    info.medicaidByClient[1].memberId = 'QA-TWO';
    await expect(validateIntakeBilling(data)).resolves.toBeUndefined();
    expect(pool.execute).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});
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

it.each(['agency','school'])('rejects duplicate Medicaid IDs at finalization for %s forms even without card collection',async scope=>{
 vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,4).toString('base64'));
 try {
 const info={primary:{insurerName:'Commercial',memberId:'SHARED'},secondary:{insurerName:'Medicaid',isMedicaid:true},medicaidPlanPosition:'secondary',authorizationAgreed:true,authorizationSignature:'QA Parent',coverageScope:'account_holder',clientCoverages:[{clientIndex:0,confirmed:true},{clientIndex:1,confirmed:true}],medicaidByClient:[{clientIndex:0,memberId:'SAME'},{clientIndex:1,memberId:' same '}]};
 const data={agencyId:450,submission:{id:1},link:{scope_type:scope,inherits_office_master:scope==='agency'?1:0,intake_steps:[{type:'insurance_info',paymentRequired:false}]},intakeData:{responses:{clients:[{},{}],submission:{insuranceInfo:info}}}};
 await expect(validateIntakeBilling(data)).rejects.toMatchObject({status:400,message:'Each client must have their own Medicaid member ID.'});
 info.medicaidByClient[1].memberId='DISTINCT';
 await expect(validateIntakeBilling(data)).resolves.toBeUndefined();
 expect(pool.execute).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();}
});

it('validates every identifying child even when questionnaire response rows are incomplete',async()=>{
 vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,4).toString('base64'));
 try {
 const data=input({isSelfPay:false,authorizationAgreed:true,authorizationSignature:'QA Parent',primary:{insurerName:'Medicaid',isMedicaid:true},medicaidByClient:[{clientIndex:0,memberId:'SAME'},{clientIndex:1,memberId:'SAME'}]});
 data.intakeData.clients=[{firstName:'One'},{firstName:'Two'}];
 data.intakeData.responses.clients=[{}];
 await expect(validateIntakeBilling(data)).rejects.toMatchObject({status:400,message:'Each client must have their own Medicaid member ID.'});
 expect(pool.execute).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();}
});

it('uses server-approved existing coverage without validating stale shared policy fields as a new sibling policy',async()=>{
 const data={agencyId:450,submission:{id:303},insuranceOnFileApproved:true,link:{scope_type:'school',intake_steps:[{type:'insurance_info'}]},intakeData:{clients:[{id:201},{id:202}],responses:{submission:{insuranceInfo:{useInsuranceOnFile:true,primary:{insurerName:'Medicaid',isMedicaid:true},authorizationAgreed:false,medicaidByClient:[]}}}}};
 await expect(validateIntakeBilling(data)).resolves.toBeUndefined();expect(pool.execute).not.toHaveBeenCalled();
});
it('does not permit a browser-supplied on-file marker when the invited server binding did not approve all children',async()=>{
 const data=input({useInsuranceOnFile:true,authorizationAgreed:true,authorizationSignature:'QA Parent'});
 await expect(validateIntakeBilling(data)).rejects.toMatchObject({status:400,message:'The care team must verify the insurance on file before this section can be skipped.'});expect(pool.execute).not.toHaveBeenCalled();
});

it('rejects a string on-file marker even with a valid bound invitation instead of bypassing policy validation',async()=>{
 const data=input({useInsuranceOnFile:'true',isSelfPay:false,primary:{insurerName:'Medicaid'}});data.insuranceOnFileApproved=true;
 await expect(validateIntakeBilling(data)).rejects.toMatchObject({status:400});expect(pool.execute).not.toHaveBeenCalled();
});
