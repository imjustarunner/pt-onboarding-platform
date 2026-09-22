import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),recipient:vi.fn(),execute:vi.fn(),prepare:vi.fn(),persist:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({name:'ITSCO'})}}));
vi.mock('../messageReminderRecipient.service.js',()=>({messageReminderRecipient:m.recipient}));
vi.mock('../personalMailbox.service.js',()=>({ensurePersonalMailbox:async()=>({id:1,from_email:'provider@itsco.health'})}));
vi.mock('../communicationAttachments.service.js',()=>({prepareInboundAttachments:m.prepare}));
vi.mock('../inboundEmailPersistence.service.js',()=>({persistInboundEmail:m.persist}));
import {priorityEventEmailRecipient,savePriorityEventInboxCopy,retryPriorityEventInboxCopies} from '../priorityEventEmail.service.js';
const args={agencyId:2,userId:7,templateType:'meeting_invited',to:'provider@itsco.health',subject:'Invitation: CPA Meeting'};
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({email:'provider@itsco.health',personal_email:'personal@example.com'});m.recipient.mockResolvedValue('personal@example.com');m.execute.mockResolvedValue([[]]);m.prepare.mockResolvedValue([{filename:'meeting.ics',storageKey:'stored'}]);m.persist.mockResolvedValue({messageId:10});});
it('sends a priority invitation immediately to the verified app-only personal recipient with tenant branding',async()=>{
 expect(await priorityEventEmailRecipient(args)).toEqual({to:'personal@example.com',subject:'ITSCO: Invitation: CPA Meeting',personal:true,appOnly:true});
});
it('keeps SSO invitations on work email and does not redirect an unrelated or multiple recipient',async()=>{
 m.recipient.mockResolvedValue(null);expect((await priorityEventEmailRecipient(args)).to).toBe(args.to);
 expect((await priorityEventEmailRecipient({...args,to:'another@example.com'})).to).toBe('another@example.com');
 expect((await priorityEventEmailRecipient({...args,to:[args.to]})).to).toEqual([args.to]);
});
it('preserves ordinary message delivery and avoids duplicate personal subject prefixes',async()=>{
 expect((await priorityEventEmailRecipient({...args,templateType:'ordinary_message'})).to).toBe(args.to);expect(m.recipient).not.toHaveBeenCalled();
 expect((await priorityEventEmailRecipient({...args,subject:'ITSCO: Meeting'})).subject).toBe('ITSCO: Meeting');
});
it('does not create staff inbox copies for an applicant whose personal email is already addressed',async()=>{
 m.recipient.mockResolvedValue(null);expect((await priorityEventEmailRecipient({...args,to:'personal@example.com'})).appOnly).toBe(false);
});
it('persists the attachment and inbox message atomically and retries a failed preparation without resending email',async()=>{
 const copy={...args,messageId:'gmail-id',attachments:[{filename:'meeting.ics',contentBase64:'aWNhbA=='}]};
 m.prepare.mockRejectedValueOnce(new Error('storage unavailable'));await expect(savePriorityEventInboxCopy(copy)).rejects.toThrow('storage unavailable');
 expect(m.persist).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalledWith(expect.stringContaining('SET completed_at'),expect.anything());
 m.execute.mockResolvedValueOnce([[{payload_json:copy}]]);await retryPriorityEventInboxCopies();
 expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({deliveryId:'event-email:gmail-id',attachments:[{filename:'meeting.ics',storageKey:'stored'}]}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('SET completed_at'),['gmail-id']);
});
