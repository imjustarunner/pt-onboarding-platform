import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),validate:vi.fn(),send:vi.fn(),mailbox:vi.fn(),filing:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>{}}));
vi.mock('../../models/CommunicationConversation.model.js',()=>({default:{create:vi.fn(),upsertParticipant:vi.fn(),addMessage:vi.fn(),listDueScheduledMessages:vi.fn(),claimScheduledMessage:vi.fn(),findById:vi.fn(),update:vi.fn(),updateMessage:vi.fn()}}));
vi.mock('../../models/CommunicationInbox.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/UserCommunicationContact.model.js',()=>({default:{upsertSafe:vi.fn()}}));
vi.mock('../schoolContactStaffEmail.service.js',()=>({validateSchoolContactStaffDraft:m.validate}));
vi.mock('../emailSendMailbox.service.js',()=>({resolveEmailSendMailbox:m.mailbox}));
vi.mock('../communicationAttachments.service.js',()=>({persistOutboundAttachments:vi.fn(),loadOutboundAttachments:vi.fn(async()=>[])}));
vi.mock('../clientConversationRecord.service.js',()=>({resolveEmailClientFiling:m.filing,linkConversationClients:vi.fn()}));
vi.mock('../emailDeliveryChoice.service.js',()=>({planEmailDelivery:vi.fn(),recordEmailDeliveryChoice:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import Conversation from '../../models/CommunicationConversation.model.js';
import Inbox from '../../models/CommunicationInbox.model.js';
import {composeNewEmail,processScheduledOutboundSends} from '../unifiedInbox.service.js';
const context={workflowId:42,staffUserId:1465};
const payload=()=>({_schoolContact:context,clientIds:[2298],to:'jamie@example.com',cc:'',bcc:'',subject:'Intake coordination for QACSSO',text:'A provider reviewed this editable message.',undoDelaySeconds:20});
const queuedRow=()=>({id:77,conversation_id:88,author_user_id:1490,subject:'Intake coordination for QACSSO',body_text:'A provider reviewed this editable message.',to_json:[{email:'jamie@example.com'}],cc_json:[],bcc_json:[],from_json:JSON.stringify({email:'messages@itsco.health',schoolContact:context,schoolContactClientIds:[2298]})});
beforeEach(()=>{
 vi.clearAllMocks();m.validate.mockResolvedValue();m.execute.mockResolvedValue([[]]);m.send.mockResolvedValue({id:'receipt',internetMessageId:'<receipt@itsco.health>'});
 m.mailbox.mockResolvedValue({inbox:{id:8},identity:{id:9},fromEmail:'messages@itsco.health',replyTo:'qa-inbox@itsco.health',displayName:'Quality Tester'});m.filing.mockResolvedValue({clientIds:[2298],deferred:false});
 Conversation.create.mockResolvedValue({id:88,agency_id:450,inbox_id:8});Conversation.addMessage.mockResolvedValue(77);Conversation.claimScheduledMessage.mockResolvedValue(true);Conversation.findById.mockResolvedValue({id:88,agency_id:450,inbox_id:8});Conversation.listDueScheduledMessages.mockResolvedValue([queuedRow()]);Conversation.updateMessage.mockResolvedValue();Conversation.update.mockResolvedValue();Inbox.findById.mockResolvedValue({id:8,agency_id:450,sender_identity_id:9});
});
it('preserves only the validated workflow, staff and client IDs through the undo-delay queue',async()=>{
 await expect(composeNewEmail({agencyId:450,userId:1490,payload:payload()})).resolves.toMatchObject({scheduled:true,sent:false});
 expect(m.validate).toHaveBeenCalledWith({agencyId:450,userId:1490,draft:expect.objectContaining({_schoolContact:context})});expect(Conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({from:expect.objectContaining({schoolContact:context,schoolContactClientIds:[2298]})}));expect(m.send).not.toHaveBeenCalled();
});
it('refuses delivery when individual ROI is revoked after queuing but before the undo window ends',async()=>{
 await composeNewEmail({agencyId:450,userId:1490,payload:payload()});m.validate.mockRejectedValue(Object.assign(new Error('Individual ROI was revoked'),{status:403}));
 expect(await processScheduledOutboundSends()).toMatchObject({failed:1,sent:0});expect(m.send).not.toHaveBeenCalled();expect(Conversation.updateMessage).toHaveBeenCalledWith(77,{sendStatus:'failed'});
});
it('rechecks the current provider scope and actual queued recipient/client before transport',async()=>{
 expect(await processScheduledOutboundSends()).toMatchObject({sent:1,failed:0});expect(m.validate).toHaveBeenCalledWith({agencyId:450,userId:1490,draft:{_schoolContact:context,clientIds:[2298],to:'jamie@example.com',cc:'',bcc:''}});expect(m.send).toHaveBeenCalledOnce();expect(m.validate.mock.invocationCallOrder[0]).toBeLessThan(m.send.mock.invocationCallOrder[0]);
});
it('checks again immediately before an immediate send, after any intervening preparation work',async()=>{
 m.validate.mockResolvedValueOnce().mockRejectedValueOnce(Object.assign(new Error('Provider assignment ended'),{status:403}));
 await expect(composeNewEmail({agencyId:450,userId:1490,payload:{...payload(),undoDelaySeconds:0}})).rejects.toMatchObject({status:403});expect(m.validate).toHaveBeenCalledTimes(2);expect(m.send).not.toHaveBeenCalled();expect(Conversation.updateMessage).toHaveBeenCalledWith(77,{sendStatus:'failed'});
});
it('leaves ordinary scheduled communications on their existing send path',async()=>{
 const row=queuedRow();row.from_json={email:'messages@itsco.health'};Conversation.listDueScheduledMessages.mockResolvedValue([row]);expect(await processScheduledOutboundSends()).toMatchObject({sent:1});expect(m.validate).not.toHaveBeenCalled();expect(m.send).toHaveBeenCalledOnce();
});
