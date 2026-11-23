import {it,expect} from 'vitest';
import {claimMdFailure,eligibilityFailure,takeClaimMdFailureEvidence,claimMdSystemErrors} from '../claimMdEligibilityErrors.js';
it.each([
 [{httpStatus:401},'CLAIM_MD_ACCOUNT_SETUP',503],
 [{body:{error:[{error_code:'123',error_mesg:'Provider enrollment required for PATIENT_CANARY SECRET_CANARY'}]}},'CLAIM_MD_PAYER_ENROLLMENT',409],
 [{body:{error:{error_mesg:'Invalid NPI PATIENT_CANARY'}}},'CLAIM_MD_REQUEST_DETAILS',422],
 [{timeout:true},'CLAIM_MD_TIMEOUT',504],
 [{network:true},'CLAIM_MD_UNAVAILABLE',503],
 [{httpStatus:429},'CLAIM_MD_RATE_LIMITED',503]
])('returns actionable errors without exposing upstream patient or credential values (%j)',(input,code,status)=>{
 const result=claimMdFailure(input);expect(result).toMatchObject({code,status});expect(result.message+JSON.stringify(result)).not.toMatch(/PATIENT_CANARY|SECRET_CANARY/);
});
it('distinguishes an app storage failure from an enrollment failure',()=>{expect(eligibilityFailure(new Error('secret'), 'saving_response')).toMatchObject({code:'ELIGIBILITY_RESPONSE_STORAGE',status:503});});
it('ignores empty system error containers without ignoring actual wrapped errors',()=>{
 expect(claimMdSystemErrors({error:[],errors:{},result:{error:['',null,{}]}})).toEqual([]);
 expect(claimMdSystemErrors({error:[],result:{error:{error_mesg:'Request rejected'}}})).toEqual([{error_mesg:'Request rejected'}]);
 expect(claimMdSystemErrors({elig:{error:{error_code:'75'}}})).toEqual([]);
});
it('redacts literal, encoded and XML-escaped credentials before retaining vendor explanations',()=>{
 const secret='secret/key+value',failure=claimMdFailure({httpStatus:200,body:{error:[{error_mesg:`PRIVATE_MEMBER ${secret} ${encodeURIComponent(secret)}`,fields:'AccountKey=unexpected-credential'}]},secretValues:[secret]});
 const evidence=takeClaimMdFailureEvidence(failure);
 expect(evidence.errors[0].message).toContain('PRIVATE_MEMBER');
 expect(JSON.stringify(evidence)).not.toMatch(/secret\/key|secret%2Fkey|unexpected-credential/);
 expect(takeClaimMdFailureEvidence(failure)).toBeUndefined();
 const xml=claimMdFailure({rawText:'<result><error error_mesg="Invalid AccountKey a&amp;b" /></result>',secretValues:['a&b']});
 expect(JSON.stringify(takeClaimMdFailureEvidence(xml))).not.toContain('a&b');
});
