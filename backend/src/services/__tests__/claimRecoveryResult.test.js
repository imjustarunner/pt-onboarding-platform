import {it,expect} from 'vitest';
import {claimRecoveryFailure} from '../claimRecoveryResult.js';
it('maps actionable preparation failures without copying patient data or SQL',()=>{
 const privateMessage='DEMO PRIVATE patient statement SELECT * FROM secret_table';
 expect(claimRecoveryFailure(500,{},Error(privateMessage))).toMatchObject({code:'CLAIM_PREPARATION_UNAVAILABLE'});
 expect(JSON.stringify(claimRecoveryFailure(500,{},Error(privateMessage)))).not.toContain(privateMessage);
 expect(claimRecoveryFailure(400,{error:{message:'Primary diagnosis is required to create a claim.'}}).code).toBe('DIAGNOSIS_REVIEW_REQUIRED');
 expect(claimRecoveryFailure(409,{},Object.assign(Error(privateMessage),{code:'INSURANCE_VERIFICATION_REQUIRED'})).code).toBe('INSURANCE_VERIFICATION_REQUIRED');
 expect(claimRecoveryFailure(409,{error:{message:'The approved clinical version changed.'}}).code).toBe('APPROVED_CLINICAL_VERSION_REQUIRED');
 expect(claimRecoveryFailure(403).code).toBe('BILLING_ACCESS_REQUIRED');
 expect(claimRecoveryFailure(404).code).toBe('CLINICAL_RECORD_UNAVAILABLE');
 expect(claimRecoveryFailure(409,{error:{message:privateMessage}}).code).toBe('BILLING_PREPARATION_REVIEW_REQUIRED');
});
