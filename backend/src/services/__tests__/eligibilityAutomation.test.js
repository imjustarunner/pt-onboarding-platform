import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),positiveId:Number,auditBilling:vi.fn()}));
import {automaticEligibilityKey,eligibilityPeriod,automationDate,validateAutomationPolicy,runEligibilityAutomation} from '../eligibilityAutomation.service.js';
import {accountEligibilityLimit,runMeteredCoverageCheck} from '../eligibilityUsage.service.js';
const profile={officeId:8,billingNpi:'1306688650',practice:{tax_id:'123456789',name:'Synthetic clinic'}};
const insurance={primary:{payerId:'TEST',memberId:'SYNTHETIC',subscriberFirstName:'Test',subscriberLastName:'Person',subscriberDob:'2000-01-01',relationshipToSubscriber:'self'},secondary:{payerId:'OTHER',memberId:'SECOND'}};
const connection={mode:'test',connectionId:'account:synthetic',accountKey:'SYNTHETIC-ONLY'};
const env={CLAIM_MD_ELIGIBILITY_AUTOMATION_ENABLED:'true',CLAIM_MD_ELIGIBILITY_ACCOUNT_LIMITS_JSON:'{"account:synthetic":1000}'};
describe('background eligibility controls',()=>{
 it('uses local dates, calendar months and Monday weekly boundaries',()=>{
  expect(automationDate(new Date('2026-09-26T02:00:00Z'))).toBe('2026-09-25');
  expect(eligibilityPeriod('weekly','2026-09-27')).toBe('2026-09-21');
  expect(eligibilityPeriod('weekly','2026-09-28')).toBe('2026-09-28');
  expect(eligibilityPeriod('monthly','2026-09-30')).toBe('2026-09');
  expect(eligibilityPeriod('before_visit','2026-09-30')).toBe('2026-09-30');
 });
 it('deduplicates a policy/period and separates tenant, coverage and billing identity changes',()=>{
  const base={agencyId:1,clientId:2,slot:'primary',fingerprint:'abc',period:'monthly:2026-09',profile};
  const key=automaticEligibilityKey(base);expect(key).toBe(automaticEligibilityKey({...base}));
  for(const patch of [{agencyId:2},{slot:'secondary'},{fingerprint:'changed'},{period:'weekly:2026-09-21'},{profile:{...profile,billingNpi:'another'}}])expect(automaticEligibilityKey({...base,...patch})).not.toBe(key);
  expect(key).not.toContain('123456789');
 });
 it('requires an explicit account limit for automatic use and rejects malformed configuration',()=>{
  expect(accountEligibilityLimit('unknown',env)).toBeNull();expect(accountEligibilityLimit(connection.connectionId,env)).toBe(1000);
  for(const raw of ['broken','{"account:synthetic":-1}','{"account:synthetic":"1000"}'])expect(()=>accountEligibilityLimit(connection.connectionId,{CLAIM_MD_ELIGIBILITY_ACCOUNT_LIMITS_JSON:raw})).toThrow();
 });
 it('requires readiness attestation to enable a schedule',()=>{
  const policy={enabled:true,cadence:'monthly',monthlyLimit:100,revision:0,readinessReference:'Synthetic setup reference',readinessConfirmed:true};
  expect(validateAutomationPolicy(policy)).toBe(policy.readinessReference);
  for(const patch of [{readinessConfirmed:false},{monthlyLimit:0},{cadence:'daily'},{revision:-1}])expect(()=>validateAutomationPolicy({...policy,...patch})).toThrow();
 });
 it('does nothing when deployment automation is off',async()=>{const db={execute:vi.fn()};expect(await runEligibilityAutomation({db,env:{}})).toEqual([]);expect(db.execute).not.toHaveBeenCalled();});
 function worker({paused=false,existing=false,actor=true}={}) {
  const policy={agency_id:1,reviewer_user_id:9,enabled:1,cadence:'monthly',feature_flags:{medicalBillingEnabled:true},scan_after_client_id:0};
  const db={execute:vi.fn(async sql=>sql.startsWith('SELECT p.')?[[policy]]:sql.startsWith('SELECT enabled')?[[{enabled:paused?0:1}]]:sql.startsWith('SELECT id FROM claimmd_eligibility_usage')?[existing?[{id:8}]:[]]:[{}])};
  const check=vi.fn().mockResolvedValue({id:10});
  return {db,check,env,now:new Date('2026-09-25T12:00:00Z'),actorAllowed:async()=>actor,connection:async()=>connection,candidates:async()=>[{client_id:2}],readInsurance:async()=>insurance,targets:async()=>[{profile,serviceDate:'2026-09-25'}]};
 }
 it('checks both recorded policies and leaves approval out of the worker',async()=>{const deps=worker();expect(await runEligibilityAutomation(deps)).toMatchObject([{returned:2,needsReview:0}]);expect(deps.check.mock.calls.map(([i])=>i.slot)).toEqual(['primary','secondary']);expect(deps.check.mock.calls.every(([i])=>i.source==='automatic'&&i.expectedFingerprint&&i.actorUserId===9)).toBe(true);});
 it.each([{paused:true},{existing:true},{actor:false}])('does not transmit after pause, prior attempt or revoked access: %j',async opts=>{const deps=worker(opts);await runEligibilityAutomation(deps);expect(deps.check).not.toHaveBeenCalled();});
 it('reserves before calling the payer and conservatively tracks a timeout',async()=>{
  const events=[],db={execute:vi.fn().mockResolvedValue([{}])},reserve=vi.fn(async()=>{events.push('reserve');return 22;}),check=vi.fn(async()=>{events.push('check');throw Object.assign(new Error('Unconfirmed'),{status:502});});
  await expect(runMeteredCoverageCheck({agencyId:1,clientId:2,slot:'primary',serviceDate:'2026-09-25',requestKey:'synthetic-check',actorUserId:9,profile,connection},{db,reserve,check,readInsurance:async()=>insurance})).rejects.toThrow('Unconfirmed');
  expect(events).toEqual(['reserve','check']);expect(db.execute.mock.calls[0][1]).toEqual(['unknown',22,1]);
 });
 it('does not reserve or call Claim.MD with disabled transmission or changed insurance',async()=>{
  const reserve=vi.fn(),check=vi.fn(),input={agencyId:1,clientId:2,slot:'primary',serviceDate:'2026-09-25',requestKey:'synthetic-check',profile,connection};
  for(const patch of [{connection:{...connection,mode:'disabled'}},{expectedFingerprint:'stale'}])await expect(runMeteredCoverageCheck({...input,...patch},{reserve,check,readInsurance:async()=>insurance})).rejects.toMatchObject({status:409});
  expect(reserve).not.toHaveBeenCalled();expect(check).not.toHaveBeenCalled();
 });
});
