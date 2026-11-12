import { expect,it } from 'vitest';
import { learningIntakeSteps,validateTutoringIntakeSubmission } from '../learningIntakeSteps.js';
import { TUTORING_AGREEMENT_KEY } from '../../../../frontend/src/navigation/tutoringEnrollmentPolicy.js';
import { nluTutoringQaMailDomain } from '../../utils/nluTutoringQaPolicy.js';
const link={master_channel:'tutoring',intake_steps:learningIntakeSteps([])};
it('enforces the effective tutoring agreement and valid guardian email at final submission',()=>{
 expect(()=>validateTutoringIntakeSubmission(link,{guardian:{email:'qa.nlu.parent@'},responses:{submission:{[TUTORING_AGREEMENT_KEY]:true}}})).toThrow('valid guardian email');
 expect(()=>validateTutoringIntakeSubmission(link,{guardian:{email:'qa.nlu.parent@example.com'},responses:{submission:{}}})).toThrow('tutoring services agreement');
 expect(()=>validateTutoringIntakeSubmission(link,{guardian:{email:'qa.nlu.parent@example.com'},responses:{submission:{[TUTORING_AGREEMENT_KEY]:true}}})).not.toThrow();
 expect(()=>validateTutoringIntakeSubmission({master_channel:'counseling'},{})).not.toThrow();
});
it('accepts the bound signer email when the latest packet omits a redundant guardian field',()=>{
 expect(()=>validateTutoringIntakeSubmission(link,{responses:{submission:{[TUTORING_AGREEMENT_KEY]:true}}},'qa.nlu.parent@example.com')).not.toThrow();
});
const agency=id=>({id,slug:id===453?'nlu-qa-demo':'nlu-qa-learning',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}});
it.each([453,454])('uses the existing NLU mail domain only for the exact retained QA agency%s',id=>expect(nluTutoringQaMailDomain(agency(id))).toBe('nextleveluplcc.com'));
it.each([{id:6},{slug:'nlu'}, {is_active:0}, {is_archived:1}, {feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:99}}}])('does not infer a domain for a spoofed/inactive/mismatched QA record: %j',patch=>expect(nluTutoringQaMailDomain({...agency(453),...patch})).toBeNull());
