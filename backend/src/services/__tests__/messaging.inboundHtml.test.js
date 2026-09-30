import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
import pool from '../../config/database.js';
import { readGmailBodyHtml } from '../../utils/gmailMessageParse.shared.js';
import { persistInboundEmail } from '../inboundEmailPersistence.service.js';
const encoded=value=>Buffer.from(value).toString('base64url');
const signature='<p>Hello</p><div class="gmail_signature"><img src="https://ci3.googleusercontent.com/signature" width="420"></div>';
it('retains the HTML alternative in nested MIME without mixing in attached HTML or forwarded emails',async()=>{
 const payload={mimeType:'multipart/mixed',parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:encoded('Hello')}},{mimeType:'text/html',body:{data:encoded(signature)}}]},{mimeType:'text/html',filename:'page.html',body:{data:encoded('Attachment')}},{mimeType:'message/rfc822',parts:[{mimeType:'text/html',body:{data:encoded('Forwarded attachment')}}]},{mimeType:'text/html',headers:[{name:'Content-Disposition',value:'attachment'}],body:{data:encoded('Unnamed attachment')}}]};
 expect(await readGmailBodyHtml(payload)).toBe(signature);
 expect(await readGmailBodyHtml({mimeType:'text/plain',body:{data:encoded('Plain')}})).toBeNull();
});
it('downloads an HTML body stored by Gmail as a separate part',async()=>{
 const get=vi.fn(async()=>({data:{data:encoded(signature)}}));
 const gmail={users:{messages:{attachments:{get}}}};
 expect(await readGmailBodyHtml({mimeType:'text/html',body:{attachmentId:'html-part'}},{gmail,gmailMessageId:'message-1'})).toBe(signature);
 expect(get).toHaveBeenCalledWith({userId:'me',messageId:'message-1',id:'html-part'});
});
let db;
beforeEach(()=>{
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
  if(sql.startsWith('SELECT id FROM communication_inboxes')||sql.startsWith('SELECT id FROM communication_conversations WHERE id'))return [[{id:3}]];
  if(sql.startsWith('INSERT INTO communication_messages'))return [{insertId:50}];
  return [[]];
 })};pool.getConnection.mockResolvedValue(db);
});
it('persists both body alternatives in the inbox transaction, retaining idempotency and attachments',async()=>{
 await persistInboundEmail({inboxId:3,agencyId:2,conversationId:10,deliveryId:'<message@example.org>',fromEmail:'sender@example.org',bodyText:'Hello',bodyHtml:signature,attachments:[{filename:'file.pdf',contentType:'application/pdf',sizeBytes:10,storageKey:'private/file'}]});
 const [sql,args]=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO communication_messages'));
 expect(sql).toContain('body_text, body_html');expect(sql.match(/\?/g)).toHaveLength(args.length);
 expect(args[5]).toBe('Hello');expect(args[6]).toBe(signature);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO communication_attachments'))).toBe(true);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO communication_email_receipts'))).toBe(true);
 expect(db.commit).toHaveBeenCalledOnce();
});
it('does not create another message when restoring a delivery already received',async()=>{
 db.execute.mockImplementation(async sql=>sql.startsWith('SELECT id FROM communication_inboxes')?[[{id:3}]]:sql.startsWith('SELECT message_id FROM communication_email_receipts')?[[{message_id:50}]]:[[{conversation_id:10}]]);
 expect(await persistInboundEmail({inboxId:3,agencyId:2,deliveryId:'<same@example.org>',bodyHtml:signature})).toMatchObject({duplicate:true,messageId:50});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO communication_messages'))).toBe(false);
});
