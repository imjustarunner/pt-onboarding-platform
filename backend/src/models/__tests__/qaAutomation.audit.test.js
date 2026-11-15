import {beforeEach,expect,it,vi} from 'vitest';
const {execute}=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute}}));
import UserActivityLog from '../UserActivityLog.model.js';
import TaskAuditLog from '../TaskAuditLog.model.js';
import AdminAuditLog from '../AdminAuditLog.model.js';
import PhiDocumentAuditLog from '../PhiDocumentAuditLog.model.js';
import {appendSecurityEvidence} from '../../services/securityEvidence.service.js';
import {recordSecureMessageEvent} from '../../services/secureMessageBoundary.service.js';
beforeEach(()=>{execute.mockReset().mockImplementation(async sql=>sql.startsWith('SELECT')?[[{id:91,metadata:null}]]:[{insertId:91}]);});
it.each([
 ['activity',data=>UserActivityLog.logActivity({actionType:'view',userId:1433,...data}),6],
 ['task',data=>TaskAuditLog.logAction({taskId:2488,actionType:'view',actorUserId:1434,...data}),4],
 ['admin',data=>AdminAuditLog.logAction({actionType:'view',actorUserId:1434,agencyId:450,...data}),6],
 ['document',data=>PhiDocumentAuditLog.create({documentId:4560,action:'view',actorUserId:1434,...data}),6]
])('%s persists server automation attribution only in a new insert',async(name,write,index)=>{
 await write({metadata:{clientId:2562,automationActor:{kind:'human',actorUserId:501}}});
 const calls=execute.mock.calls;expect(calls.some(([sql])=>/^(UPDATE|DELETE)/.test(sql))).toBe(false);const insert=calls.find(([sql])=>sql.includes('INSERT INTO'));const meta=JSON.parse(insert[1][index]);expect(meta.clientId).toBe(2562);expect(meta.automationActor.kind).toBe('qa_automation');expect([1433,1434]).toContain(meta.automationActor.actorUserId);
});
it('a human activity cannot supply an automation classification',async()=>{
 await UserActivityLog.logActivity({actionType:'view',userId:501,metadata:{clientId:2562,automationActor:{kind:'qa_automation'}}});expect(JSON.parse(execute.mock.calls[0][1][6])).toEqual({clientId:2562});
});
it('append-only security evidence identifies automation and retains its facts',async()=>{
 const event={userId:1433,requestId:'qa',phase:'clinical',method:'GET',route:'/clinical-session',clientIp:null,ipSource:'test',peerIp:null,action:'view',outcome:'succeeded',details:{sessionId:314}};
 await appendSecurityEvidence(event,{execute},{mirror:false});const meta=JSON.parse(execute.mock.calls[0][1][19]);expect(meta.sessionId).toBe(314);expect(meta.automationActor.actorUserId).toBe(1433);expect(event.details).toEqual({sessionId:314});
});
it('secure events retain their existing actor and add an explicit automation source label',async()=>{
 await recordSecureMessageEvent({agencyId:450,threadId:379,userId:1790,eventType:'subject_list_viewed',req:{headers:{'user-agent':'HeadlessChrome'}},executor:{execute}});const args=execute.mock.calls[0][1];expect(args[4]).toBe(1790);expect(args[7]).toMatch(/^qa-automation\/1790;/);expect(args[7]).toContain('HeadlessChrome');
});
