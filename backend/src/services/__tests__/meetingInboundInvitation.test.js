import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),recipient:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async()=>({id:7})}}));
vi.mock('../messageReminderRecipient.service.js',()=>({messageReminderRecipient:m.recipient}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({ensureTenantNotificationsMailbox:async()=>({notifications:{id:6}})}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {forwardInboundEventInvitation} from '../inboundEventInvitation.service.js';
const args={inbox:{id:1,agency_id:2},userId:7,messageId:10,fromEmail:'host@itsco.health',subject:'Invitation: CPA Meeting',bodyText:'Join the meeting',payload:{parts:[{mimeType:'text/calendar',body:{data:Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR').toString('base64url')}}]}};
beforeEach(()=>{vi.clearAllMocks();m.recipient.mockResolvedValue('personal@example.com');m.execute.mockResolvedValue([{affectedRows:1}]);m.send.mockResolvedValue({id:'sent'});});
it('forwards an event invitation immediately with its calendar attachment and the original host reply address',async()=>{
 await forwardInboundEventInvitation(args);expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to:'personal@example.com',senderIdentityId:6,replyToOverride:args.fromEmail,attachments:[expect.objectContaining({filename:'invitation.ics'})]}));
});
it('does not duplicate an invitation already sent directly to personal email or already claimed',async()=>{
 await forwardInboundEventInvitation({...args,to:['personal@example.com']});expect(m.send).not.toHaveBeenCalled();m.execute.mockResolvedValueOnce([{affectedRows:0}]);await forwardInboundEventInvitation(args);expect(m.send).not.toHaveBeenCalled();
});
it('does not forward ordinary messages or SSO account mail',async()=>{
 await forwardInboundEventInvitation({...args,payload:{mimeType:'text/plain'}});m.recipient.mockResolvedValue(null);await forwardInboundEventInvitation(args);expect(m.send).not.toHaveBeenCalled();
});
