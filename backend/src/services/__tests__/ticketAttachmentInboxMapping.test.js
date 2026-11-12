import{beforeEach,expect,it,vi}from'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/CommunicationConversation.model.js',()=>({default:{findBySupportTicketId:vi.fn(async()=>({id:700})),upsertLink:vi.fn(),upsertParticipant:vi.fn(),addMessage:vi.fn(async()=>800),addAttachment:vi.fn(),update:vi.fn()}}));
vi.mock('../../models/CommunicationInbox.model.js',()=>({default:{ensureFromSenderIdentities:vi.fn(),listForAgency:vi.fn(async()=>[])}}));
import pool from'../../config/database.js';import Conversation from'../../models/CommunicationConversation.model.js';import{syncEmailTicketsToInbox}from'../ticketEmailInboxAdapter.service.js';
beforeEach(()=>vi.clearAllMocks());
it('does not misattribute a new unbound browser upload to a historical inbound email',async()=>{
 const files=[{id:1,file_name:'old-email.pdf',file_path:'uploads/ticket_attachments/ticket_553/old.pdf',support_ticket_message_id:null},{id:2,file_name:'new-private.pdf',file_path:'private-ticket-attachments/450/553/'+'a'.repeat(64)+'.ticket.enc',support_ticket_message_id:null},{id:3,file_name:'explicit-link.pdf',file_path:'private-ticket-attachments/450/553/'+'b'.repeat(64)+'.ticket.enc',support_ticket_message_id:11}];
 const connection={release:vi.fn(),execute:vi.fn(async sql=>{if(sql.includes('GET_LOCK'))return[[{acquired:1}]];if(sql.includes('SELECT m.*'))return[[{id:11,email_id:6,email_direction:'inbound',email_send_status:'received',author_role:'system_email',body:'Synthetic original',created_at:'2026-11-01T12:00:00Z'}]];if(sql.includes('FROM support_ticket_attachments'))return[files];return[[]];})};
 pool.getConnection.mockResolvedValue(connection);pool.execute.mockResolvedValue([[{id:553,agency_id:450,school_organization_id:451,source_channel:'email',created_at:'2026-11-01T12:00:00Z',subject:'Synthetic original',topic:'general'}]]);
 await syncEmailTicketsToInbox({agencyId:450,ticketId:553});
 expect(Conversation.addAttachment.mock.calls.map(([,file])=>file.filename)).toEqual(['old-email.pdf','explicit-link.pdf']);expect(Conversation.addAttachment).not.toHaveBeenCalledWith(expect.anything(),expect.objectContaining({filename:'new-private.pdf'}));expect(connection.release).toHaveBeenCalledOnce();
});
