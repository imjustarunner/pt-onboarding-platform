import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])},onTableWrite:()=>{}}));
vi.mock('../../models/CommunicationConversation.model.js',()=>({default:{listDueScheduledMessages:vi.fn(),claimScheduledMessage:vi.fn(async()=>true),findById:vi.fn(async()=>({id:10,agency_id:2,inbox_id:3,external_thread_id:'original-thread'})),update:vi.fn(async()=>{}),updateMessage:vi.fn(async()=>{})}}));
vi.mock('../../models/CommunicationInbox.model.js',()=>({default:{findById:vi.fn(async()=>({id:3,agency_id:2,owner_user_id:5,sender_identity_id:7,from_email:'staff@tenant.test'}))}}));
vi.mock('../emailSendMailbox.service.js',()=>({resolveEmailSendMailbox:vi.fn(async()=>({identity:{id:7},replyTo:'staff@tenant.test',displayName:'Staff'}))}));
vi.mock('../personalThreadReminder.service.js',()=>({personalReplySendMailbox:vi.fn(async()=>({identity:{id:44},replyTo:'messages@tenant.test',fromEmail:'messages@tenant.test',displayName:'Messages'}))}));
vi.mock('../communicationAttachments.service.js',()=>({loadOutboundAttachments:vi.fn(async()=>[])}));
vi.mock('../hubRecipientDelivery.service.js',()=>({findAgencyUserIdByEmail:vi.fn(async()=>null)}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn(async()=>({id:'sent',internetMessageId:'<bridge@tenant.test>',threadId:'original-thread'}))}));
import Conversation from '../../models/CommunicationConversation.model.js';
import {personalReplySendMailbox} from '../personalThreadReminder.service.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {processScheduledOutboundSends} from '../unifiedInbox.service.js';
beforeEach(()=>{vi.clearAllMocks();Conversation.listDueScheduledMessages.mockResolvedValue([{id:20,conversation_id:10,author_user_id:5,to_json:[{email:'client@example.org'}],cc_json:[],bcc_json:[],body_text:'Confirmed.',subject:'Re: Meeting',in_reply_to:'<external@example.org>',references_header:'<external@example.org>',personal_reply_reminder_id:11}]);});
it('sends an authenticated personal reply through messages@ with the original external reply headers',async()=>{
 expect(await processScheduledOutboundSends()).toMatchObject({sent:1});
 expect(personalReplySendMailbox).toHaveBeenCalledWith(expect.objectContaining({reminderId:11,conversationId:10,userId:5}));
 expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:44,replyToOverride:'messages@tenant.test',to:'client@example.org',inReplyTo:'<external@example.org>',references:'<external@example.org>'}));
 expect(Conversation.updateMessage).toHaveBeenCalledWith(20,expect.objectContaining({internetMessageId:'<bridge@tenant.test>',sendStatus:'sent'}));
});
it('does not send when permission is revoked during the undo window',async()=>{
 personalReplySendMailbox.mockRejectedValueOnce(new Error('Personal reply permissions changed.'));
 expect(await processScheduledOutboundSends()).toMatchObject({failed:1,sent:0});expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
