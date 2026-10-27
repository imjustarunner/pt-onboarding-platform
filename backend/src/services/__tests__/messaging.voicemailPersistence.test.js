import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()}}));
vi.mock('../clientConversationRecord.service.js',()=>({autoFileEmailMessage:vi.fn()}));
vi.mock('../parentContact.service.js',()=>({syncEmailParentContact:vi.fn()}));
import pool from '../../config/database.js';
import {persistInboundEmail} from '../inboundEmailPersistence.service.js';
let db,receipts,conversations,messages;
beforeEach(()=>{
 receipts=new Map();conversations=0;messages=0;
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,p=[])=>{
 if(sql.startsWith('SELECT id FROM communication_inboxes'))return [[{id:1}]];
 if(sql.startsWith('SELECT message_id FROM communication_email_receipts'))return [receipts.has(p[1])?[{message_id:receipts.get(p[1])}]:[]];
 if(sql.startsWith('SELECT m.id, m.conversation_id'))return [[]];
 if(sql.startsWith('INSERT INTO communication_conversations'))return [{insertId:++conversations}];
 if(sql.startsWith('INSERT INTO communication_messages'))return [{insertId:++messages}];
 if(sql.startsWith('INSERT INTO communication_email_receipts')){receipts.set(p[1],p[2]);return [{}];}
 if(sql.startsWith('SELECT conversation_id FROM communication_messages'))return [[{conversation_id:p[0]}]];
 if(sql.startsWith('SELECT'))throw new Error('Unexpected threading lookup: '+sql);
 return [{}];
 })};pool.getConnection.mockResolvedValue(db);
});
it('keeps different voicemail callers separate even when Gmail reuses a thread, and deduplicates retries',async()=>{
 const common={inboxId:1,agencyId:2,fromEmail:'help@grasshopper.com',threadId:'shared-gmail-thread',inReplyTo:'<previous@example.test>',bodyText:'Voicemail transcription: please call back.',attachments:[{filename:'recording.mp3',contentType:'audio/mpeg',sizeBytes:10,storageKey:'communication-attachments/test'}]};
 const first=await persistInboundEmail({...common,deliveryId:'one',subject:'Voicemail from 303-555-1234'});
 const second=await persistInboundEmail({...common,deliveryId:'two',subject:'Voicemail from 720-555-4321'});
 expect(first.conversationId).not.toBe(second.conversationId);
 const retry=await persistInboundEmail({...common,deliveryId:'one',subject:'Voicemail from 303-555-1234'});
 expect(retry.duplicate).toBe(true);expect(conversations).toBe(2);expect(messages).toBe(2);
 expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO communication_attachments'))).toHaveLength(2);
});
