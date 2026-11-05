import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../supportTicketEmail.service.js',()=>({preserveSupportTicketEmailCanonical:vi.fn()}));
import pool from '../../config/database.js';
import { backfillDepartmentalEmailTickets, prepareDepartmentalConversationBackfill } from '../departmentalEmailBackfill.service.js';
import { decryptChatText } from '../chatEncryption.service.js';

let conversation, messages, attachments, db, storedTickets, storedMessages, conflict, corruptReadback, linkedTicket;
const instant = '2026-11-01 10:00:00';
function insertValues(sql,params) {
  const match=sql.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/s);
  const columns=match[1].split(',').map(value=>value.trim());
  const values=match[2].split(',').map(value=>value.trim());
  expect(values).toHaveLength(columns.length);
  expect(values.filter(value=>value==='?')).toHaveLength(params.length);
  let index=0;
  return Object.fromEntries(columns.map((column,i)=>[column,values[i]==='?'?params[index++]:null]));
}
beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,17).toString('base64');
  conflict=false;corruptReadback=false;linkedTicket=false;storedTickets=new Map();storedMessages=new Map();
  conversation={id:4,agency_id:2,inbox_id:6,kind:'shared',inbox_owner_user_id:null,identity_key:'payroll',from_email:'payroll@agency.test',owner_user_id:9,
    subject:'Pay question',status:'waiting_on_them',priority:'normal',external_thread_id:'gmail-thread',created_at:instant,updated_at:instant};
  messages=[
    {id:12,direction:'inbound',body_text:'Original question',from_json:{email:'person@example.org'},to_json:[{email:'payroll@agency.test'}],created_at:instant,sent_at:instant},
    {id:13,direction:'outbound',body_text:'Sent answer',from_json:{email:'payroll@agency.test'},to_json:[{email:'person@example.org'}],send_status:'sent',author_user_id:9,created_at:instant,sent_at:instant},
    {id:14,direction:'internal',is_internal_note:1,body_text:'Private team note',author_user_id:9,created_at:instant}
  ];
  attachments=[{id:3,message_id:12,filename:'receipt.pdf',storage_key:'communications/2/receipt.pdf',content_type:'application/pdf',size_bytes:24,created_at:instant}];
  const execute=vi.fn(async(sql,params=[])=>{
    expect((sql.match(/\?/g)||[]).length).toBe(params.length);
    if(sql.includes('SELECT GET_LOCK'))return [[{acquired:1}]];
    if(sql.startsWith('SELECT c.*'))return [conversation.support_ticket_id && !sql.includes('FOR UPDATE')?[]:[{...conversation}]];
    if(sql.startsWith('SELECT * FROM communication_messages'))return [messages];
    if(sql.startsWith('SELECT a.* FROM communication_attachments'))return [attachments];
    if(sql.startsWith('SELECT ticket_id FROM support_ticket_email_messages'))return [conflict?[{ticket_id:71}]:[]];
    if(sql.startsWith('SELECT entity_id FROM communication_links'))return [linkedTicket?[{entity_id:72}]:[]];
    if(sql.startsWith('SELECT id FROM support_tickets'))return [[]];
    if(sql.startsWith('INSERT INTO support_tickets')){storedTickets.set(71,insertValues(sql,params));return [{insertId:71}];}
    if(sql.startsWith('INSERT INTO support_ticket_messages')){const id=81+storedMessages.size;storedMessages.set(id,insertValues(sql,params));return [{insertId:id}];}
    if(sql.startsWith('SELECT * FROM support_tickets'))return [[storedTickets.get(params[0])]];
    if(sql.startsWith('SELECT * FROM support_ticket_messages'))return [[{...storedMessages.get(params[0]),...(corruptReadback?{body_auth_tag:'invalid'}:{})}]];
    if(sql.startsWith('UPDATE communication_conversations'))conversation.support_ticket_id=params[0];
    return [[]];
  });
  db={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(async()=>{}),release:vi.fn()};
  pool.execute.mockImplementation(execute);pool.getConnection.mockResolvedValue(db);
});

it('previews message and attachment counts without writing or exposing bodies',async()=>{
  const report=await backfillDepartmentalEmailTickets({agencyId:2});
  expect(report.results).toEqual([{conversationId:4,groupKey:'payroll',status:'ready',messages:3,attachments:1}]);
  expect(pool.getConnection).not.toHaveBeenCalled();
  expect(JSON.stringify(report)).not.toContain('Original question');
});

it('atomically encrypts full history, retains claimant/reply status, and reuses attachment storage',async()=>{
  const report=await backfillDepartmentalEmailTickets({agencyId:2,apply:true});
  expect(report.results).toEqual([{conversationId:4,ticketId:71,groupKey:'payroll',status:'migrated',messages:3,attachments:1}]);
  expect(storedTickets.get(71)).toMatchObject({claimed_by_user_id:9,status:'answered',topic:'payroll',question:null});
  for(const [index,stored] of [...storedMessages.values()].entries()) {
    expect(stored.body).toBeNull();
    expect(decryptChatText({ciphertextB64:stored.body_ciphertext,ivB64:stored.body_iv,authTagB64:stored.body_auth_tag,keyId:stored.encryption_key_id})).toBe(messages[index].body_text);
  }
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO support_ticket_attachments'),[71,81,'receipt.pdf','communications/2/receipt.pdf','application/pdf',24,instant]);
  expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE communication_messages'))).toHaveLength(3);
  expect(db.commit).toHaveBeenCalledTimes(1);
  expect((await backfillDepartmentalEmailTickets({agencyId:2,apply:true})).results).toEqual([]);
});

it('leaves drafts, unsent messages, rich HTML history, and missing attachments for review',()=>{
  for(const [source,history,files,code] of [
    [{...conversation,draft_body:'Unsent draft'},messages,attachments,'UNFINISHED_DRAFT'],
    [conversation,[messages[0],{...messages[1],send_status:'queued'}],attachments,'UNSENT_OUTBOUND_MESSAGE'],
    [conversation,[{...messages[0],body_text:null,body_html:'<p>HTML only</p>'}],attachments,'HTML_HISTORY_REQUIRES_REVIEW'],
    [conversation,[{...messages[0],body_html:'<p>Question with <a href="https://example.org/receipt">receipt link</a></p>'}],attachments,'HTML_HISTORY_REQUIRES_REVIEW'],
    [conversation,messages,[{...attachments[0],storage_key:null}],'ATTACHMENT_STORAGE_REQUIRES_REVIEW']
  ]) expect(()=>prepareDepartmentalConversationBackfill(source,history,files)).toThrow(code);
});

it('does not create another ticket when a delivery receipt already owns this message',async()=>{
  conflict=true;
  const report=await backfillDepartmentalEmailTickets({agencyId:2,apply:true});
  expect(report.results[0]).toMatchObject({status:'needs_review',reason:'EXISTING_TICKET_HISTORY_REQUIRES_REVIEW'});
  expect(storedTickets.size).toBe(0);expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
});

it('preserves a manually attached ticket link without creating another ticket',async()=>{
  linkedTicket=true;
  for(const apply of [false,true]) {
    const report=await backfillDepartmentalEmailTickets({agencyId:2,apply});
    expect(report.results[0]).toMatchObject({status:'needs_review',reason:'EXISTING_TICKET_LINK_REQUIRES_REVIEW'});
  }
  expect(storedTickets.size).toBe(0);expect(db.commit).not.toHaveBeenCalled();
});

it('rolls back failed ciphertext verification before clearing any source text',async()=>{
  corruptReadback=true;
  expect((await backfillDepartmentalEmailTickets({agencyId:2,apply:true})).results[0].status).toBe('failed');
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE communication_messages'))).toBe(false);
  expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
});
