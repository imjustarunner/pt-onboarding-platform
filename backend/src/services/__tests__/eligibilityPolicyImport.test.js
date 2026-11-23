import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:vi.fn()}));
import {importSavedEligibilityPolicy} from '../eligibilityPolicyImport.service.js';
import {coverageInsuranceFingerprint} from '../../utils/paperInsuranceReviewGate.js';
import {encryptFamilyBilling} from '../familyBillingEncryption.service.js';
beforeEach(()=>vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64')));
function setup(overrides={}) {
 const insurance={primary:{insurerName:'Saved payer',payerId:'TEST',memberId:'MEMBER'},patient:{firstName:'Test',lastName:'Person',dateOfBirth:'2000-01-01'},...overrides.insurance};
 const evidence={summary:{status:'active_reported',identityMatches:true},eligibilityPayerId:'TEST',result:{elig:{ins_number:'MEMBER',plan_name:'Returned plan',group_number:'GROUP',benefit:[{benefit_code:'30',benefit_coverage_code:'1'},{benefit_code:'30',benefit_coverage_code:'R',policy_number:'OTHER-REFERENCE',entity:{entity_code:'PR',entity_name:'Other payer',entity_phone:'5550100'}}]}},...overrides.evidence};
 const fingerprint=coverageInsuranceFingerprint(insurance),check={id:317,policy_slot:'primary',status:'returned',service_date:'2026-11-22',insurance_fingerprint:fingerprint,evidence_encrypted:encryptFamilyBilling(evidence,'coverage:2:8'),...overrides.check};
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT id FROM clients')?[[{id:8}]]:sql.includes('FROM client_coverage_checks')?[[check]]:[{affectedRows:1}])};
 const writeInsurance=vi.fn(async value=>value),audit=vi.fn(),deps={pool:{getConnection:async()=>db},readInsurance:async()=>insurance,writeInsurance,audit};
 return {input:{agencyId:2,clientId:8,checkId:317,expectedFingerprint:fingerprint,actorUserId:12},deps,db,writeInsurance,audit,insurance};
}
it('fills blanks from an owned saved response without a payer request or overwriting existing entries',async()=>{
 const s=setup(),result=await importSavedEligibilityPolicy(s.input,s.deps);
 expect(s.writeInsurance).toHaveBeenCalledWith(expect.objectContaining({primary:expect.objectContaining({insurerName:'Saved payer',planName:'Returned plan',groupNumber:'GROUP'}),queueEligibility:false,verifiedForClaims:false}),s.db,{eligibilityFieldSources:{primary:expect.objectContaining({planName:expect.objectContaining({checkId:317,value:'Returned plan'})})}});
 expect(s.db.execute).toHaveBeenCalledWith(expect.stringContaining('id=? AND agency_id=? AND client_id=?'),[317,2,8]);
 expect(result.importedFields).toContain('planName');expect(s.db.commit).toHaveBeenCalledTimes(1);
 expect(s.audit).toHaveBeenCalledWith(expect.objectContaining({userId:12,objectId:317}),s.db);
});
it('adds an identified insurer only as an empty secondary draft without guessing member or payer IDs',async()=>{
 const s=setup();await importSavedEligibilityPolicy({...s.input,mode:'reported_coverage',slot:'secondary',candidateId:'0:1:0'},s.deps);
 const [saved,,options]=s.writeInsurance.mock.calls[0];
 expect(saved.primary).toEqual(s.insurance.primary);expect(saved.secondary).toEqual({insurerName:'Other payer',reportedPolicyNumber:'OTHER-REFERENCE',payerPhone:'5550100'});
 expect(saved.secondary).not.toHaveProperty('memberId');expect(saved.secondary).not.toHaveProperty('payerId');expect(saved.verifiedForClaims).toBe(false);expect(saved.queueEligibility).toBe(false);
 expect(options.eligibilityFieldSources.secondary.insurerName.checkId).toBe(317);
});
it.each([
 [{check:{insurance_fingerprint:'old'}},409],
 [{check:{status:'error'}},409],
 [{evidence:{summary:{status:'active_reported',identityMatches:false}}},409],
 [{insurance:{paperReviewRequired:true}},409]
])('blocks changed or unverified evidence: %j',async(overrides,status)=>{
 const s=setup(overrides);await expect(importSavedEligibilityPolicy(s.input,s.deps)).rejects.toMatchObject({status});expect(s.writeInsurance).not.toHaveBeenCalled();expect(s.db.rollback).toHaveBeenCalled();
});
it('does not disclose or import a check outside the client and agency scope',async()=>{
 const s=setup();s.db.execute.mockImplementation(async sql=>sql.includes('FROM client_coverage_checks')?[[]]:[[{id:8}]]);
 await expect(importSavedEligibilityPolicy(s.input,s.deps)).rejects.toMatchObject({status:404});expect(s.writeInsurance).not.toHaveBeenCalled();
});
it('never replaces an existing secondary policy',async()=>{
 const s=setup({insurance:{secondary:{insurerName:'Keep this payer'}}});
 await expect(importSavedEligibilityPolicy({...s.input,mode:'reported_coverage',slot:'secondary',candidateId:'0:1:0'},s.deps)).rejects.toMatchObject({status:409});expect(s.writeInsurance).not.toHaveBeenCalled();
});
it('rejects an unsaved or stale browser snapshot even when the stored check is current',async()=>{
 const s=setup();await expect(importSavedEligibilityPolicy({...s.input,expectedFingerprint:'a'.repeat(64)},s.deps)).rejects.toMatchObject({status:409});expect(s.writeInsurance).not.toHaveBeenCalled();
});
it('rolls back source and policy changes when persistence fails',async()=>{
 const s=setup();s.writeInsurance.mockRejectedValue(new Error('Persistence unavailable'));await expect(importSavedEligibilityPolicy(s.input,s.deps)).rejects.toThrow('Persistence unavailable');expect(s.db.commit).not.toHaveBeenCalled();expect(s.db.rollback).toHaveBeenCalled();expect(s.audit).not.toHaveBeenCalled();
});
