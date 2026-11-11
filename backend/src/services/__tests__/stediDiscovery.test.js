import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(),insuranceDemographics:vi.fn()}));
vi.mock('../claimMdBillingProfile.service.js',()=>({listClaimMdBillingProfiles:vi.fn()}));
vi.mock('../insuranceVerificationTask.service.js',()=>({queueInsuranceVerificationSafely:vi.fn()}));
vi.mock('../syntheticClearinghouseGuard.service.js',()=>({assertLiveClearinghouseAgency:vi.fn()}));
vi.mock('../familyBillingPolicy.service.js',()=>({auditBilling:vi.fn(),billingError:(status,message)=>Object.assign(new Error(message),{status})}));
import {discoveryPatient,discoveryFingerprint,validateDiscoveryConfirmation,stediDiscoveryPayload,discoveryCandidate,discoveryMonth} from '../stediDiscoveryPolicy.js';
import {reserveDiscovery,startDiscovery,callStediDiscovery,refreshDiscovery,reviewDiscovery,stediDiscoveryConfigured,reconcileUncertainDiscovery} from '../stediDiscovery.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
const patient={firstName:'Synthetic',lastName:'Person',dateOfBirth:'2000-01-02',addressLine1:'123 Test St',addressLine2:'',city:'Testville',state:'CO',postalCode:'80000'};
const input=()=>({agencyId:2,clientId:9,actorUserId:1,requestKey:'synthetic-request-123',fingerprint:discoveryFingerprint(patient),serviceDate:'2026-11-10',nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,costConfirmed:true,reason:'unknown_insurance',billingOfficeId:7,otherCoverageChecked:true});
const row=()=>({id:1,agency_id:2,client_id:9,status:'sending',request_encrypted:encryptFamilyBilling({patient},'stedi-discovery:2:9')});
beforeEach(()=>vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,9).toString('base64')));
it('requires each confirmation, valid dates, a reason, saved identity and address state',()=>{
 expect(()=>validateDiscoveryConfirmation(input(),patient)).not.toThrow();
 for(const key of ['nameConfirmed','birthdateConfirmed','addressConfirmed','costConfirmed'])expect(()=>validateDiscoveryConfirmation({...input(),[key]:false},patient)).toThrow('Confirm');
 for(const change of [{reason:'routine'},{fingerprint:'stale'},{serviceDate:'2026-02-30'},{requestKey:'short'}])expect(()=>validateDiscoveryConfirmation({...input(),...change},patient)).toThrow();
 for(const change of [{dateOfBirth:'2000-02-30'},{firstName:''},{state:''}])expect(()=>validateDiscoveryConfirmation(input(),{...patient,...change})).toThrow();
 const partial={...patient,addressLine1:''},request={...input(),fingerprint:discoveryFingerprint(partial)};
 expect(()=>validateDiscoveryConfirmation(request,partial)).toThrow('explain');
 expect(()=>validateDiscoveryConfirmation({...request,missingAddressReason:'Client has no stable street address'},partial)).not.toThrow();
});
it('does not assemble identity from conflicting records or send extra fields to Stedi',()=>{
 expect(discoveryPatient({patient:{firstName:'Different'}},patient)).toMatchObject({firstName:'Different',lastName:'',dateOfBirth:''});
 const payload=stediDiscoveryPayload({...patient,ssn:'secret'},'1306688650','2026-11-10');
 expect(payload).toMatchObject({provider:{npi:'1306688650'},subscriber:{dateOfBirth:'20000102',address:{state:'CO'}},encounter:{dateOfService:'20261110'}});
 expect(payload.subscriber).not.toHaveProperty('ssn');
});
it('uses the Denver calendar month for the combined budget',()=>{
 expect(discoveryMonth(new Date('2026-12-01T06:59:59Z'))).toBe('2026-11');
 expect(discoveryMonth(new Date('2026-12-01T07:00:00Z'))).toBe('2026-12');
});
it('checks the dependent identity and never treats a Stedi ID as a Claim.MD route',()=>{
 const candidate=discoveryCandidate({payer:{name:'Test payer',payorIdentification:'STEDI-ID'},subscriber:{firstName:'Parent',lastName:'Person',memberId:'MEMBER'},dependent:{...patient,dateOfBirth:'20000102'}},0,patient);
 expect(candidate.identityMatches).toBe(true);expect(candidate.policy).toMatchObject({memberId:'MEMBER',payerId:'',eligibilityPayerId:''});
 expect(discoveryCandidate({subscriber:{...patient,dateOfBirth:'19990102'}},0,patient).identityMatches).toBe(false);
});
it('is disabled until explicitly connected and only scopes the three agencies',()=>{
 vi.stubEnv('STEDI_API_KEY','synthetic');vi.stubEnv('STEDI_DISCOVERY_ENABLED','false');expect(stediDiscoveryConfigured(2)).toBe(false);
 vi.stubEnv('STEDI_DISCOVERY_ENABLED','true');expect(stediDiscoveryConfigured(377)).toBe(true);expect(stediDiscoveryConfigured(7)).toBe(false);
});
function fakeDb({used=0,duplicate=null,recent=null}={}){
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
  if(sql.includes('SELECT reserved_count'))return [[{reserved_count:used}]];
  if(sql.includes('SELECT id FROM clients'))return [[{id:9}]];
  if(sql.includes('request_key=?'))return [[...(duplicate?[duplicate]:[])]];
  if(sql.includes('SELECT id FROM stedi_insurance'))return [[...(recent?[recent]:[])]];
  return [{insertId:1,affectedRows:1}];
 })};return db;
}
const depsFor=db=>({pool:{getConnection:async()=>db},patientFor:async()=>patient,offices:async()=>[{id:7,practice_npi:'1306688650'}],audit:vi.fn()});
it('reserves before sending, encrypts demographics, and records the acting user',async()=>{
 const db=fakeDb(),deps=depsFor(db),r=await reserveDiscovery(input(),deps);
 expect(r.reused).toBe(false);expect(db.commit).toHaveBeenCalledOnce();
 const args=db.execute.mock.calls.find(([q])=>q.startsWith('INSERT INTO stedi_insurance'))[1];
 expect(args.slice(0,3)).toEqual([2,9,1]);expect(args.at(-1)).not.toContain('Synthetic');
 expect(decryptFamilyBilling(args.at(-1),'stedi-discovery:2:9').patient).toEqual(patient);
 expect(()=>decryptFamilyBilling(args.at(-1),'stedi-discovery:6:9')).toThrow();
});
it('reuses recent identical requests even at the cap and blocks new searches at cap or cooldown',async()=>{
 const db=fakeDb({used:25,duplicate:row()});expect((await reserveDiscovery(input(),depsFor(db))).reused).toBe(true);
 expect(db.execute.mock.calls.some(([q])=>q.includes('reserved_count=reserved_count+1'))).toBe(false);
 for(const options of [{used:25},{recent:{id:1}}]){const db=fakeDb(options);await expect(reserveDiscovery(input(),depsFor(db))).rejects.toMatchObject({status:409});expect(db.rollback).toHaveBeenCalledOnce();}
});
it('does not spend a search when confirmations are missing or the billing office belongs elsewhere',async()=>{
 for(const request of [{...input(),birthdateConfirmed:false},{...input(),billingOfficeId:999}]){const db=fakeDb();await expect(reserveDiscovery(request,depsFor(db))).rejects.toThrow();expect(db.execute.mock.calls.some(([q])=>q.startsWith('INSERT INTO stedi_insurance'))).toBe(false);}
});
it('never automatically repeats an uncertain paid request',async()=>{
 const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])},call=vi.fn().mockRejectedValue(new Error('network timeout'));
 const result=await startDiscovery(input(),{configured:()=>true,reserve:async()=>({row:row(),payload:{},reused:false}),db,call});
 expect(result.status).toBe('unknown');expect(call).toHaveBeenCalledOnce();expect(result.message).toContain('Do not start another');
 const again=await startDiscovery(input(),{configured:()=>true,reserve:async()=>({row:{...row(),status:'unknown'},reused:true}),db,call});
 expect(again.reused).toBe(true);expect(call).toHaveBeenCalledOnce();
});
it('retains every response field and queues a billing exception for discovered coverage',async()=>{
 const response={status:'COMPLETE',discoveryId:'test-id',items:[{subscriber:{...patient,dateOfBirth:'20000102'},payer:{name:'Payer'}}],extra:{future:'retained'}};
 const db={execute:vi.fn().mockResolvedValue([{affectedRows:1}])},queueFollowUp=vi.fn();
 const result=await startDiscovery(input(),{configured:()=>true,reserve:async()=>({row:row(),payload:{}}),call:async()=>response,db,queueFollowUp});
 expect(result).toMatchObject({status:'complete',reviewRequired:true,response});expect(queueFollowUp).toHaveBeenCalledOnce();
 expect(db.execute.mock.calls[0][1][2]).not.toContain('retained');
});
it('retrieves a pending search with GET rather than creating another paid search',async()=>{
 const saved={...row(),status:'pending',discovery_id:'saved-id'},db={execute:vi.fn().mockResolvedValueOnce([[saved]]).mockResolvedValue([{affectedRows:1}])},call=vi.fn().mockResolvedValue({status:'COMPLETE',discoveryId:'saved-id',items:[]});
 expect(await refreshDiscovery({...input(),id:1},{db,call,configured:()=>true})).toMatchObject({status:'complete',reviewRequired:false});expect(call).toHaveBeenCalledWith({discoveryId:'saved-id'});
});
it('uses only the fixed API origin with bounded responses, no redirects and no transport retries',async()=>{
 const response={status:'PENDING',discoveryId:'saved-id',items:[]},fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(response),{status:202}));
 vi.stubEnv('STEDI_API_KEY','synthetic-key');expect(await callStediDiscovery({payload:{test:true}},{fetch})).toEqual(response);
 expect(fetch).toHaveBeenCalledWith('https://healthcare.us.stedi.com/2024-04-01/insurance-discovery/check/v1',expect.objectContaining({method:'POST',redirect:'error'}));
 await expect(callStediDiscovery({discoveryId:'../../elsewhere'},{fetch})).rejects.toThrow();expect(fetch).toHaveBeenCalledOnce();
});
it('requires a decision for all matches and saved coverage before releasing a review',async()=>{
 const saved={...row(),status:'complete',response_encrypted:encryptFamilyBilling({items:[{payer:{name:'Payer'},subscriber:{...patient,dateOfBirth:'20000102',memberId:'MEMBER'}}]},'stedi-discovery:2:9')};
 const db=fakeDb();db.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM stedi')?[[saved]]:[[{id:9}]]);
 await expect(reviewDiscovery({...input(),id:1,decisions:[]},{...depsFor(db),readInsurance:async()=>({})})).rejects.toThrow('every returned match');
 await expect(reviewDiscovery({...input(),id:1,decisions:[{index:0,status:'recorded',slot:'primary',reason:'Confirmed in payer portal'}]},{...depsFor(db),readInsurance:async()=>({})})).rejects.toThrow('Save this matched');
});
it('does not reconcile another client’s search',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[]])};await expect(reconcileUncertainDiscovery({...input(),id:77,portalChecked:true,coverageRecorded:true,reference:'Checked reference in portal'},{db})).rejects.toMatchObject({status:404});
 expect(db.execute.mock.calls[0][1]).toEqual([77,2,9]);
});
