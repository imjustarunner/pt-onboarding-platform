import {readFileSync} from 'node:fs';import {expect,it,vi} from 'vitest';
import {assertIntakeCardCollectionAllowed} from '../../utils/intakeCardCollectionPolicy.js';
import {enrollmentCoverageFingerprint} from '../../../../frontend/src/navigation/enrollmentCoveragePolicy.js';
const source=readFileSync(new URL('../publicIntake.controller.js',import.meta.url),'utf8');
const earlyCode=source.slice(source.indexOf('const ensureEarlyGuardianForPayment ='),source.indexOf('\n/**\n * GET /:publicKey/packages',source.indexOf('const ensureEarlyGuardianForPayment =')));
function early(){const users={10:{id:10,role:'client_guardian',email:'testing+first@itsco.health'},20:{id:20,role:'client_guardian',email:'testing+second@itsco.health'}};
 const deps={User:{findById:vi.fn(async id=>users[id]),findByEmail:vi.fn(async email=>Object.values(users).find(u=>u.email===email)),create:vi.fn()},IntakeSubmission:{updateById:vi.fn()},validateQaIntakeGuardian:vi.fn()};
 return {...deps,run:new Function(...Object.keys(deps),`${earlyCode};return ensureEarlyGuardianForPayment;`)(...Object.values(deps))};
}
it('binds email edits and reversions to each exact guardian without changing an existing account identity',async()=>{
 const t=early(),submission={id:7,status:'draft',guardian_user_id:10,intake_data:{guardian:{email:'testing+second@itsco.health',firstName:'Reviewed',lastName:'Person'}}};
 expect(await t.run(submission,{},450)).toMatchObject({guardianUserId:20,guardianName:'Reviewed Person',guardianEmail:'testing+second@itsco.health'});
 expect(t.IntakeSubmission.updateById).toHaveBeenLastCalledWith(7,{guardian_user_id:20});expect(t.User.create).not.toHaveBeenCalled();
 submission.guardian_user_id=20;submission.intake_data.guardian.email='testing+first@itsco.health';expect(await t.run(submission,{},450)).toHaveProperty('guardianUserId',10);expect(t.IntakeSubmission.updateById).toHaveBeenLastCalledWith(7,{guardian_user_id:10});
});
it('preserves completed submissions instead of rebinding a historical owner',async()=>{
 const t=early();await expect(t.run({id:7,status:'submitted',guardian_user_id:10,intake_data:{guardian:{email:'testing+second@itsco.health'}}},{},450)).rejects.toHaveProperty('status',403);expect(t.IntakeSubmission.updateById).not.toHaveBeenCalled();expect(t.User.create).not.toHaveBeenCalled();
});
const contextCode=source.slice(source.indexOf('async function assertIntakeCardContext('),source.indexOf('\nexport const getStripeConfig',source.indexOf('async function assertIntakeCardContext(')));
function context(){const deps={CoGuardianInvite:{resolveCoGuardianResumeBinding:vi.fn(async()=>({clients:[{id:55}]}))},IntakeSubmissionClient:{listBySubmissionId:vi.fn(async()=>[])},assertQaStripeTestMode:vi.fn(),readClientInsurance:vi.fn(async()=>({primary:{insurerName:'Commercial'}})),assertIntakeCardCollectionAllowed};return {...deps,run:new Function(...Object.keys(deps),`${contextCode};return assertIntakeCardContext;`)(...Object.values(deps))};}
it('resolves stored coverage only through saved invitation/client bindings and ignores forged IDs',async()=>{
 const t=context(),info={useInsuranceOnFile:true},sub={id:7,session_token:'synthetic-session',co_guardian_invite_id:28,intake_data:{responses:{submission:{insuranceInfo:info}}}};
 await t.run({params:{publicKey:'qa'},body:{coverageReviewed:true,coverageFingerprint:enrollmentCoverageFingerprint(info),clientIds:[999],insuranceOnFile:{primary:{isMedicaid:false}}}},{},sub,450);
 expect(t.readClientInsurance).toHaveBeenCalledExactlyOnceWith(55,450);
 t.readClientInsurance.mockResolvedValue({primary:{insurerName:'Commercial'},secondary:{isMedicaid:true}});
 await expect(t.run({params:{publicKey:'qa'},body:{coverageReviewed:true,coverageFingerprint:enrollmentCoverageFingerprint(info)}},{},sub,450)).rejects.toThrow(/Medicaid/);
});
it.each(['createStripeSetupIntent','saveGuardianPaymentCard'])('%s stops Medicaid requests before provisioning or a Stripe setup/save call',async name=>{
 const start=source.indexOf(`export const ${name} =`),end=source.indexOf('\nexport const ',start+14),code=source.slice(start,end<0?undefined:end).replace('export const ','const ');
 const info={primary:{isMedicaid:true}},submission={id:7,intake_link_id:1,intake_data:{responses:{submission:{insuranceInfo:info}}}};
 const deps={resolvePublicIntakeContext:vi.fn(async()=>({link:{id:1,is_active:true}})),IntakeSubmission:{findById:vi.fn(async()=>submission)},resolveAgencyIdForLink:vi.fn(async()=>450),assertIntakeCardContext:async req=>assertIntakeCardCollectionAllowed({link:{},submission,reviewed:req.body.coverageReviewed,fingerprint:req.body.coverageFingerprint}),ensureEarlyGuardianForPayment:vi.fn(),getAgencyStripeConnectAccountId:vi.fn(),createFamilyCardSetup:vi.fn(),completeFamilyCardSetup:vi.fn(),BILLING_TERMS:'Existing terms',BILLING_TERMS_VERSION:'unchanged'};
 const handler=new Function(...Object.keys(deps),`${code}\n;return ${name};`)(...Object.values(deps)),res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await handler({params:{publicKey:'qa',submissionId:'7'},body:{coverageReviewed:true,coverageFingerprint:enrollmentCoverageFingerprint(info)},get:()=>'',ip:'127.0.0.1'},res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'MEDICAID_CARD_COLLECTION_SUPPRESSED'}));expect(deps.ensureEarlyGuardianForPayment).not.toHaveBeenCalled();expect(deps.getAgencyStripeConnectAccountId).not.toHaveBeenCalled();expect(deps.createFamilyCardSetup).not.toHaveBeenCalled();expect(deps.completeFamilyCardSetup).not.toHaveBeenCalled();
});

it('keeps server-stored Medicaid protection when a caller clears on-file and selects self-pay',async()=>{const t=context(),info={isSelfPay:true,useInsuranceOnFile:false};t.IntakeSubmissionClient.listBySubmissionId.mockResolvedValue([{client_id:55}]);t.readClientInsurance.mockResolvedValue({primary:{insurerName:'Commercial'},secondary:{isMedicaid:true}});await expect(t.run({params:{publicKey:'qa'},body:{coverageReviewed:true,coverageFingerprint:enrollmentCoverageFingerprint(info)}},{},{id:7,intake_data:{insuranceInfo:info}},450)).rejects.toHaveProperty('code','MEDICAID_CARD_COLLECTION_SUPPRESSED');expect(t.assertQaStripeTestMode).not.toHaveBeenCalled();});

it('returns unavailable QA test-mode configuration without looking up a live merchant',async()=>{const start=source.indexOf('export const getStripeConfig ='),end=source.indexOf('\nexport const ',start+14),code=source.slice(start,end).replace('export const ','const ');const deps={resolvePublicIntakeContext:vi.fn(async()=>({link:{id:1,is_active:true,agency_id:450}})),getStripePublishableKey:()=> 'pk_live_fixture',qaStripeCollectionState:vi.fn(async()=>({allowed:false,testModeRequired:true,mode:'live'})),getAgencyStripeConnectAccountId:vi.fn()};const handler=new Function(...Object.keys(deps),`${code}\nreturn getStripeConfig;`)(...Object.values(deps)),res={json:vi.fn(),status:vi.fn().mockReturnThis()},next=vi.fn();await handler({params:{publicKey:'qa'}},res,next);expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({stripeEnabled:false,publishableKey:null,connectedAccountId:null,testModeRequired:true,mode:'live'});expect(deps.getAgencyStripeConnectAccountId).not.toHaveBeenCalled();});
