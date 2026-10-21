import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({download:vi.fn(),exists:vi.fn(async()=>[true])}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../storage.service.js',()=>({default:{getGCSBucket:async()=>({file:()=>({download:m.download,exists:m.exists})})}}));
vi.mock('../unifiedEmail/gmailClient.js',()=>({getGmailClient:vi.fn()}));
import {encryptGuardianScreenshot} from '../guardianPortalScreenshotEncryption.service.js';
import {readTicketAttachmentBuffer} from '../unifiedEmail/ticketInboundAttachments.service.js';
beforeEach(()=>{vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,8).toString('base64'));vi.clearAllMocks();});
afterEach(()=>vi.unstubAllEnvs());
it('decodes a protected portal screenshot only for its recorded ticket',async()=>{
 const original=Buffer.from('synthetic screenshot bytes');m.download.mockResolvedValue([encryptGuardianScreenshot(original,{ticketId:71})]);
 expect(await readTicketAttachmentBuffer({ticket_id:71,file_path:'support-tickets/2/71/demo.guardian.enc'})).toEqual(original);
 await expect(readTicketAttachmentBuffer({ticket_id:72,file_path:'support-tickets/2/71/demo.guardian.enc'})).rejects.toThrow('does not belong');
});
it('rejects ciphertext tampering instead of returning unreadable or unprotected bytes',async()=>{
 const envelope=JSON.parse(encryptGuardianScreenshot(Buffer.from('image'),{ticketId:71}).toString());const data=Buffer.from(envelope.ciphertextB64,'base64');data[0]^=1;envelope.ciphertextB64=data.toString('base64');m.download.mockResolvedValue([Buffer.from(JSON.stringify(envelope))]);
 await expect(readTicketAttachmentBuffer({ticket_id:71,file_path:'support-tickets/2/71/demo.guardian.enc'})).rejects.toThrow();
});
it('continues to read existing ordinary attachments without changing their format',async()=>{const original=Buffer.from('%PDF synthetic legacy file');m.download.mockResolvedValue([original]);expect(await readTicketAttachmentBuffer({ticket_id:71,file_path:'uploads/ticket_attachments/ticket_71/old.pdf'})).toEqual(original);});
