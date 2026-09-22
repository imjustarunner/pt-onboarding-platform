import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({members:vi.fn(),insert:vi.fn(),settings:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:m.execute,release:()=>{}})}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:async()=>({id:6,is_active:1,from_email:'supervision-replies@itsco.health'}),replaceInboundRoutes:async()=>{}}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:async()=> 'itsco.health'}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getImpersonatedUser:()=> 'app@itsco.health'}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{getGroup:async()=>({id:'group'}),listGroupMembers:m.members,applyGroupAccessSettings:m.settings,addGroupMember:async()=>{},setGroupMemberDeliverySettings:async()=>{},getClient:async()=>({members:{insert:m.insert}})}}));
import {ensureSupervisionReplyMailbox} from '../supervisionReplyMailbox.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{acquired:1}]]);m.members.mockResolvedValue([{email:'app@itsco.health',role:'MEMBER',delivery_settings:'ALL_MAIL'}]);});
it('allows only the invited reply address, with NONE delivery, manager-only visibility and no public posting',async()=>{
 await ensureSupervisionReplyMailbox(2,{replyEmail:'invited@example.com'});
 expect(m.insert).toHaveBeenCalledWith({groupKey:'supervision-replies@itsco.health',requestBody:{email:'invited@example.com',role:'MEMBER',delivery_settings:'NONE'}});
 expect(m.settings).toHaveBeenCalledWith(expect.objectContaining({whoCanPostMessage:'ALL_MEMBERS_CAN_POST',whoCanViewGroup:'ALL_MANAGERS_CAN_VIEW',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',isArchived:false}));
});
it('refuses to use a reply Group that could send replies to another human',async()=>{
 m.members.mockResolvedValue([{email:'human@example.com',role:'MEMBER',delivery_settings:'ALL_MAIL'}]);
 await expect(ensureSupervisionReplyMailbox(3,{replyEmail:'invited@example.com'})).rejects.toThrow('unexpected delivery members');expect(m.insert).not.toHaveBeenCalled();
});
