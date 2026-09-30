import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {createGmailTrafficGuard,gmailRetryDeadline,guardGmailClient,mailboxKey} from '../unifiedEmail/gmailTrafficGuard.js';
let state,execute,db,database,now;
beforeEach(()=>{
 now=Date.parse('2026-09-30T16:00:00Z');state={blocked_until:null,next_request_at:null};
 execute=vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT blocked_until'))return [[state]];
  if(sql.includes('SET blocked_until='))state.blocked_until=args[0];
  return [{affectedRows:1}];
 });db={execute,release:vi.fn()};database={execute,getConnection:async()=>db};
});
it('records the rate-limit deadline and blocks a different replica without another Gmail call',async()=>{
 const a=createGmailTrafficGuard({database,now:()=>now}),b=createGmailTrafficGuard({database,now:()=>now});
 const send=vi.fn().mockRejectedValue({response:{status:429,data:{error:{message:'User-rate limit exceeded. Retry after 2026-09-30T16:15:00Z'}}}});
 await expect(a.request('ai@example.org','users.messages.list',send)).rejects.toMatchObject({code:'GMAIL_MAILBOX_THROTTLED',retryAt:Date.parse('2026-09-30T16:15:05Z')});
 const another=vi.fn();await expect(b.request('ai@example.org','users.messages.send',another)).rejects.toHaveProperty('code','GMAIL_MAILBOX_THROTTLED');expect(another).not.toHaveBeenCalled();expect(send).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledTimes(2);
 now=Date.parse('2026-09-30T16:15:06Z');another.mockResolvedValue({data:{id:'synthetic'}});await expect(b.request('ai@example.org','users.messages.send',another)).resolves.toEqual({data:{id:'synthetic'}});
});
it('paces successful calls and releases locks on uncertain network failure without retrying it',async()=>{
 state.next_request_at='2026-09-30 16:00:00.500';const sleep=vi.fn(async()=>{});const guard=createGmailTrafficGuard({database,now:()=>now,sleep});const send=vi.fn().mockRejectedValue(Object.assign(new Error('network timeout'),{code:'ETIMEDOUT'}));
 await expect(guard.request('ai@example.org','users.messages.send',send)).rejects.toHaveProperty('code','ETIMEDOUT');expect(send).toHaveBeenCalledOnce();expect(sleep).toHaveBeenCalledWith(500);expect(execute.mock.calls.some(([sql])=>sql.includes('SET blocked_until='))).toBe(false);expect(execute.mock.calls.at(-1)[0]).toContain('RELEASE_LOCK');
});
it('defers a busy mailbox without sending and never releases another owner’s lock',async()=>{
 execute.mockResolvedValueOnce([[{acquired:0}]]);const send=vi.fn();await expect(createGmailTrafficGuard({database,now:()=>now}).request('ai@example.org','users.messages.send',send)).rejects.toHaveProperty('code','GMAIL_MAILBOX_BUSY');expect(send).not.toHaveBeenCalled();expect(execute).toHaveBeenCalledTimes(1);expect(db.release).toHaveBeenCalledOnce();
});
it('allows one shared inbox poll only when cooldown, cadence and pending-arrival checks permit it',async()=>{
 const guard=createGmailTrafficGuard({database});expect(await guard.claimInboundPoll('ai@example.org')).toBe(true);
 const query=execute.mock.calls[1][0];expect(query).toContain('blocked_until<=');expect(query).toContain('next_inbound_poll_at<=');expect(query).toContain('office_arrival_deliveries');
 execute.mockResolvedValueOnce([{affectedRows:0}]).mockResolvedValueOnce([{affectedRows:0}]);expect(await guard.claimInboundPoll('ai@example.org')).toBe(false);
});
it('wraps actual prototype-style Google methods, preserves context, and disables SDK retries',async()=>{
 const raw=vi.fn(async()=>({data:{id:'sent'}}));class Messages{constructor(){this.context={};}send(...args){return raw(this,...args);}}
 const gmail={users:{context:{},messages:new Messages()}};const traffic={request:vi.fn(async(_,__,work)=>work())};guardGmailClient(gmail,'ai@example.org',traffic);
 await gmail.users.messages.send({userId:'me',requestBody:{raw:'synthetic'}},{retry:true});expect(traffic.request).toHaveBeenCalledWith('ai@example.org','users.messages.send',expect.any(Function));expect(raw).toHaveBeenCalledWith(gmail.users.messages,{userId:'me',requestBody:{raw:'synthetic'}},{retry:false,timeout:30000});
});
it('uses rate-limit reasons and Retry-After, without misclassifying permission failures',()=>{
 expect(gmailRetryDeadline({response:{status:403,data:{error:{errors:[{reason:'userRateLimitExceeded'}]}}}},now)).toBe(now+65000);
 expect(gmailRetryDeadline({response:{status:429,headers:{'retry-after':'120'}}},now)).toBe(now+125000);
 expect(gmailRetryDeadline({response:{status:403,data:{error:{message:'Permission denied'}}}},now)).toBeNull();expect(mailboxKey(' AI@example.org ')).toBe(mailboxKey('ai@example.org'));
});
