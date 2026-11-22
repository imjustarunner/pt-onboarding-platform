import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {listSharedPayerDirectory} from '../sharedPayerDirectory.service.js';
import {intakeAutomationConfig,automaticEligibilityPayerReady} from '../intakeEligibility.service.js';
it('shares only directory fields from approved source agencies and keeps the newest duplicate',async()=>{
 const execute=vi.fn(async()=>[[{claimmd_payer_id:'UNITED',directory_checked_at:'new'},{claimmd_payer_id:'UNITED',directory_checked_at:'old'}]]);
 expect(await listSharedPayerDirectory({execute},{CLAIM_MD_AGENCY_IDS:'2,6,377'})).toEqual([{claimmd_payer_id:'UNITED',directory_checked_at:'new'}]);
 expect(execute.mock.calls[0][0]).toContain('a.is_active=1');expect(execute.mock.calls[0][0]).not.toContain('tax_id');expect(execute.mock.calls[0][1]).toEqual([2,6,377]);
});
it('uses an approved agency policy without requiring the old intake feature flag',async()=>{
 const offices=vi.fn(async()=>[{id:8,practice_npi:'1306688650',state:'CO'}]);
 expect(await intakeAutomationConfig(6,{}, {policy:{enabled:1},offices})).toMatchObject({enabled:true,officeId:8,medicaidState:'CO'});
 expect(await intakeAutomationConfig(6,{intakeEligibilityAutomation:{enabled:false}}, {policy:{enabled:1},offices})).toEqual({enabled:false});
 expect(await intakeAutomationConfig(6,{}, {policy:{enabled:1},offices:async()=>[{id:1,practice_npi:'1306688650'},{id:2,practice_npi:'1306688650'}]})).toMatchObject({enabled:true,officeId:null});
});
it('does not require a duplicate agency payer setup for eligibility that needs no enrollment',async()=>{
 const capability=vi.fn(async()=> 'yes');expect(await automaticEligibilityPayerReady({agencyId:6,payerId:'SKCO0',profile:{},connection:{}},{db:{execute:vi.fn(async()=>[[]])},capability})).toBe(true);expect(capability).toHaveBeenCalledOnce();
});
it('checks missing payer capability through the metadata directory, not a patient eligibility inquiry',async()=>{
 const {eligibilityPayerCapability}=await import('../eligibilityPayerDirectory.service.js');const fetch=vi.fn(async()=>({payer:[{payerid:'SKCO_TEST',eligibility:'yes'}]}));
 const input={agencyId:6,payerId:'SKCO_TEST',connection:{connectionId:'account:directory-test',accountKey:'SYNTHETIC-ONLY'}};const deps={shared:async()=>[],fetch};
 expect(await eligibilityPayerCapability(input,deps)).toBe('yes');expect(await eligibilityPayerCapability(input,deps)).toBe('yes');expect(fetch).toHaveBeenCalledTimes(1);
 expect(fetch).toHaveBeenCalledWith({agencyId:6,accountKey:'SYNTHETIC-ONLY',payerId:'SKCO_TEST'});
});
it('keeps required payer enrollment bound to the current agency and billing identity',async()=>{
 const clinicalDb={execute:vi.fn(async()=>[[]])};expect(await automaticEligibilityPayerReady({agencyId:6,payerId:'PAYER',profile:{officeId:8,billingNpi:'1306688650',practice:{tax_id:'123456789'}},connection:{connectionId:'account:test'}},{db:{execute:vi.fn(async()=>[[]])},clinicalDb,capability:async()=> 'enrollment'})).toBe(false);
 expect(clinicalDb.execute.mock.calls[0][1].slice(0,5)).toEqual([6,'account:test',8,'PAYER','1306688650']);
});
it('explains queued automatic checks and missing information without sending patient requests',async()=>{
 const {clientAutomaticEligibilityStatus}=await import('../intakeEligibility.service.js');
 const db={execute:vi.fn(async sql=>sql.includes('SELECT feature_flags')?[[{feature_flags:{}}]]:sql.includes('SELECT enabled,monthly_limit')?[[{enabled:1,monthly_limit:100}]]:sql.includes('SELECT id,status,updated_at')?[[{id:8,status:'pending'}]]:[[]])};
 const deps={db,offices:async()=>[{id:8,practice_npi:'1306688650',state:'CO'}],connection:async()=>({mode:'test',connectionId:'account:test'}),profile:async()=>({billingNpi:'1306688650',practice:{tax_id:'123456789',name:'Test'}}),env:{CLAIM_MD_INTAKE_ELIGIBILITY_ENABLED:'true',CLAIM_MD_ELIGIBILITY_ACCOUNT_LIMITS_JSON:'{"account:test":100}'}};
 const input={agencyId:6,clientId:10,serviceDate:'2026-11-22',insurance:{primary:{payerId:'TEST',memberId:'TEST',subscriberFirstName:'Test',subscriberLastName:'Member',subscriberDob:'2000-01-01',relationshipToSubscriber:'self'},patient:{}}};
 expect(await clientAutomaticEligibilityStatus(input,deps)).toMatchObject({status:'pending',jobId:8});
 expect(await clientAutomaticEligibilityStatus({...input,insurance:{primary:{}}},deps)).toMatchObject({status:'waiting_for_information'});
 expect(await clientAutomaticEligibilityStatus(input,{...deps,env:{}})).toMatchObject({status:'paused'});
});
