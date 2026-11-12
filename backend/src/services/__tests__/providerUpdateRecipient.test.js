import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import {providerUpdateWorkEmail,resolveProviderUpdateRecipients} from '../providerUpdateRecipient.service.js';
const identities=[{agency_id:2,is_active:1,from_email:'PO@itsco.health'}];
it('uses the saved agency login address when the legacy work field contains personal email',()=>{
 expect(providerUpdateWorkEmail({id:8,work_email:'personal@gmail.com',email:'aneta@itsco.health'},identities,2)).toBe('aneta@itsco.health');
 expect(providerUpdateWorkEmail({id:465,work_email:'personal@yahoo.com',email:'aunya@itsco.health'},identities,2)).toBe('aunya@itsco.health');
});
it('prefers the agency-owned personal mailbox identity over old login aliases',()=>{
 expect(providerUpdateWorkEmail({id:8,email:'old@plottwistco.com'},[...identities,{agency_id:2,is_active:1,identity_key:'personal_8',from_email:'aneta@itsco.health'}],2)).toBe('aneta@itsco.health');
});
it('never falls back to personal email, another agency or disabled identities',()=>{
 expect(providerUpdateWorkEmail({id:8,work_email:'personal@gmail.com',email:'personal@yahoo.com'},identities,2)).toBeNull();
 expect(providerUpdateWorkEmail({id:8,email:'aneta@itsco.health'},identities,6)).toBeNull();
 expect(providerUpdateWorkEmail({id:8,email:'aneta@itsco.health'},[{...identities[0],is_active:0}],2)).toBeNull();
});
const qa={id:1496,email:'qa.nlu.tutor@example.com',work_email:'qa.nlu.tutor@example.com',role:'provider',is_demo:1,is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE',qa_agency_id:453,slug:'nlu-qa-demo',qa_agency_active:1,qa_agency_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}};
beforeEach(()=>{vi.clearAllMocks();EmailSenderIdentity.list.mockResolvedValue(identities);pool.execute.mockResolvedValue([[structuredClone(qa)]]);});
it('resolves the exact saved QA work alias with controlled physical transport metadata after a fresh membership read',async()=>{
 const[result]=await resolveProviderUpdateRecipients(453,[{provider_user_id:1496,is_demo:1,work_email:'unsaved@example.com'}]);
 expect(result).toMatchObject({work_email:'qa.nlu.tutor@example.com',qa_workflow_allowed:true,qa_physical_to:'testing@itsco.health',is_demo:1});
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('ua.is_active=1'),[453,1496]);
 expect(pool.execute.mock.calls[0][0]).toContain('WHERE a.id=?');
});
it.each([{work_email:null},{work_email:'unsaved@example.com'},{is_active:0},{status:'PROSPECTIVE'},{qa_agency_id:454,slug:'nlu-qa-learning'},{qa_agency_active:0},{feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:450}}}])('refuses an unready saved QA alias without falling back to stale input: %j',async patch=>{
 pool.execute.mockResolvedValue([[{...qa,...patch}]]);
 const[result]=await resolveProviderUpdateRecipients(453,[{provider_user_id:1496,is_demo:1,work_email:'person@itsco.health',email:'person@itsco.health',qa_workflow_allowed:true,qa_workflow_agency_id:453,qa_physical_to:'stale@example.com'}]);
 expect(result.work_email).toBeNull();expect(result.qa_workflow_allowed).toBe(false);expect(result).not.toHaveProperty('qa_physical_to');
});
it('denies removed membership and never uses a different agency as a QA fallback',async()=>{
 pool.execute.mockResolvedValue([[]]);
 expect((await resolveProviderUpdateRecipients(453,[{provider_user_id:1496,is_demo:1}]))[0].work_email).toBeNull();
 pool.execute.mockClear();const[result]=await resolveProviderUpdateRecipients(6,[{provider_user_id:1496,is_demo:1,email:qa.email,work_email:qa.work_email}]);
 expect(result.work_email).toBeNull();expect(result.qa_workflow_allowed).toBe(false);expect(pool.execute).not.toHaveBeenCalled();
});
