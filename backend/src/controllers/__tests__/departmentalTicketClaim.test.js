import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/ticketAssignment.service.js',()=>({listEligibleTicketAssignees:vi.fn(),recordTicketAssignment:vi.fn(),ticketAssignmentHistory:vi.fn(),setTicketAssignment:vi.fn(async()=>{throw Object.assign(Error('ownership changed'),{status:409});})}));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../services/departmentalGroupAccess.service.js', async importOriginal => ({
  ...await importOriginal(), listUserDepartmentalGroupKeys: vi.fn(async () => ['payroll'])
}));
vi.mock('../../services/supportTicketDepartmentAccess.service.js', () => ({
  ticketDepartmentKeys: vi.fn(async ticket => ticket.source_channel === 'email' ? [ticket.topic] : []),
  canWorkDepartmentTicket: vi.fn(async ({ ticket }) => ticket.source_channel === 'email' && ticket.topic === 'payroll'),
  appendDepartmentTicketVisibility: vi.fn()
}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Agency from '../../models/Agency.model.js';
import { claimSupportTicket } from '../supportTickets.controller.js';
import { closeSupportTicket } from '../supportTickets.controller.js';
vi.mock('../../services/closeTicketWithoutReply.service.js', () => ({ closeTicketWithoutReply: vi.fn() }));
vi.mock('../../services/peopleOperationsAccess.service.js',()=>({canAccessPeopleOperations:vi.fn(async()=>false),appendPeopleOperationsTicketVisibility:vi.fn(),peopleOperationsRecipients:vi.fn(async()=>[]),peopleOperationsAgencyIds:vi.fn(async()=>[])}));
import {canAccessPeopleOperations,appendPeopleOperationsTicketVisibility} from '../../services/peopleOperationsAccess.service.js';
import {authorizeSupportTicketConversation,listSupportTicketMessages,createSupportTicketMessage,listSupportTicketAttachments,listClientSupportTickets,getClientSupportTicketThread} from '../supportTickets.controller.js';
import { closeTicketWithoutReply } from '../../services/closeTicketWithoutReply.service.js';

let ticket;
let affectedRows;
const request = () => ({ user: { id: 5, role: 'provider' }, params: { id: '101' }, body: {} });
const response = () => ({ locals:{}, status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  canAccessPeopleOperations.mockResolvedValue(false);
  ticket = { id: 101, agency_id: 2, school_organization_id: null, topic: 'payroll', source_channel: 'email', claimed_by_user_id: null };
  affectedRows = 1;
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  Agency.findById.mockResolvedValue({ id: 2, organization_type: 'agency' });
  pool.execute.mockImplementation(async sql => sql.startsWith('UPDATE support_tickets') ? [{ affectedRows }] : [[ticket]]);
});

it('does not give providers ownership even when they have a departmental grant',async()=>{
 const res=response();await claimSupportTicket(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE support_tickets'))).toBe(false);
});

it.each(['billing', 'general'])('does not let payroll permission claim unrelated %s tickets', async topic => {
  ticket.topic = topic;
  if (topic === 'general') ticket.source_channel = 'portal';
  const res = response();
  await claimSupportTicket(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});

it('returns a conflict when another claim wins the atomic update', async () => {
  affectedRows = 0;
  const res = response();
  const next=vi.fn();await claimSupportTicket({...request(),user:{id:5,role:'support'}}, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
});
it('uses the no-reply transaction only after checking the caller’s department and agency', async () => {
  const req = request(); req.body = { reason: 'no_reply_needed', expectedLastMessageId: 12 };
  const res = response(), next = vi.fn();
  await closeSupportTicket(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(closeTicketWithoutReply).toHaveBeenCalledWith({ ticket, user: req.user, expectedLastMessageId: 12 });
  expect(res.json).toHaveBeenCalledWith(ticket);
});
it('does not use no-reply closure to bypass another department’s ticket restriction', async () => {
  ticket.topic = 'billing'; const req = request(); req.body = { reason: 'no_reply_needed' };
  const res = response(); await closeSupportTicket(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(closeTicketWithoutReply).not.toHaveBeenCalled();
});

it('does not let payroll rights or a prior claim open a People Operations queue',async()=>{
 ticket.topic='people_operations';ticket.claimed_by_user_id=5;
 const req={...request(),user:{id:5,role:'support'}},res=response();
 await claimSupportTicket(req,res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);
 expect(canAccessPeopleOperations).toHaveBeenCalledWith(5,2);
});
it('allows a staff member with current company People Operations permission to claim',async()=>{
 ticket.topic='people_operations';ticket.source_channel='portal';canAccessPeopleOperations.mockResolvedValue(true);
 const req={...request(),user:{id:5,role:'staff'}},res=response(),next=vi.fn();
 await claimSupportTicket(req,res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
 expect(res.status).not.toHaveBeenCalledWith(403);
});
it('keeps an employee requester’s public conversation separate from queue authority',async()=>{
 ticket.topic='people_operations';ticket.source_channel='portal';ticket.created_by_user_id=5;
 const req={...request(),user:{id:5,role:'support'}};
 await expect(authorizeSupportTicketConversation(req,ticket)).resolves.toMatchObject({peopleOperationsRequesterOnly:true});
 const res=response();await claimSupportTicket({...request(),user:{id:5,role:'support'}},res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);
});
it('prevents a requester from posting staff-only People Operations notes',async()=>{
 ticket.topic='people_operations';ticket.source_channel='portal';ticket.created_by_user_id=5;
 const req={...request(),user:{id:5,role:'support'},body:{body:'Private note attempt',isInternal:true}},res=response();
 await createSupportTicketMessage(req,res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('hides internal messages, draft content and review metadata from a People Operations requester',async()=>{
 ticket={...ticket,topic:'people_operations',source_channel:'portal',created_by_user_id:5,question:'My question',ai_draft_answer:'Private staff draft',ai_draft_metadata_json:JSON.stringify({draftSnapshotId:7,reviewWarnings:['Private review']})};
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM support_ticket_messages m')){
   expect(sql).toContain('COALESCE(m.is_internal, 0) = 0');
   return [[{id:11,ticket_id:101,body:'Public reply',is_internal:0}]];
  }
  if(sql.includes('information_schema'))return [[{cnt:sql.includes("'support_ticket_attachments'")?0:1}]];
  return [[ticket]];
 });
 const req={...request(),user:{id:5,role:'support'}},res=response();
 await listSupportTicketMessages(req,res,error=>{throw error;});
 const result=res.json.mock.calls[0][0];
 expect(result.ticket).not.toHaveProperty('ai_draft_answer');
 expect(result.ticket).not.toHaveProperty('ai_draft_metadata_json');
 expect(result.messages.map(m=>m.body)).toEqual(['Public reply']);
 expect(result.draftWarnings).toEqual([]);expect(result.draftSnapshotId).toBeNull();
 expect(result.assignmentHistory).toEqual([]);expect(result.senderOptions).toEqual([]);
});

it('keeps staff-only and unlinked staff uploads out of a requester’s People Operations files',async()=>{
 ticket={...ticket,topic:'people_operations',source_channel:'portal',created_by_user_id:5};
 pool.execute.mockImplementation(async(sql,params)=>{
  if(sql.includes('information_schema'))return [[{cnt:1}]];
  if(sql.includes('FROM support_ticket_attachments a'))return [[
   {id:1,support_ticket_message_id:7,uploaded_by_user_id:9},
   {id:2,support_ticket_message_id:8,uploaded_by_user_id:9},
   {id:3,support_ticket_message_id:null,uploaded_by_user_id:5},
   {id:4,support_ticket_message_id:null,uploaded_by_user_id:9}
  ]];
  if(sql.includes('SELECT ticket_id,is_internal,is_deleted'))return [[{ticket_id:101,is_internal:params[0]===7?1:0,is_deleted:0}]];
  return [[ticket]];
 });
 const req={...request(),user:{id:5,role:'support'}},res=response();
 await listSupportTicketAttachments(req,res,error=>{throw error;});
 expect(res.json.mock.calls[0][0].attachments.map(row=>row.id)).toEqual([2,3]);
});

it.each([listClientSupportTickets,getClientSupportTicketThread])('filters client People Operations conversations before the query limit',async handler=>{
  const original=pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async(sql,params)=>sql.includes('FROM clients')?[[{id:8,organization_id:2,status:'ACTIVE'}]]:sql.includes('client_organization_assignments')?[[{id:8}]]:original(sql,params));
  appendPeopleOperationsTicketVisibility.mockImplementationOnce(async(id,where,params)=>{where.push("(LOWER(COALESCE(t.topic,''))<>'people_operations' OR t.created_by_user_id=?)");params.push(id);});
  const req={user:{id:5,role:'support'},query:{schoolOrganizationId:'2',clientId:'8'}},res=response(),next=vi.fn();
  await handler(req,res,next);expect(next).not.toHaveBeenCalled();
  const query=pool.execute.mock.calls.find(([sql])=>sql.includes('SELECT t.*')&&sql.includes('FROM support_tickets t'));
  expect(query).toBeDefined();expect(query[0]).toContain("<>'people_operations'");expect(query[0].indexOf('created_by_user_id=?')).toBeLessThan(query[0].indexOf('LIMIT'));
  expect(query[1]).toEqual([2,8,5]);
});
