import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),insuranceDemographics:vi.fn()}));
vi.mock('../claimMdBillingProfile.service.js',()=>({listClaimMdBillingProfiles:vi.fn()}));
vi.mock('../insuranceVerificationTask.service.js',()=>({queueInsuranceVerificationSafely:vi.fn()}));
vi.mock('../syntheticClearinghouseGuard.service.js',()=>({assertLiveClearinghouseAgency:vi.fn()}));
vi.mock('../familyBillingPolicy.service.js',()=>({auditBilling:vi.fn(),billingError:(status,message)=>Object.assign(new Error(message),{status})}));
import {cobFingerprint,validateCobConfirmation,stediCobPayload,cobFindings} from '../stediCobPolicy.js';
import {reserveCob,startCob,callStediCob,getCobPayer,cobPayers,reviewCob,stediCobConfigured,decodeCob} from '../stediCob.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
const patient={firstName:'Synthetic',lastName:'Person',dateOfBirth:'2000-01-02',addressLine1:'123 Test St',city:'Testville',state:'CO',postalCode:'80000'};
const insurance={verifiedForClaims:true,patient,primary:{insurerName:'Synthetic Payer',memberId:'ABC-0001',payerId:'CLAIMMD',relationshipToSubscriber:'self',subscriberFirstName:patient.firstName,subscriberLastName:patient.lastName,subscriberDob:patient.dateOfBirth}};
const snapshot={patient,insurance};
const payer={stediId:'TESTS',primaryPayerId:'00540',displayName:'Synthetic Payer',transactionSupport:{coordinationOfBenefits:'SUPPORTED'}};
const office={id:7,practice_npi:'1306688650',practice_name:'Synthetic Practice'};
const input=()=>({agencyId:2,clientId:9,actorUserId:1,requestKey:'synthetic-request-123',fingerprint:cobFingerprint(snapshot),slot:'primary',stediPayerId:'TESTS',serviceDate:'2026-11-10',billingOfficeId:7,reason:'billing_order_unclear',nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,policyConfirmed:true,payerConfirmed:true,costConfirmed:true});
const request=()=>({snapshot,slot:'primary',payer,payload:stediCobPayload(input(),snapshot,office,payer)});
const row=()=>({id:1,agency_id:2,client_id:9,status:'sending',created_at:new Date('2026-11-10T00:00:00Z'),request_encrypted:encryptFamilyBilling(request(),'stedi-cob:2:9')});
const response=()=>({subscriber:{...patient,memberId:'ABC-0001'},coordinationOfBenefits:{classification:'MemberFoundNoCob',coverageOverlap:false,benefitOverlap:false,instanceExists:false,primacyDetermined:false},benefitsInformation:[{code:'1'}],futureField:{retained:'yes'}});
beforeEach(()=>{vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,9).toString('base64'));});
it('requires saved verified policy, exact identity, all confirmations and a service date in the allowed range',()=>{
 const now=new Date('2026-11-11T03:00:00Z');expect(()=>validateCobConfirmation(input(),snapshot,now)).not.toThrow();
 for(const key of ['nameConfirmed','birthdateConfirmed','addressConfirmed','policyConfirmed','payerConfirmed','costConfirmed'])expect(()=>validateCobConfirmation({...input(),[key]:false},snapshot,now)).toThrow('Confirm');
 for(const change of [{serviceDate:'2026-11-11'},{serviceDate:'2024-11-09'},{serviceDate:'2026-02-30'},{fingerprint:'stale'},{slot:'tertiary'},{stediPayerId:'00540'},{reason:'routine'},{freshSearch:true}])expect(()=>validateCobConfirmation({...input(),...change},snapshot,now)).toThrow();
 for(const change of [{verifiedForClaims:false},{primary:{...insurance.primary,memberId:''}},{primary:{...insurance.primary,subscriberFirstName:'Another'}},{primary:{...insurance.primary,effectiveDate:'2026-11-11'}}]){
  const changed={...snapshot,insurance:{...insurance,...change}};expect(()=>validateCobConfirmation({...input(),fingerprint:cobFingerprint(changed)},changed,now)).toThrow();
 }
 expect(()=>validateCobConfirmation({...input(),freshSearch:true,repeatReason:'Corrected information from client'},snapshot,now)).not.toThrow();
});
it('builds the exact COB payload with ISO dates and leading-zero payer IDs, without SSNs or address',()=>{
 const payload=stediCobPayload(input(),snapshot,office,payer);expect(payload).toEqual({tradingPartnerServiceId:'00540',provider:{npi:'1306688650',organizationName:'Synthetic Practice'},subscriber:{firstName:'Synthetic',lastName:'Person',dateOfBirth:'2000-01-02',memberId:'ABC-0001'},encounter:{dateOfService:'2026-11-10',serviceTypeCode:'30'}});
 const dependent={...snapshot,insurance:{...insurance,primary:{...insurance.primary,relationshipToSubscriber:'child',subscriberFirstName:'Parent',subscriberDob:'1970-01-01'}}};
 expect(stediCobPayload(input(),dependent,office,payer)).toMatchObject({subscriber:{firstName:'Parent',dateOfBirth:'1970-01-01'},dependent:{firstName:'Synthetic',dateOfBirth:'2000-01-02'}});
 for(const p of [{...payer,transactionSupport:{coordinationOfBenefits:'NOT_SUPPORTED'}},{...payer,primaryPayerId:540},{...payer,stediId:'OTHER'}])expect(()=>stediCobPayload(input(),snapshot,office,p)).toThrow();
 expect(()=>stediCobPayload(input(),snapshot,{...office,practice_name:''},payer)).toThrow();
});
it('only completes an exact, active, consistent no-overlap result automatically and never erases recorded other insurance',()=>{
 expect(cobFindings(response(),request())).toMatchObject({identityMatches:true,reviewRequired:false});
 const other={...request(),snapshot:{...snapshot,insurance:{...insurance,secondary:{memberId:'OTHER'}}}};
 expect(cobFindings(response(),other).issues.join(' ')).toContain('Another policy is already recorded');
 for(const change of [{subscriber:{...patient,memberId:'WRONG'}},{meta:{applicationMode:'test'}},{planDateInformation:{planBegin:'2026-11-11'}},{errors:[{code:'75'}]},{benefitsInformation:[]},{coordinationOfBenefits:{}},{benefitsInformation:'unexpected'},{errors:{unexpected:true}},{subscriber:{...patient,memberId:'ABC-0001',aaaErrors:[{code:'75'}]}}])expect(cobFindings({...response(),...change},request()).reviewRequired).toBe(true);
});
it('extracts every reported payer and order but never converts proprietary COB IDs to routing IDs',()=>{
 const r={...response(),coordinationOfBenefits:{classification:'CobInstanceExistsPrimacyUndetermined',coverageOverlap:true,instanceExists:true,primacyDetermined:false},benefitsInformation:[{code:'R',serviceTypeCodes:['30'],benefitsRelatedEntities:[{entityIdentification:'PI',entityIdentificationValue:'1006',entityIdentifier:'Primary Payer',entityName:'Other Payer'},{entityIdentification:'MI',entityIdentificationValue:'OTHER-MEMBER',entityFirstname:'Synthetic',entityLastname:'Person'}]}]};
 const assessment=cobFindings(r,request());expect(assessment.reviewRequired).toBe(true);expect(assessment.issues.join(' ')).toContain('could not determine billing order');
 expect(assessment.findings[0]).toMatchObject({reportedPayerId:'1006',order:'primary',memberId:'OTHER-MEMBER',policy:{payerId:'',eligibilityPayerId:''}});
 const dependent={...request(),payload:{...request().payload,dependent:{...patient,firstName:'Child'}}};expect(cobFindings(response(),dependent).identityMatches).toBe(false);
});
function fakeDb({duplicate=null,pending=null,saved=null}={}){return {beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
 if(sql.includes('SELECT id FROM clients'))return [[{id:9}]];
 if(sql.includes('request_key=?'))return [[...(duplicate?[duplicate]:[])]];
 if(sql.includes('SELECT id FROM stedi'))return [[...(pending?[pending]:[])]];
 if(sql.includes('SELECT * FROM stedi'))return [[...(saved?[saved]:[])]];
 if(sql.includes('SELECT d.claimmd_payer_id'))return [[{claimmd_payer_id:'CLAIMMD'}]];
 return [{insertId:1,affectedRows:1}];
})};}
const depsFor=db=>({pool:{getConnection:async()=>db},snapshotFor:async()=>snapshot,offices:async()=>[office],audit:vi.fn(),payer});
it('durably reserves an encrypted request scoped to actor and policy before a paid transmission',async()=>{
 const db=fakeDb(),result=await reserveCob(input(),depsFor(db));expect(result.reused).toBe(false);expect(db.commit).toHaveBeenCalledOnce();
 const args=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO stedi_insurance'))[1];expect(args.slice(0,3)).toEqual([2,9,1]);expect(args.at(-1)).not.toContain('Synthetic');
 expect(decryptFamilyBilling(args.at(-1),'stedi-cob:2:9').snapshot).toEqual(snapshot);expect(()=>decryptFamilyBilling(args.at(-1),'stedi-cob:6:9')).toThrow();
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('request_key=?'))[0]).toContain("request_kind='cob'");
});
it('reuses duplicate requests, blocks unresolved COB, and requires a valid owned office without spending',async()=>{
 const db=fakeDb({duplicate:row()});expect((await reserveCob(input(),depsFor(db))).reused).toBe(true);expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO stedi_insurance'))).toBe(false);
 for(const [request,db] of [[input(),fakeDb({pending:{id:3}})],[{...input(),billingOfficeId:999},fakeDb()],[{...input(),costConfirmed:false},fakeDb()]]){await expect(reserveCob(request,depsFor(db))).rejects.toThrow();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO stedi_insurance'))).toBe(false);}
});
it('requires an explicit enabled connection in an authorized agency',()=>{
 vi.stubEnv('STEDI_API_KEY','synthetic');vi.stubEnv('STEDI_COB_ENABLED','false');expect(stediCobConfigured(2)).toBe(false);vi.stubEnv('STEDI_COB_ENABLED','true');expect(stediCobConfigured(377)).toBe(true);expect(stediCobConfigured(9)).toBe(false);
});
it('never retries an ambiguous paid POST and retains the hold until reconciliation',async()=>{
 const call=vi.fn().mockRejectedValue(new Error('timeout')),db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])},queueFollowUp=vi.fn();
 const deps={configured:()=>true,getPayer:async()=>payer,reserve:async()=>({row:row(),payload:{},reused:false}),db,call,queueFollowUp};
 expect(await startCob(input(),deps)).toMatchObject({status:'unknown',reviewRequired:true});expect(call).toHaveBeenCalledOnce();expect(queueFollowUp).toHaveBeenCalledWith(expect.objectContaining({reason:'cob_unresolved'}));
 expect(await startCob(input(),{...deps,reserve:async()=>({row:{...row(),status:'unknown',review_required:1},reused:true})})).toMatchObject({reused:true});expect(call).toHaveBeenCalledOnce();
});
it('retains future fields encrypted in the billing profile and flags errors without extra paid calls',async()=>{
 const r={...response(),errors:[{code:'75'}]},db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])},queueFollowUp=vi.fn();
 const result=await startCob(input(),{configured:()=>true,getPayer:async()=>payer,reserve:async()=>({row:row(),payload:{}}),call:async()=>r,db,queueFollowUp});expect(result.response).toEqual(r);expect(result.reviewRequired).toBe(true);expect(queueFollowUp).toHaveBeenCalledOnce();
 expect(decryptFamilyBilling(db.execute.mock.calls[0][1][0],'stedi-cob:2:9')).toEqual(r);
});
it('uses only fixed origins, bounded JSON and no redirects or automatic transport retries',async()=>{
 vi.stubEnv('STEDI_API_KEY','synthetic-key');const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(response()),{status:200}));expect(await callStediCob(request().payload,{fetch})).toEqual(response());expect(fetch).toHaveBeenCalledWith('https://healthcare.us.stedi.com/2024-04-01/coordination-of-benefits',expect.objectContaining({method:'POST',redirect:'error'}));
 const rejected=vi.fn().mockResolvedValue(new Response('private-error',{status:403}));expect(await callStediCob({}, {fetch:rejected})).toEqual({httpError:{status:403,body:'private-error'}});expect(rejected).toHaveBeenCalledOnce();
 await expect(getCobPayer('../../x',{fetch})).rejects.toThrow();
});
it('flags a late result when saved policy details changed, while allowing unchanged clean results to complete',async()=>{
 const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])},queueFollowUp=vi.fn(),base={configured:()=>true,getPayer:async()=>payer,reserve:async()=>({row:row(),payload:request().payload}),call:async()=>response(),db,queueFollowUp};
 expect(await startCob(input(),{...base,snapshotFor:async()=>snapshot})).toMatchObject({status:'clear',reviewRequired:false});expect(queueFollowUp).not.toHaveBeenCalled();
 const changed=await startCob(input(),{...base,snapshotFor:async()=>({...snapshot,insurance:{...insurance,secondary:{memberId:'OTHER'}}})});expect(changed.reviewRequired).toBe(true);expect(changed.assessment.issues.join(' ')).toContain('changed while this check');expect(queueFollowUp).toHaveBeenCalledOnce();
});
it('looks up payer participation using only the saved insurer, and fails closed on unsupported payers',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[{payer},{payer:{...payer,stediId:'OTHER',transactionSupport:{coordinationOfBenefits:'NOT_SUPPORTED'}}}]}),{status:200}));
 const r=await cobPayers({...input(),query:'PRIVATE PATIENT'}, {...depsFor(fakeDb()),configured:()=>true,fetch});expect(r.payers).toHaveLength(1);expect(fetch.mock.calls[0][0]).toContain('query=Synthetic+Payer');expect(fetch.mock.calls[0][0]).not.toContain('PRIVATE');
});
it('requires a documented resolution, tenant-scoped record and safe saved payer order',async()=>{
 const values={...input(),id:1,portalChecked:true,coverageRecorded:true,billingOrderConfirmed:true,reference:'Confirmed with payer reference 123',decisions:[]};
 await expect(reviewCob({...values,portalChecked:false},depsFor(fakeDb()))).rejects.toThrow('Confirm payer');
 await expect(reviewCob(values,{...depsFor(fakeDb()),readInsurance:async()=>insurance})).rejects.toMatchObject({status:404});
 const db=fakeDb({saved:{...row(),status:'unknown',review_required:1}});
 await expect(reviewCob(values,{...depsFor(db),readInsurance:async()=>({...insurance,primary:{...insurance.primary,isMedicaid:true},secondary:{memberId:'OTHER'}})})).rejects.toThrow('Medicaid');
 expect(await reviewCob(values,{...depsFor(db),readInsurance:async()=>insurance})).toMatchObject({status:'reconciled',reviewRequired:false});
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('SELECT * FROM stedi'))[1]).toEqual([1,2,9]);
});
