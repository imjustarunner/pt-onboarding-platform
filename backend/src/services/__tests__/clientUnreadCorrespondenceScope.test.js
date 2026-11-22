import {expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn(async()=>[[]])}));
vi.mock('../../config/database.js',()=>({default:db}));
import Conversation from '../../models/CommunicationConversation.model.js';
it('adds explicit chart filing filters without removing private mailbox, actor scope or unread predicates',async()=>{
 await Conversation.list({agencyId:2,userId:9,scopeToUserId:9,filter:'unread',linkedClientIds:[12,13],limit:200});
 const [sql,params]=db.execute.mock.calls.at(-1);
 expect(sql).toContain('chart_link.entity_id IN (?,?)');expect(sql).toContain('communication_conversation_reads');expect(sql).toContain('mailbox_access');expect(sql).toContain('inferred_owner_user_id');
 const unquoted=sql.replace(/'(?:''|\\.|[^'\\])*'/g,'');
 expect((unquoted.match(/\?/g)||[]).length).toBe(params.length);
});
