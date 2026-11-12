import {beforeEach,expect,it,vi} from 'vitest';
const {execute}=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../../models/CommunicationInbox.model.js',()=>({default:{}}));
import {inferAgencyMailDomain} from '../tenantMessageMailboxes.service.js';
beforeEach(()=>execute.mockReset());
it('resolves retained NLU QA mail before querying or inventing any sender identities',async()=>{
 execute.mockResolvedValueOnce([[{id:453,slug:'nlu-qa-demo',is_active:1,organization_type:'agency',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}}]]);
 expect(await inferAgencyMailDomain(453)).toBe('nextleveluplcc.com');expect(execute).toHaveBeenCalledTimes(1);
});
it('does not infer a live NLU domain from an arbitrary similarly named organization',async()=>{
 execute.mockResolvedValueOnce([[{id:999,slug:'nlu-qa-demo',is_active:1,organization_type:'agency',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}}]]).mockResolvedValueOnce([[]]);
 expect(await inferAgencyMailDomain(999)).toBeNull();expect(execute).toHaveBeenCalledTimes(2);
});
it('keeps the configured mail-domain behavior for ordinary organizations',async()=>{
 execute.mockResolvedValueOnce([[{id:999,slug:'sample',is_active:1,organization_type:'agency',feature_flags:{workspaceEmailDomain:'mail.example.com'}}]]);
 expect(await inferAgencyMailDomain(999)).toBe('mail.example.com');expect(execute).toHaveBeenCalledTimes(1);
});
