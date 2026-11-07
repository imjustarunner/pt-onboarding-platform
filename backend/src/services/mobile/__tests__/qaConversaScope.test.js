import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {assertMobileQaThread,assertMobileQaRecipient,assertMobileQaConversation,mobileQaAgencyId,qaConversaRouteAllowed} from '../qaConversaScope.service.js';
import {createMobileConversaStore} from '../conversa.service.js';
const request=()=>({quickView:{userId:1433,agencyId:450,qaAgencyIds:[450]},body:{}});
const qa={id:1433,email:'qa.provider.auricwell@example.com',role:'provider',is_demo:1,is_active:1,is_archived:0,member_id:1433};
const db={execute:vi.fn()};beforeEach(()=>vi.resetAllMocks());
it('requires one approved tenant and rejects malformed or widened grants',()=>{
 expect(mobileQaAgencyId({quickView:{}})).toBeNull();expect(mobileQaAgencyId(request())).toBe(450);
 for(const qaAgencyIds of [[],[456],[450,456],'450'])expect(()=>mobileQaAgencyId({quickView:{qaAgencyIds}})).toThrow(/approved synthetic/);
 expect(()=>mobileQaAgencyId({quickView:{qaAgencyIds:[450],agencyId:456}})).toThrow(/approved synthetic/);
});
it('blocks guessed thread and linked client IDs from other tenants before any content handler',async()=>{
 for(const thread of [{id:8,agency_id:456},{id:8,agency_id:450,client_id:9,client_agency_id:456},null]){
  db.execute.mockResolvedValueOnce([thread?[thread]:[]]);await expect(assertMobileQaThread(request(),8,{db})).rejects.toMatchObject({status:403});
 }
 db.execute.mockResolvedValueOnce([[{id:8,agency_id:450,client_id:9,client_agency_id:450,message_channel:'secure'}]]);
 await expect(assertMobileQaThread(request(),8,{db})).resolves.toBeUndefined();
});
it('permits internal text only when every participant has an approved active synthetic identity in the tenant',async()=>{
 const thread={id:8,agency_id:450,message_channel:'internal'};
 db.execute.mockResolvedValueOnce([[thread]]).mockResolvedValueOnce([[qa]]);await expect(assertMobileQaThread(request(),8,{db,writing:true})).resolves.toBeUndefined();
 for(const other of [{...qa,is_demo:0},{...qa,email:'real@example.com'},{...qa,member_id:null},{...qa,is_active:0}]){
  db.execute.mockResolvedValueOnce([[thread]]).mockResolvedValueOnce([[qa,other]]);await expect(assertMobileQaThread(request(),8,{db,writing:true})).rejects.toMatchObject({status:403});
 }
 db.execute.mockResolvedValueOnce([[{...thread,message_channel:'secure'}]]);await expect(assertMobileQaThread(request(),8,{db,writing:true})).rejects.toMatchObject({status:403});
 db.execute.mockResolvedValueOnce([[thread]]).mockResolvedValueOnce([[qa]]);await expect(assertMobileQaThread({...request(),body:{attachments:[{file_path:'elsewhere'}]}},8,{db,writing:true})).rejects.toMatchObject({status:403});
});
it('checks direct recipients against approved identities and active membership, preserving real-user behavior',async()=>{
 db.execute.mockResolvedValueOnce([[qa]]);await expect(assertMobileQaRecipient(request(),1433,{db})).resolves.toBeUndefined();
 db.execute.mockResolvedValueOnce([[{...qa,email:'qa.other@example.com'}]]);await expect(assertMobileQaRecipient(request(),55,{db})).rejects.toMatchObject({status:403});
 expect(db.execute.mock.calls[0][1]).toEqual([450,1433]);db.execute.mockClear();await assertMobileQaThread({quickView:{userId:1}},9,{db});expect(db.execute).not.toHaveBeenCalled();
 expect(()=>assertMobileQaConversation(request(),{agency_id:456})).toThrow(/approved synthetic/);expect(assertMobileQaConversation(request(),{agency_id:450})).toEqual({agency_id:450});
});
it('bounds both email list and counts before pagination while retaining personal-mailbox checks',async()=>{
 db.execute.mockResolvedValue([[]]);const store=createMobileConversaStore(db);
 await store.emails(1433,{agencyId:450});await store.emailCounts(1433,false,450);
 for(const [sql,params] of db.execute.mock.calls){expect(sql).toContain('AND c.agency_id=?');expect(sql).toContain("mine.kind='personal'");expect(params.at(-1)).toBe(450);}
 db.execute.mockClear();await store.emailCounts(1433);expect(db.execute.mock.calls[0][0]).not.toContain('AND c.agency_id=?');
});
it('allowlists reviewed operations and denies outbound email, uploads, join and unknown routes',()=>{
 for(const [method,path] of [['GET','/messages/inbox'],['GET','/conversations/9/attachments/4'],['GET','/chat/inbox/files'],['POST','/chat/direct'],['POST','/chat/threads/9/messages'],['PATCH','/messages/chat/9/archive']])expect(qaConversaRouteAllowed(method,path)).toBe(true);
 for(const [method,path] of [['POST','/compose'],['POST','/conversations/9/reply'],['POST','/chat/threads/9/attachments'],['GET','/chat/channels'],['POST','/chat/channels/9/open'],['POST','/chat/messages/9/reactions'],['GET','/not-reviewed']])expect(qaConversaRouteAllowed(method,path)).toBe(false);
});
