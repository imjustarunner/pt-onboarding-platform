import {it,expect,vi} from 'vitest';
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
import {sendWebsiteTicketReply} from '../publicWebsiteTicketReply.service.js';
it('never emails kiosk support reply content to the kiosk address',async()=>{const send=vi.fn();const result=await sendWebsiteTicketReply({created_by_source_key:'office_kiosk_support',source_channel:'public_web',source_email_from:'kiosk@example.test'},'Sensitive reply',{send,identities:{}});expect(result.sent).toBe(false);expect(send).not.toHaveBeenCalled();});
