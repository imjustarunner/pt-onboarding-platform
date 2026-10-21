import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),links:vi.fn(),decryptTicket:vi.fn(row=>row),decryptMessage:vi.fn(row=>row),notify:vi.fn(),topic:true,encrypted:true,priority:true,ticket:null,rows:[]}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listClientsForGuardian:m.links,isNoView:p=>!!(p?.noView||p?.noViewOtherGuardian)}}));
vi.mock('../../models/Notification.model.js',()=>({default:{create:m.notify}}));
vi.mock('../../services/chatEncryption.service.js',()=>({isChatEncryptionConfigured:()=>true}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:()=>({plain:'[encrypted]',ciphertext:'cipher',iv:'iv',authTag:'tag',keyId:'test'}),decryptTicketMessageRow:m.decryptMessage,decryptTicketRow:m.decryptTicket,ticketDisplayStatus:row=>row.status}));
import {listGuardianSupportTickets,getGuardianSupportTicket,sendGuardianSupportTicketMessage,createGuardianSupportTicket,restrictGuardianBillingTicketAccess} from '../guardianSupportTickets.controller.js';
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res);return res;};
const request=(id=10,role='client_guardian')=>({user:{id,role},params:{ticketId:'91',id:'91',attachmentId:'12'},body:{body:'A private receipt question'}});
beforeEach(()=>{vi.clearAllMocks();m.topic=true;m.encrypted=true;m.priority=true;m.ticket={id:91,client_id:7,agency_id:2,topic:'billing',created_by_user_id:10,status:'open',question:'Private receipt',attachment_id:12};m.rows=[];m.links.mockResolvedValue([{client_id:7,agency_id:2,organization_id:null,relationship_type:'self',permissions_json:{},full_name:'Synthetic Adult'}]);m.execute.mockImplementation(async sql=>{
 if(sql.includes('information_schema.tables'))return [[{cnt:0}]];
 if(sql.includes('information_schema.COLUMNS'))return [sql.includes("COLUMN_NAME = 'topic'")?(m.topic?[{present:1}]:[]):sql.includes("COLUMN_NAME = 'priority'")?(m.priority?[{present:1}]:[]):m.encrypted?[{present:1}]:[]];
 if(sql.includes('SELECT t.*'))return [m.rows];
 if(sql.includes('SELECT * FROM support_tickets'))return [[m.ticket]];
 if(sql.includes('INSERT INTO support_tickets'))return [{insertId:91}];
 return [[]];
 });});

describe('private guardian billing threads',()=>{
 it('denies another linked guardian before reading messages or decrypting a ticket',async()=>{const res=response(),next=vi.fn();await getGuardianSupportTicket(request(20),res,next);expect(res.status).toHaveBeenCalledWith(404);expect(m.decryptTicket).not.toHaveBeenCalled();expect(m.decryptMessage).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM support_ticket_messages'))).toBe(false);expect(next).not.toHaveBeenCalled();});
 it('denies another linked guardian from replying',async()=>{const res=response();await sendGuardianSupportTicketMessage(request(20),res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT')||sql.includes('UPDATE'))).toBe(false);});
 it('lets the adult client read their own private billing request',async()=>{const res=response(),next=vi.fn();await getGuardianSupportTicket(request(10,'client'),res,next);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ticket:expect.objectContaining({id:91,topic:'billing'}),messages:[]}));expect(next).not.toHaveBeenCalled();});
 it('still requires an active visible client link for the creator',async()=>{m.links.mockResolvedValue([{client_id:7,permissions_json:{noViewOtherGuardian:true}}]);const res=response();await getGuardianSupportTicket(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(404);});
 it('filters another guardian’s billing tickets before decrypting while preserving shared care tickets',async()=>{m.rows=[m.ticket,{...m.ticket,id:92,created_by_user_id:20},{...m.ticket,id:93,created_by_user_id:20,topic:'general'}];const res=response();await listGuardianSupportTickets(request(),res,vi.fn());expect(res.json.mock.calls[0][0].tickets.map(t=>t.id)).toEqual([91,93]);expect(m.decryptTicket.mock.calls.map(([row])=>row.id)).toEqual([91,93]);const query=m.execute.mock.calls.find(([sql])=>sql.includes('SELECT t.*'));expect(query[0]).toContain('t.created_by_user_id = ?');expect(query[1]).toEqual([7,10]);});
 it('preserves another linked guardian’s shared school/care discussion access',async()=>{m.ticket.topic='general';const res=response();await getGuardianSupportTicket(request(20),res,vi.fn());expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ticket:expect.objectContaining({id:91})}));});
 it('keeps portal issue screenshots and report text private to the reporting guardian',async()=>{m.ticket.topic='technology';const res=response(),next=vi.fn();await getGuardianSupportTicket(request(20),res,next);expect(res.status).toHaveBeenCalledWith(404);expect(m.decryptTicket).not.toHaveBeenCalled();await restrictGuardianBillingTicketAccess(request(20),res,next);expect(next).not.toHaveBeenCalled();});
});

describe('generic ticket and attachment route guard',()=>{
 it.each(['client_guardian','client'])('blocks %s access to another creator’s attachment before the handler',async role=>{const res=response(),attachmentHandler=vi.fn();await restrictGuardianBillingTicketAccess(request(20,role),res,attachmentHandler);expect(res.status).toHaveBeenCalledWith(404);expect(attachmentHandler).not.toHaveBeenCalled();});
 it('allows the creator through to existing attachment authorization',async()=>{const next=vi.fn();await restrictGuardianBillingTicketAccess(request(),response(),next);expect(next).toHaveBeenCalledWith();});
 it.each([{client_id:8,agency_id:2,permissions_json:{}},{client_id:7,agency_id:6,permissions_json:{}},{client_id:7,agency_id:2,permissions_json:{noView:true}}])('blocks the screenshot owner when the active link is no longer in scope: %j',async link=>{m.ticket.topic='technology';m.links.mockResolvedValue([link]);const res=response(),next=vi.fn();await restrictGuardianBillingTicketAccess(request(),res,next);expect(res.status).toHaveBeenCalledWith(404);expect(next).not.toHaveBeenCalled();expect(m.decryptTicket).not.toHaveBeenCalled();});
 it.each(['admin','support','provider','staff'])('leaves authorized %s access to existing staff checks',async role=>{const next=vi.fn();await restrictGuardianBillingTicketAccess(request(99,role),response(),next);expect(next).toHaveBeenCalledWith();expect(m.execute).not.toHaveBeenCalled();expect(m.links).not.toHaveBeenCalled();});
});

it('does not decrypt a ticket whose agency differs from the authorized profile, even for its creator',async()=>{m.rows=[{...m.ticket,topic:'technology',agency_id:6}];const res=response();await listGuardianSupportTickets(request(),res,vi.fn());expect(res.json.mock.calls[0][0].tickets).toEqual([]);expect(m.decryptTicket).not.toHaveBeenCalled();});

describe('billing topic is private from the initial insert',()=>{
 it.each([[true,true],[true,false],[false,true],[false,false]])('writes topic atomically with encryption=%s priority=%s',async(encrypted,priority)=>{m.encrypted=encrypted;m.priority=priority;const req={...request(10,'client'),body:{clientId:7,topic:'billing',subject:'Prior receipt request',question:'Please provide my earlier receipts.'}},res=response(),next=vi.fn();await createGuardianSupportTicket(req,res,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);const [sql,params]=m.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO support_tickets'));expect(sql).toContain('topic)');expect(params.at(-1)).toBe('billing');expect((sql.match(/\?/g)||[]).length).toBe(params.length);expect(m.execute.mock.calls.some(([sql])=>sql.includes('UPDATE support_tickets SET topic'))).toBe(false);});
 it('fails closed before creating billing content when topic storage is unavailable',async()=>{m.topic=false;const res=response();await createGuardianSupportTicket({...request(),body:{clientId:7,topic:'billing',question:'Private balance question'}},res,vi.fn());expect(res.status).toHaveBeenCalledWith(503);expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);});
});
