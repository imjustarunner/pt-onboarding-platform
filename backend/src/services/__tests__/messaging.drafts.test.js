vi.mock('../inboxDigest.service.js',()=>({getCommunicationPrefs:vi.fn(async()=>({sendDelayEmailSeconds:20}))}));
vi.mock('../emailDeliveryChoice.service.js',()=>({planEmailDelivery:vi.fn(async()=>({choice:'now',recipientIds:[],scheduledAt:null}))}));
import {planEmailDelivery} from '../emailDeliveryChoice.service.js';
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[{id:2}])}}));
vi.mock('../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn(async()=>({id:10,agency_id:2,channel:'email'}))}));
vi.mock('../unifiedInbox.service.js',()=>({composeNewEmail:vi.fn(),replyToConversation:vi.fn()}));
vi.mock('../emailSendMailbox.service.js',()=>({resolveEmailSendMailbox:vi.fn()}));
vi.mock('../../models/CommunicationInbox.model.js',()=>({default:{findById:vi.fn(async()=>({id:3}))}}));
import {resolveEmailSendMailbox} from '../emailSendMailbox.service.js';
import pool from '../../config/database.js';
import {createEmailDraft,getEmailDraft,getEmailDraftSender,saveEmailDraft,sendEmailDraft,validateEmailDraft} from '../emailDraft.service.js';
import {replyToConversation} from '../unifiedInbox.service.js';
const actor={id:5,role:'provider'};
const draft={id:'draft',user_id:5,agency_id:2,conversation_id:10,mode:'reply',version:2,state:'editing',draft_json:JSON.stringify({to:'alice@example.org',text:'Hello',quotedText:'Prior email',attachments:[]})};
it('resolves sender previews separately from draft persistence and scopes them to the author',async()=>{
 pool.execute.mockResolvedValueOnce([[draft]]);
 resolveEmailSendMailbox.mockResolvedValue({fromEmail:'messages@itsco.health',replyTo:'thughes@itsco.health'});
 expect(await getEmailDraftSender(actor,'draft')).toEqual({fromEmail:'messages@itsco.health',replyTo:'thughes@itsco.health'});
 expect(pool.execute.mock.calls[0][1]).toEqual(['draft',5]);
 expect(resolveEmailSendMailbox).toHaveBeenCalledWith({agencyId:2,userId:5,inbox:{id:3}});
 pool.execute.mockResolvedValueOnce([[draft]]);
 await expect(getEmailDraftSender({...actor,scopedAgencyId:3},'draft')).rejects.toMatchObject({status:404});
});
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockReset();pool.execute.mockResolvedValue([[draft]]);});
it('restricts Quick View drafts to the session organization',async()=>{await expect(getEmailDraft({...actor,scopedAgencyId:3},'draft')).rejects.toMatchObject({status:404});});
it('looks up drafts by their author, never just by conversation or ID',async()=>{pool.execute.mockResolvedValue([[]]);await expect(getEmailDraft(actor,'someone-elses-draft')).rejects.toMatchObject({status:404});expect(pool.execute.mock.calls[0][1]).toEqual(['someone-elses-draft',5]);});
it('rejects stale saves from another window',async()=>{pool.execute.mockResolvedValueOnce([[draft]]).mockResolvedValueOnce([{affectedRows:0}]);await expect(saveEmailDraft(actor,'draft',{version:1,draft:{text:'Older'}})).rejects.toMatchObject({status:409});});
it('claims one send and returns the same receipt for retries',async()=>{pool.execute.mockResolvedValueOnce([[draft]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);replyToConversation.mockResolvedValue({messageId:40});expect(await sendEmailDraft(actor,'draft',2)).toMatchObject({messageId:40,conversationId:10});pool.execute.mockResolvedValueOnce([[{...draft,state:'sent',send_result_json:JSON.stringify({messageId:40,conversationId:10})}]]);expect(await sendEmailDraft(actor,'draft',2)).toMatchObject({messageId:40});expect(replyToConversation).toHaveBeenCalledTimes(1);});
it('cannot queue a second send while a first submission is in progress',async()=>{pool.execute.mockResolvedValueOnce([[{...draft,state:'sending'}]]).mockResolvedValueOnce([{affectedRows:0}]);await expect(sendEmailDraft(actor,'draft',2)).rejects.toMatchObject({status:409});expect(replyToConversation).not.toHaveBeenCalled();});
it('validates headers and attachment totals before saving',()=>{expect(()=>validateEmailDraft({to:'a@example.org\nBcc:b@example.org'})).toThrow('headers');expect(()=>validateEmailDraft({attachments:[{contentBase64:''}]})).toThrow('25 MB');});

it('keeps a draft editable when availability needs a choice, then passes the choice to delivery',async()=>{
 const prompt=Object.assign(new Error('Choose delivery'),{status:409,code:'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED'});
 planEmailDelivery.mockRejectedValueOnce(prompt);
 await expect(sendEmailDraft(actor,'draft',2)).rejects.toBe(prompt);
 expect(pool.execute).toHaveBeenCalledTimes(1);expect(replyToConversation).not.toHaveBeenCalled();
 pool.execute.mockResolvedValueOnce([[draft]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 await sendEmailDraft(actor,'draft',2,'now');
 expect(planEmailDelivery).toHaveBeenLastCalledWith(expect.objectContaining({choice:'now',requireChoice:true}));
 expect(replyToConversation).toHaveBeenCalledWith(10,expect.objectContaining({deliveryPlan:expect.objectContaining({choice:'now'})}),{userId:5});
});

it('persists sanitized formatted history and passes it separately from the new writing to delivery',async()=>{
 const raw=validateEmailDraft({to:'alice@example.org',text:'Thank you',quotedText:'Wrapped\nMIME text',quotedHtml:'<p>A complete paragraph.</p><script>alert(1)</script><img src="https://example.org/signature.png" onerror="alert(1)">'});
 expect(raw.quotedHtml).toContain('<p>A complete paragraph.</p>');expect(raw.quotedHtml).not.toMatch(/script|onerror/);
 pool.execute.mockResolvedValueOnce([[{...draft,draft_json:JSON.stringify(raw)}]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 replyToConversation.mockResolvedValue({messageId:40});await sendEmailDraft(actor,'draft',2);
 const payload=replyToConversation.mock.calls[0][1];expect(payload.html).toContain('<p>A complete paragraph.</p>');expect(payload.html).not.toContain('MIME text');expect(payload.html).toContain('pt-quoted-email-history');expect(payload.text).toContain('Wrapped\nMIME text');
});

it('persists a chosen delay and passes it to the send queue instead of forcing 20 seconds',async()=>{
 const raw=validateEmailDraft({to:'alice@example.org',text:'Hello',undoDelaySeconds:120});
 expect(raw.undoDelaySeconds).toBe(120);
 pool.execute.mockResolvedValueOnce([[{...draft,draft_json:JSON.stringify(raw)}]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 replyToConversation.mockResolvedValue({messageId:40,scheduled:true});await sendEmailDraft(actor,'draft',2);
 expect(replyToConversation).toHaveBeenCalledWith(10,expect.objectContaining({undoDelaySeconds:120}),{userId:5});
});
it.each([-1,0,601,1.5,'invalid'])('rejects invalid draft send delay %s',undoDelaySeconds=>{
 expect(()=>validateEmailDraft({undoDelaySeconds})).toThrow('send delay');
});

it('retains the private draft while scheduled so Undo survives closing and reopening the composer',async()=>{
 pool.execute.mockResolvedValueOnce([[draft]]).mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 replyToConversation.mockResolvedValue({messageId:40,scheduled:true,sent:false});await sendEmailDraft(actor,'draft',2);
 const save=pool.execute.mock.calls.find(([sql])=>sql.includes("state='sent',send_result_json"));
 expect(JSON.parse(save[1][1])).toMatchObject({text:'Hello',to:'alice@example.org',quotedText:'Prior email'});
});
