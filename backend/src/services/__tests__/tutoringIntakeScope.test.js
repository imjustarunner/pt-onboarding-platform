import { expect,it } from 'vitest';
import { learningIntakeSteps,validateTutoringIntakeSubmission } from '../learningIntakeSteps.js';
import { TUTORING_AGREEMENT_KEY } from '../../../../frontend/src/navigation/tutoringEnrollmentPolicy.js';
import {TUTORING_MEDIA_KEY,TUTORING_SCHOOL_KEY,TUTORING_ENROLLMENT_VERSION} from '../../../../frontend/src/navigation/tutoringEnrollmentAgreement.js';
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
const packet=clients=>({guardian:{email:'qa.nlu.parent@example.com'},responses:{submission:{[TUTORING_AGREEMENT_KEY]:true},clients}});
it('records the server agreement version/text while leaving optional releases unselected',()=>{
 const data=packet({0:{},1:{[TUTORING_MEDIA_KEY]:'no',[TUTORING_SCHOOL_KEY]:'no'}});
 validateTutoringIntakeSubmission(link,data);
 expect(data.tutoringAgreement).toMatchObject({version:TUTORING_ENROLLMENT_VERSION,accepted:true,optionalPermissionsGrantPortalAccess:false});
 expect(data.tutoringAgreement.text).toContain('Previously accepted appointment');
 expect(data.responses.clients[0][TUTORING_MEDIA_KEY]).toBeUndefined();
});
it('does not accept an old agreement checkbox as the new version',()=>{
 const data=packet({});data.responses.submission={["tutoring_service_agreement_2026_11_12"]:true};
 expect(()=>validateTutoringIntakeSubmission(link,data)).toThrow('tutoring services agreement');
});
it('requires a separately attested media use for each student who opts in',()=>{
 const data=packet({0:{[TUTORING_MEDIA_KEY]:'yes',tutoring_media_private:true,tutoring_media_signature:'Morgan QA',tutoring_media_attestation:true},1:{[TUTORING_MEDIA_KEY]:'yes'}});
 expect(()=>validateTutoringIntakeSubmission(link,data)).toThrow('media permission');
 data.responses.clients[1][TUTORING_MEDIA_KEY]='no';
 expect(()=>validateTutoringIntakeSubmission(link,data)).not.toThrow();
});
it('also validates an optional permission in a self-enrollment submission',()=>{
 const data=packet({});data.intakeForSelf=true;data.responses.submission[TUTORING_MEDIA_KEY]='yes';
 expect(()=>validateTutoringIntakeSubmission(link,data)).toThrow('media permission');
});
it('validates school contact, scope and a real future date without granting school access',()=>{
 const fields={[TUTORING_SCHOOL_KEY]:'yes',tutoring_school_contact:'Teacher QA',tutoring_school_name:'QA school',tutoring_school_email:'teacher@example.com',tutoring_school_information:'Math goal progress',tutoring_school_purpose:'Coordinate practice',tutoring_school_signature:'Morgan QA',tutoring_school_attestation:true,tutoring_school_expires:'2099-02-30'};
 const data=packet({0:fields});
 expect(()=>validateTutoringIntakeSubmission(link,data)).toThrow('expiration date');
 fields.tutoring_school_expires='2099-02-28';fields.tutoring_school_email='teacher@';
 expect(()=>validateTutoringIntakeSubmission(link,data)).toThrow('named school contact');
 fields.tutoring_school_email='teacher@example.com';
 expect(()=>validateTutoringIntakeSubmission(link,data)).not.toThrow();
 expect(data.tutoringAgreement.optionalPermissionsGrantPortalAccess).toBe(false);
});
const agency=id=>({id,slug:id===453?'nlu-qa-demo':'nlu-qa-learning',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}});
it.each([453,454])('uses the existing NLU mail domain only for the exact retained QA agency%s',id=>expect(nluTutoringQaMailDomain(agency(id))).toBe('nextleveluplcc.com'));
it.each([{id:6},{slug:'nlu'}, {is_active:0}, {is_archived:1}, {feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:99}}}])('does not infer a domain for a spoofed/inactive/mismatched QA record: %j',patch=>expect(nluTutoringQaMailDomain({...agency(453),...patch})).toBeNull());
