vi.mock('../inboxDigest.service.js',()=>({getCommunicationPrefs:vi.fn(async()=>({sendDelayEmailSeconds:20}))}));
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[{id:2}])}}));
vi.mock('../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn(async()=>({id:10,agency_id:2,channel:'email'}))}));
vi.mock('../unifiedInbox.service.js',()=>({composeNewEmail:vi.fn(),replyToConversation:vi.fn()}));
vi.mock('../emailDeliveryChoice.service.js',()=>({planEmailDelivery:vi.fn()}));
import pool from '../../config/database.js';
import {draftWithMetadata,validateEmailDraft,createEmailDraft,getEmailDraftSummary,listEmailDrafts,listEmailAttention} from '../emailDraft.service.js';
const actor={id:5};
const raw={to:'alice@example.org',subject:'Re: Question',text:'',quotedText:'Original email'};
let connection;
beforeEach(()=>{
 vi.clearAllMocks();pool.execute.mockReset();
 connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async()=>[[]])};
 pool.getConnection.mockResolvedValue(connection);
});
it('excludes untouched replies and quoted history, but counts writing, files and changed recipients',()=>{
 const initial=draftWithMetadata(validateEmailDraft(raw));expect(initial._hasContent).toBe(false);
 expect(draftWithMetadata(validateEmailDraft({...raw,text:'My response'}),initial)._hasContent).toBe(true);
 expect(draftWithMetadata(validateEmailDraft({...raw,cc:'other@example.org'}),initial)._hasContent).toBe(true);
 expect(draftWithMetadata(validateEmailDraft({...raw,attachments:[{contentBase64:'aGk='}]}),initial)._hasContent).toBe(true);
 expect(draftWithMetadata(validateEmailDraft(raw),initial)._hasContent).toBe(false);
});
it('does not trust client-supplied content flags or baseline metadata',()=>{
 const parsed=validateEmailDraft({...raw,_hasContent:true,_baseline:{to:'forged'}});
 expect(parsed._hasContent).toBeUndefined();expect(parsed._baseline).toBeUndefined();
 expect(draftWithMetadata(parsed)._hasContent).toBe(false);
});
it('restores an existing draft under a transaction instead of inserting another one',async()=>{
 connection.execute.mockReset().mockResolvedValueOnce([[{id:5}]]).mockResolvedValueOnce([[{id:'saved',hasContent:1}]]);
 pool.execute.mockResolvedValue([[{id:'saved',agency_id:2,conversation_id:10,draft_json:JSON.stringify({...raw,text:'Unfinished response'})}]]);
 const draft=await createEmailDraft(actor,{mode:'reply_all',conversationId:10,draft:raw});
 expect(draft).toMatchObject({id:'saved',resumed:true,draft:{text:'Unfinished response'}});
 expect(connection.execute.mock.calls[1][1]).toEqual([5,2,10,'reply_all']);
 expect(connection.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 expect(connection.commit).toHaveBeenCalledOnce();expect(connection.release).toHaveBeenCalledOnce();
});
it('rolls back and releases a failed draft transaction',async()=>{
 connection.execute.mockRejectedValueOnce(new Error('database unavailable'));
 await expect(createEmailDraft(actor,{mode:'reply',conversationId:10,draft:raw})).rejects.toThrow('database unavailable');
 expect(connection.rollback).toHaveBeenCalledOnce();expect(connection.release).toHaveBeenCalledOnce();
});
it('counts only the author’s tenant drafts and separates uncertain or failed sends',async()=>{
 pool.execute.mockResolvedValueOnce([[{draftCount:3,pendingCount:1}]]).mockResolvedValueOnce([[{id:'saved',conversation_id:10}]]).mockResolvedValueOnce([[{n:2}]]);
 expect(await getEmailDraftSummary(actor,2)).toEqual({draftCount:3,attentionCount:3,conversationDrafts:[{id:'saved',conversation_id:10}]});
 expect(pool.execute.mock.calls.map(call=>call[1])).toEqual([[5,2],[5,2],[2,5]]);
 await expect(getEmailDraftSummary({...actor,scopedAgencyId:3},2)).rejects.toMatchObject({status:404});
});
it('lists meaningful editing drafts without attachments and preserves separate attention states',async()=>{
 pool.execute.mockResolvedValue([[]]);await listEmailDrafts(actor,2);
 expect(pool.execute.mock.calls[0][0]).toContain("state='editing'");expect(pool.execute.mock.calls[0][0]).toContain('$._hasContent');
 expect(pool.execute.mock.calls[0][0]).not.toContain('SELECT *');
 await listEmailAttention(actor,2);
 expect(pool.execute.mock.calls[1][0]).toContain("state='sending'");
 expect(pool.execute.mock.calls[2][0]).toContain("m.send_status='failed'");
});
it('updates an untouched reply shell with the newest quoted email',async()=>{
 connection.execute.mockResolvedValueOnce([[{id:5}]]).mockResolvedValueOnce([[{id:'shell',hasContent:0}]]).mockResolvedValueOnce([{affectedRows:1}]);
 pool.execute.mockResolvedValue([[{id:'shell',agency_id:2,conversation_id:10,draft_json:JSON.stringify(raw)}]]);
 const result=await createEmailDraft(actor,{mode:'reply',conversationId:10,draft:raw});
 expect(result.resumed).toBe(false);expect(connection.execute.mock.calls[2][0]).toContain('version=version+1');
 expect(JSON.parse(connection.execute.mock.calls[2][1][0]).quotedText).toBe('Original email');
});

it('uses the saved email-delay preference for a new draft',async()=>{
 const {getCommunicationPrefs}=await import('../inboxDigest.service.js');getCommunicationPrefs.mockResolvedValueOnce({sendDelayEmailSeconds:60});
 pool.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:'new',agency_id:2,draft_json:JSON.stringify({...raw,undoDelaySeconds:60})}]]);
 await createEmailDraft(actor,{agencyId:2,mode:'new',draft:raw});
 const inserted=JSON.parse(pool.execute.mock.calls[0][1][5]);expect(inserted.undoDelaySeconds).toBe(60);
});
