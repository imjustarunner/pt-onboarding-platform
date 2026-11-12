import {expect,it} from 'vitest';
import {nluQaWorkIdentity,nluQaWorkflowEmployee} from '../nluWorkforceQaPolicy.js';
const agency={id:453,slug:'nlu-qa-demo',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}};
const finley={id:1496,role:'provider',email:'qa.nlu.tutor@example.com',work_email:'qa.nlu.tutor@example.com',is_demo:1,is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE'};
it('allows only the retained active people and their exact saved work identities in the dedicated source6 QA agency',()=>{
 expect(nluQaWorkflowEmployee(finley,agency)).toBe(true);
 expect(nluQaWorkflowEmployee({...finley,id:1771,role:'staff',email:'qa.nlu.childcare.a@example.com',work_email:'qa.nlu.childcare.a@example.com'},agency)).toBe(true);
 expect(nluQaWorkflowEmployee(finley,{...agency,id:454,slug:'nlu-qa-learning',feature_flags:JSON.stringify(agency.feature_flags)})).toBe(true);
});
it.each([{work_email:null},{work_email:'unsaved@example.com'},{work_email:'testing@itsco.health'},{email:'other@example.com'},{id:9999},{role:'admin'},{is_demo:0},{is_active:0},{is_archived:1},{status:'PROSPECTIVE'},{status:'INACTIVE_EMPLOYEE'}])('rejects an altered identity, role, saved alias or readiness: %j',patch=>{
 expect(nluQaWorkIdentity({...finley,...patch})).toBeNull();
});
it.each([{id:6,slug:'nlu'},{id:450},{slug:'other'},{is_active:0},{is_archived:1},{feature_flags:'invalid'},{feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:450}}},{feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}}])('rejects a foreign, disabled or unverified agency: %j',patch=>{
 expect(nluQaWorkflowEmployee(finley,{...agency,...patch})).toBe(false);
});
it('keeps prospective Devon blocked and preserves the exact person after ordinary work-account activation',()=>{
 const prospect={...finley,id:1772,role:'staff',email:'qa.nlu.childcare.b@example.com',work_email:null,personal_email:'qa.nlu.childcare.b@example.com',status:'PROSPECTIVE'};
 expect(nluQaWorkflowEmployee(prospect,agency)).toBe(false);
 const active={...prospect,status:'ACTIVE_EMPLOYEE',email:'qa.nlu.devon.work@example.com',work_email:'qa.nlu.devon.work@example.com'};
 expect(nluQaWorkflowEmployee(active,agency)).toBe(true);
 expect(nluQaWorkflowEmployee({...active,personal_email:'another@example.com'},agency)).toBe(false);
 expect(nluQaWorkflowEmployee({...active,id:1773},agency)).toBe(false);
});
