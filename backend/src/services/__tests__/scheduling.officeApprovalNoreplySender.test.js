import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),create:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:m.find,create:m.create}}));
vi.mock('../managedWorkspaceGroupPolicy.js',()=>({managedDomain:row=>row.domain}));
import {ensureTenantNoreplyMailbox} from '../tenantMessageMailboxes.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{id:2,domain:'itsco.health'}]]);m.find.mockResolvedValue(null);m.create.mockImplementation(async row=>({id:88,agency_id:row.agencyId,is_active:1,from_email:row.fromEmail,reply_to:row.replyTo}));});
it('uses the agency mail domain for a dedicated no-reply identity without creating message inboxes',async()=>{
 const result=await ensureTenantNoreplyMailbox(2);
 expect(result.noreply).toMatchObject({agency_id:2,from_email:'noreply@itsco.health',reply_to:'noreply@itsco.health'});
 expect(m.create).toHaveBeenCalledOnce();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,identityKey:'noreply'}));
});
it('preserves an intentionally disabled no-reply sender',async()=>{
 m.find.mockResolvedValue({id:88,agency_id:2,is_active:0,from_email:'noreply@itsco.health'});
 await expect(ensureTenantNoreplyMailbox(2)).rejects.toThrow('disabled');expect(m.create).not.toHaveBeenCalled();
});
