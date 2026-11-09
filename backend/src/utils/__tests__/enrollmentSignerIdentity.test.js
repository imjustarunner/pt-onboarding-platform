import {expect,it} from 'vitest';
import {enrollmentSignerIdentity} from '../enrollmentSignerIdentity.js';
it('uses the corrected signer only before final submission and rejects stale signed capture identities',()=>{
 const submission={status:'started',signer_email:'old@example.test'};
 const guardian={email:'correct@example.test',firstName:'Synthetic',lastName:'Guardian',phone:'5550101'};
 expect(enrollmentSignerIdentity(submission,guardian,{})).toMatchObject({signer_email:guardian.email,signer_name:'Synthetic Guardian'});
 expect(()=>enrollmentSignerIdentity(submission,guardian,{smartSchoolRoi:{signatureData:'synthetic',signer:{email:submission.signer_email}}})).toThrow('review and sign');
 expect(enrollmentSignerIdentity({...submission,status:'submitted'},guardian,{})).toEqual({});
});
