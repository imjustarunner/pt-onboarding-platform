import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:vi.fn()}));
vi.mock('../sessionSecurity.service.js',()=>({loadSessionPolicy:vi.fn()}));
import { verifyWatchScope, createPortalActivityWatch, summarizePortalEvidence, watchEmail, processPortalActivityWatch } from '../portalActivityWatch.service.js';
let watch, session, login, connection, db, send, verify, policy;
const time=new Date('2026-11-02T17:00:00Z');
const start=new Date('2026-11-02T16:30:00Z');
const target={id:1267,role:'client_guardian',first_name:'Adam',last_name:'Example'};
beforeEach(()=>{
 watch={id:1,agency_id:377,target_user_id:1267,observer_user_id:501,recipient_email:'owner@example.test',sender_identity_id:538,status:'armed',not_before:new Date('2026-11-02T16:00:00Z'),login_state:'pending',summary_state:'pending',timezone:'America/Denver'};
 session={user_id:1267,last_activity_at:time,absolute_expires_at:+time+3600000,session_ref:'session-a'};
 login={session_ref:'session-a',occurred_at:start};
 connection={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]),release:vi.fn()};
 db={getConnection:vi.fn(async()=>connection),execute:vi.fn(async(sql,args=[])=>{
  if(sql==='SELECT * FROM portal_activity_watches WHERE id=?')return [[{...watch}]];
  if(sql.includes("action='login'"))return [login?[login]:[]];
  if(sql.includes('FROM auth_session_security'))return [[session]];
  if(sql.includes('SELECT request_id,occurred_at'))return [[{request_id:'r1',occurred_at:start,route:'/api/guardian-portal/clients/:clientId/appointments',method:'GET',action:'data_read',status_code:200}]];
  if(sql.includes('FROM user_activity_log'))return [[{created_at:start,action_type:'guardian_preferences_updated'}]];
  if(sql.includes("SET status='watching'"))Object.assign(watch,{status:'watching',session_ref:args[0],login_at:args[1]});
  if(sql.includes("SET login_state='sending'"))watch.login_state='sending';
  if(sql.includes("SET summary_state='sending'"))watch.summary_state='sending';
  if(sql.includes('SET login_state=?'))watch.login_state=args[0];
  if(sql.includes('SET summary_state=?'))watch.summary_state=args[0];
  if(sql.includes("SET status='completed'"))watch.status='completed';
  if(sql.includes("SET status='attention'"))watch.status='attention';
  return [{affectedRows:1}];
 })};
 send=vi.fn(async()=>({id:'receipt',communicationId:99}));
 verify=vi.fn(async()=>({target}));
 policy=vi.fn(async()=>({idleBeforeTimedownSeconds:900,timedownSeconds:60}));
});
const run=()=>processPortalActivityWatch(1,{db,send,verify,policy,now:()=>time});
it('waits for an actual successful login and ignores pre-watch or impersonated events in its query',async()=>{
 login=null;await run();expect(send).not.toHaveBeenCalled();
 const [sql,args]=db.execute.mock.calls.find(([sql])=>sql.includes("action='login'"));
 expect(sql).toContain("phase='completed'");expect(sql).toContain('status_code BETWEEN 200 AND 299');expect(sql).toContain('switchedFromUserId');
 expect(args).toEqual([1267,watch.not_before]);expect(watch.status).toBe('armed');
});
it('sends one login alert, then one logout report, and stops permanently',async()=>{
 await run();await run();expect(send).toHaveBeenCalledTimes(1);expect(watch.status).toBe('watching');
 session.revoked_at=new Date(+time-20000);session.end_reason='Signed out';
 await run();await run();expect(send).toHaveBeenCalledTimes(2);expect(watch.status).toBe('completed');
 expect(send.mock.calls[0][0]).toMatchObject({to:'owner@example.test',userId:501,agencyId:377,senderIdentityId:538,templateType:'portal_activity_login'});
 expect(send.mock.calls[1][0].text).toContain('Appointments: 1 request');
 expect(send.mock.calls[1][0].text).toContain('Signed out');
 const [,args]=db.execute.mock.calls.find(([sql])=>sql.includes('SELECT request_id,occurred_at'));
 expect(args.slice(0,2)).toEqual([1267,'session-a']);
 expect(connection.release).toHaveBeenCalledTimes(4);
});
it('summarizes an expired session without pretending the user clicked logout',async()=>{
 session.last_activity_at=start;
 await run();expect(send).toHaveBeenCalledTimes(2);
 expect(send.mock.calls[1][0].text).toContain('Session timed out (no explicit sign-out recorded)');
});
it('does not send while another worker owns the watch',async()=>{
 connection.execute.mockResolvedValue([[{acquired:0}]]);await run();expect(send).not.toHaveBeenCalled();expect(verify).not.toHaveBeenCalled();
});
it('does not retry an ambiguous or redirected delivery and flags it for review',async()=>{
 send.mockRejectedValueOnce(new Error('network interrupted'));
 await expect(run()).rejects.toThrow('network interrupted');await run();expect(send).toHaveBeenCalledOnce();expect(watch.status).toBe('attention');
});
it('holds a queued/redirected email instead of claiming receipt',async()=>{
 send.mockResolvedValue({id:'test-copy',redirected:true});await expect(run()).rejects.toThrow('DELIVERY_REQUIRES_REVIEW');expect(watch.status).toBe('attention');
});
it('rechecks authorization before sending and excludes later cross-agency activity',async()=>{
 verify.mockRejectedValue(new Error('scope changed'));await expect(run()).rejects.toThrow('scope changed');expect(send).not.toHaveBeenCalled();
});
it('summarizes data requests honestly without including message bodies, network addresses, or signed links',()=>{
 const report=summarizePortalEvidence([{request_id:'r',route:'/api/guardian-portal/messages/:id',occurred_at:start,method:'GET',status_code:200,message_body:'PRIVATE',client_ip:'192.0.2.2',details:{url:'https://example.test/?token=SECRET'}},
 {request_id:'r',route:'/api/guardian-portal/messages/:id',occurred_at:start,method:'GET',status_code:200}]);
 expect(report.sections).toEqual({Messages:1});expect(report.timeline[0].outcome).toBe('Data requested');
 expect(JSON.stringify(report)).not.toMatch(/PRIVATE|SECRET|192\.0\.2/);
 expect(report.limitation).toContain('may happen automatically');
 const email=watchEmail({...watch,login_at:start,ended_at:time,end_reason:'Signed out'}, {...target,first_name:'<script>'},'summary',report);
 expect(email.html).not.toContain('<script>');expect(email.text).toContain('MST');
});

function scopeDb({memberships=[{agency_id:377}],links=[{agency_id:377}],observerRole='super_admin',senderAgency=377}={}) {
 return {execute:vi.fn(async(sql,args)=>{
  if(sql.includes('FROM users'))return [[args[0]===1267?{...target,is_active:1}:{id:501,role:observerRole,email:'owner@example.test',is_active:1}]];
  if(sql.includes('FROM user_agencies'))return [memberships];
  if(sql.includes('FROM client_guardians'))return [links];
  if(sql.includes('FROM user_login_emails'))return [[{email:'saved-alias@example.test'}]];
  if(sql.includes('FROM email_sender_identities'))return [[{id:538,agency_id:senderAgency,is_active:1}]];
  return [[]];
 })};
}
it('permits the saved recipient address and rejects unsaved recipients or multi-agency guardians',async()=>{
 await expect(verifyWatchScope(watch,scopeDb())).resolves.toMatchObject({target:{id:1267}});
 await expect(verifyWatchScope({...watch,recipient_email:'stranger@example.test'},scopeDb())).rejects.toThrow('saved on your own account');
 await expect(verifyWatchScope(watch,scopeDb({memberships:[{agency_id:377},{agency_id:378}]}))).rejects.toThrow('this agency alone');
 await expect(verifyWatchScope(watch,scopeDb({links:[{agency_id:377},{agency_id:378}]}))).rejects.toThrow('this agency alone');
 await expect(verifyWatchScope(watch,scopeDb({senderAgency:378}))).rejects.toThrow('sender belonging');
 await expect(createPortalActivityWatch({id:1267,role:'client_guardian'},{},{db:scopeDb()})).rejects.toMatchObject({status:403});
});
