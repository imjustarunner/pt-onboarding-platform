import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../guardianContactContext.service.js',()=>({guardianContactContext:vi.fn()}));
vi.mock('../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn()}));
vi.mock('../clientConversationRecord.service.js',()=>({canReadSharedClientConversation:vi.fn()}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
import {createGuardianCommunications} from '../guardianCommunications.service.js';
const user={id:7,role:'admin'},guardian={id:20,name:'Parent',email:'parent@example.test',phone:'7195551234'};
const clients=[{id:4,name:'Child A',agencyId:2},{id:5,name:'Child B',agencyId:2},{id:6,name:'Past child',agencyId:3,isHistorical:true}];
const conversation=(id,channel='email')=>({id,kind:'conversation',channel,subject:`Conversation ${id}`,agency_id:2,last_message_at:'2026-11-22 18:00:00'});
let d,service,conversations,records,links;
beforeEach(()=>{
 conversations=[conversation(10),conversation(11,'sms')];records=[{id:99,kind:'secure',channel:'secure',client_id:5,agency_id:2,last_message_at:'2026-11-22 18:01:00'}];links={10:[{id:4},{id:5}],11:[{id:4}]};
 d={context:vi.fn(async()=>({guardian,clients})),conversationAccess:vi.fn(async()=>({id:11,channel:'sms',agency_id:2,external_thread_id:'sms:v2:client:4:+17195550100:+17195551234'})),sharedAccess:vi.fn(async()=>true),recordAccess:vi.fn(async()=>({ok:true})),sendSms:vi.fn(async()=>({eligible:true})),db:{execute:vi.fn(async(sql,args)=>sql.includes('FROM communication_conversations c')?[conversations]:sql.includes('FROM client_secure_message_records r')?[records]:sql.includes('SELECT l.entity_id')?[links[args[0]]||[]]:[[]])}};
 service=createGuardianCommunications(d);
});
it('merges the three original stores and labels only clients actually filed on each conversation',async()=>{
 const result=await service.list({user,guardianId:20});
 expect(result.conversations.map(t=>t.channel)).toEqual(['secure','sms','email']);
 expect(result.conversations.find(t=>t.id===10).clients.map(c=>c.id)).toEqual([4,5]);
 expect(result.conversations.find(t=>t.id===99)).toMatchObject({clientId:5,messageId:99,clients:[{id:5}]});
 expect(d.context).toHaveBeenCalledWith({userId:7,guardianId:20,includePast:true});
 expect(d.conversationAccess).toHaveBeenCalledWith(user,10);
 expect(d.recordAccess).toHaveBeenCalledWith({userId:7,role:'admin',clientId:5});
});
it('does not expose private mail, a shared sibling chart without access, or inaccessible clinical messages',async()=>{
 d.conversationAccess.mockImplementation(async(_user,id)=>{if(id===10)throw Object.assign(new Error('private'),{status:404});return {};});
 d.sharedAccess.mockResolvedValue(false);d.recordAccess.mockResolvedValue({ok:false,status:403});
 expect((await service.list({user,guardianId:20})).conversations).toEqual([]);
});
it('requires an actual filing link for a selected child and rejects an unrelated child or agency',async()=>{
 records=[];links[11]=[];
 const result=await service.list({user,guardianId:20,query:{clientId:5}});
 expect(result.conversations.map(t=>t.id)).toEqual([10]);
 const query=d.db.execute.mock.calls.find(([sql])=>sql.includes('FROM communication_conversations c'));
 expect(query[0]).toContain("selected.entity_type='client'");expect(query[1]).toContain(5);
 await expect(service.list({user,guardianId:20,query:{clientId:400}})).rejects.toMatchObject({status:404});
 await expect(service.list({user,guardianId:20,query:{agencyId:400}})).rejects.toMatchObject({status:404});
});
it('retains past relationships for history and forbids using them for a new text',async()=>{
 await expect(service.smsEligibility({user,guardianId:20,clientId:6,numberId:8})).rejects.toMatchObject({status:404});
 expect(d.sendSms).not.toHaveBeenCalled();
});
it('checks real SMS consent and line eligibility as a preview with the actual actor and exact guardian',async()=>{
 await service.smsEligibility({user,guardianId:20,clientId:4,numberId:8});
 expect(d.sendSms).toHaveBeenCalledExactlyOnceWith({userId:7,guardianUserId:20,clientId:4,numberId:8,threadKey:undefined,body:'Text eligibility check',preview:true});
 d.sendSms.mockRejectedValue(Object.assign(new Error('This recipient opted out'),{status:403}));
 await expect(service.smsEligibility({user,guardianId:20,clientId:4,numberId:8})).rejects.toThrow('opted out');
});
it('binds SMS history to the guardian and original phone thread rather than all texts for a child',async()=>{
 d.db.execute.mockResolvedValueOnce([[{id:3,client_id:4,body:'Hello',direction:'INBOUND',delivery_status:'received',created_at:'2026-11-22 18:00:00',from_number:'+17195551234',to_number:'+17195550100'}]]);
 const result=await service.smsDetail({user,guardianId:20,conversationId:11});
 expect(result.messages[0]).toMatchObject({body_text:'Hello',direction:'inbound'});
 const [sql,args]=d.db.execute.mock.calls[0];expect(sql).toContain("'$.guardianUserId'");expect(sql).toContain('ml.sms_thread_key=?');expect(args).toContain('20');expect(args).toContain('+17195551234');
});
it('paginates past hidden rows and rejects malformed cursors before reading any message content',async()=>{
 conversations=Array.from({length:60},(_,i)=>conversation(i+1));records=[];d.conversationAccess.mockRejectedValue(Object.assign(new Error('private'),{status:404}));
 const result=await service.list({user,guardianId:20});expect(result.conversations).toEqual([]);expect(JSON.parse(result.nextCursor)).toMatchObject({key:expect.stringMatching(/^conversation-/)});
 await expect(service.list({user,guardianId:20,query:{cursor:'broken'}})).rejects.toMatchObject({status:400});
 await expect(service.smsDetail({user,guardianId:20,conversationId:11,beforeId:'broken'})).rejects.toMatchObject({status:400});
});
it('does not issue unbounded or empty-scope history queries or swallow infrastructure errors',async()=>{
 d.context.mockResolvedValueOnce({guardian,clients:[]});expect((await service.list({user,guardianId:20})).conversations).toEqual([]);expect(d.db.execute).not.toHaveBeenCalled();
 d.conversationAccess.mockRejectedValue(new Error('database unavailable'));
 await expect(service.list({user,guardianId:20})).rejects.toThrow('database unavailable');
});
it('keeps original email and SMS guardian attribution discoverable after contact details change',async()=>{
 await service.list({user,guardianId:20});
 const [sql,args]=d.db.execute.mock.calls.find(([sql])=>sql.includes('FROM communication_conversations c'));
 expect(sql).toContain("historical.source_type='email'");expect(sql).toContain("historical.source_type='sms'");
 expect(args.filter(value=>value===20).length).toBeGreaterThanOrEqual(3);
});
