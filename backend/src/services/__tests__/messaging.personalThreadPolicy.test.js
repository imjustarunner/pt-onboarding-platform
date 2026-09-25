import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>true,getUser:vi.fn(async()=>({id:'user'}))}}));
import pool from '../../config/database.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import {personalThreadCanReply,isDistributionMail} from '../personalMessageThreadPolicy.service.js';
const inbox={id:1,agency_id:2,owner_user_id:5,from_email:'provider@tenant.test'};
const direct={conversation_channel:'email',channel:'email',direction:'inbound',from_json:{email:'client@example.org'},to_json:[{email:inbox.from_email}],cc_json:[],bcc_json:[]};
let messages;
beforeEach(()=>{vi.clearAllMocks();messages=[direct];pool.execute.mockImplementation(async sql=>{
 if(sql.includes('FROM communication_messages'))return [messages];
 if(sql.includes('SELECT from_email,inbound'))return [[{from_email:inbox.from_email},{from_email:'messages@tenant.test'}]];
 if(sql.includes('SELECT DISTINCT SUBSTRING'))return [[{domain:'tenant.test'}]];
 return [[]];
});});
it('allows a direct ordinary email and its messages@ reply chain',async()=>{
 expect(await personalThreadCanReply({conversationId:10,inbox})).toBe(true);
 messages.push({...direct,direction:'outbound',from_json:{email:'messages@tenant.test'},to_json:[{email:'client@example.org'}]});
 messages.push({...direct,to_json:[{email:'messages@tenant.test'}]});
 expect(await personalThreadCanReply({conversationId:10,inbox})).toBe(true);
});
it('requires app replies for secure, group, Bcc and multi-person threads even after a direct follow-up',async()=>{
 for(const change of [{conversation_channel:'secure'},{channel:'secure'},{is_group_email:1},{bcc_json:[{email:'hidden@example.org'}]},{cc_json:[{email:'other@example.org'}]},{to_json:[]}]){
   messages=[{...direct,...change},direct];expect(await personalThreadCanReply({conversationId:10,inbox})).toBe(false);
 }
});
it('recognizes a managed distribution address even when it is the only other address',async()=>{
 messages=[{...direct,from_json:{email:'staff@tenant.test'}}];
 const query=pool.execute.getMockImplementation();pool.execute.mockImplementation(async sql=>sql.includes('managed_workspace_groups')?[[{id:1}]]:query(sql));
 expect(await personalThreadCanReply({conversationId:10,inbox})).toBe(false);
});
it('requires positive user verification for an unmapped managed-domain address',async()=>{
 messages=[{...direct,from_json:{email:'group@tenant.test'}}];Directory.getUser.mockResolvedValueOnce(null);
 expect(await personalThreadCanReply({conversationId:10,inbox})).toBe(false);
});
it('distinguishes private Group mailbox headers from distribution list headers',()=>{
 expect(isDistributionMail([{name:'List-ID',value:'Provider <provider.tenant.test>'},{name:'List-Post',value:'<mailto:provider@tenant.test>'},{name:'Precedence',value:'list'}],inbox.from_email)).toBe(false);
 expect(isDistributionMail([{name:'List-ID',value:'Staff <staff.tenant.test>'}],inbox.from_email)).toBe(true);
 expect(isDistributionMail([{name:'List-ID',value:'Provider <provider.tenant.test>'},{name:'List-ID',value:'Outside list <list.example.org>'}],inbox.from_email)).toBe(true);
});
