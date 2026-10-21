import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),settings:vi.fn(),context:vi.fn(),send:vi.fn(),user:vi.fn(),setup:vi.fn(),event:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../emailSettings.service.js',()=>({getAgencyEmailSettings:m.settings}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:m.context,sendClientPortalEmail:m.send}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn(),sendNotificationEmail:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user,generatePasswordlessToken:m.setup}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:2,name:'ITSCO',slug:'itsco'})}}));
vi.mock('../secureMessageBoundary.service.js',()=>({recordSecureMessageEvent:m.event}));
import {sendSecureMessageNotification,buildSecureClaimRedirect} from '../secureMessageNotify.service.js';
const input={agencyId:2,senderUserId:1001,recipientUserId:1411,recipientEmail:'guardian@example.com',clientId:2240,chatThreadId:44,messageId:77};
beforeEach(()=>{
 vi.resetAllMocks();m.settings.mockResolvedValue({secureClientMessageEmailEnabled:true});
 m.execute.mockImplementation(async sql=>sql.includes('SELECT id, LOWER')?[[{id:2240,client_type:'clinical'}]]:[{insertId:12,affectedRows:1}]);
 m.context.mockResolvedValue({clinical:true,domain:'itsco.health',brand:{replyTo:'support@itsco.health'},url:path=>'https://auricwell.com/itsco/'+path});
 m.user.mockResolvedValue({id:1411,first_name:'Demo',password_hash:'set'});m.send.mockResolvedValue({id:'gmail-id',communicationId:8});
});
it('sends a content-free Conversa alert within AuricWell through the standard portal sender',async()=>{
 const result=await sendSecureMessageNotification(input);expect(result.sent).toBe(true);
 const sent=m.send.mock.calls[0][0];expect(sent.subject).toContain('AuricWell');expect(sent.text).toContain('Messages by Conversa within AuricWell');
 expect(sent.html).toContain('Read secure message');expect(sent.html).toContain('https://auricwell.com/secure-message/');
 expect(sent.clientId).toBe(2240);expect(sent.userId).toBe(1411);expect(sent.context.clinical).toBe(true);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('SET sent_at'),[12]);
});
it('honors the agency alert switch and never records a held email as sent',async()=>{
 m.settings.mockResolvedValue({secureClientMessageEmailEnabled:false});expect(await sendSecureMessageNotification(input)).toMatchObject({sent:false,reason:'disabled'});expect(m.send).not.toHaveBeenCalled();
 m.settings.mockResolvedValue({secureClientMessageEmailEnabled:true});m.send.mockResolvedValue({pendingApproval:true,communicationId:8});
 expect(await sendSecureMessageNotification(input)).toMatchObject({sent:false});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('SET sent_at'))).toBe(false);
});
it('keeps claim login on AuricWell and preserves an already-issued setup link',async()=>{
 const row={agency_id:2,client_id:2240,recipient_user_id:1411,chat_thread_id:44};
 expect((await buildSecureClaimRedirect(row)).loginUrl).toMatch(/^https:\/\/auricwell.com\/itsco\/login\?/);
 m.user.mockResolvedValue({id:1411,passwordless_token:'existing-setup',passwordless_token_purpose:'setup',passwordless_token_expires_at:new Date(Date.now()+86400000)});
 const result=await buildSecureClaimRedirect(row);expect(result.setupUrl).toContain('/itsco/new_account/existing-setup');expect(result.targetPath).toContain('threadId=44');expect(m.setup).not.toHaveBeenCalled();
});
