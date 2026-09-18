import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>state.db.execute(...a),getConnection:()=>state.db.getConnection()}}));
vi.mock('../../services/accountSecurity.service.js',()=>({accountSecurityState:async()=>({verified:true}),requireAccountSession:req=>{if(!req.user?.sessionId)throw new Error('Sign in');}}));
import {authorizeProtectedActivity,protectOutboundEmail,protectFileResource,protectStorageResource} from '../../services/activityProtection.service.js';
import {reserveLoginAttempts,recordPasswordResult} from '../../middleware/loginProtection.middleware.js';
import {requestFileAccess,reviewTicket,reviewAlert,ownProtection,reviewQueue,requirePrivacyReviewer,assignPrivacyReviewer} from '../activityProtection.controller.js';
import {evidenceRequestContext} from '../../utils/evidenceRequestContext.js';
import {enforceActivityProtection} from '../../middleware/activityProtection.middleware.js';
const socket=process.env.EVIDENCE_TEST_SOCKET;
const req=(id=1,session=`session-${id}`)=>({user:{id,role:'super_admin',email:`user${id}@example.invalid`,sessionId:session},sessionSecurity:{key:`key-${id}`},method:'GET',originalUrl:'/api/phi-documents/1/view',headers:{},socket:{remoteAddress:'192.0.2.1'},body:{},params:{},query:{},evidenceContext:{requestId:crypto.randomUUID(),method:'GET',route:'/api/phi-documents/:id/view',clientIp:'192.0.2.1',ipSource:'direct_peer',peerIp:'192.0.2.1',forwardedIps:[]}});
async function call(fn,request){const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};let error;await fn(request,response,e=>{error=e;});if(error)throw error;return response.json.mock.calls[0]?.[0];}
const file=(request,resource,extra={})=>authorizeProtectedActivity(request,{kind:'client_file',resource,...extra});
describe.skipIf(!socket)('shared activity protection integration',()=>{
 beforeAll(async()=>{
  if(!/^\/private\/tmp\/pt-security-evidence-db\.[^/]+\/mysql\.sock$/.test(socket))throw new Error('Use the isolated test socket');
  const db=await mysql.createConnection({socketPath:socket,user:'root'});await db.query('CREATE DATABASE activity_protection_test');await db.end();
  state.db=mysql.createPool({socketPath:socket,user:'root',database:'activity_protection_test',timezone:'Z',connectionLimit:12});
  await state.db.query('CREATE TABLE users (id INT PRIMARY KEY,email VARCHAR(255),role VARCHAR(64),status VARCHAR(64),failed_login_attempts INT DEFAULT 0,locked_until DATETIME)');
  await state.db.query("INSERT INTO users (id,email,role) VALUES (1,'one@example.invalid','super_admin'),(2,'two@example.invalid','super_admin')");
  await state.db.query('CREATE TABLE account_mfa_sessions (session_key VARCHAR(64) PRIMARY KEY,verified_at DATETIME(3),device_id VARCHAR(36))');
  for(const name of ['1456_security_evidence.sql','1459_activity_protection.sql'])for(const sql of splitSqlStatements(stripSqlLineComments(await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8'))))await state.db.query(sql);
 });
 beforeEach(async()=>{vi.spyOn(console,'info').mockImplementation(()=>{});vi.stubEnv('AUDIT_PROXY_MODE','direct');
  for(const table of ['activity_protection_tickets','activity_protection_alerts','activity_protection_usage','activity_protection_state','auth_attempt_windows','account_mfa_sessions','privacy_reviewers'])await state.db.query(`DELETE FROM ${table}`);
  await state.db.query('UPDATE users SET failed_login_attempts=0,locked_until=NULL');
  await state.db.query("INSERT INTO account_mfa_sessions VALUES ('key-1',UTC_TIMESTAMP(3),NULL),('key-2',UTC_TIMESTAMP(3),NULL)");
 });
 afterAll(async()=>{if(state.db){await state.db.query('DROP DATABASE activity_protection_test');await state.db.end();}});
 it('allows five distinct files and records a persistent block for the sixth, including superadmins',async()=>{
  for(let i=0;i<5;i++)await file(req(),`first-${i}`);await expect(file(req(),'file-two')).rejects.toMatchObject({code:'ACTIVITY_REVIEW_REQUIRED'});
  await expect(file(req(1,'new-session'),'file-three')).rejects.toMatchObject({code:'ACTIVITY_REVIEW_REQUIRED'});
  const [[alert]]=await state.db.query('SELECT * FROM activity_protection_alerts ORDER BY occurred_at LIMIT 1');expect(alert.user_id).toBe(1);expect(alert.reason).toBe('volume_limit');expect(alert.client_ip).toBe('192.0.2.1');
  const [[e]]=await state.db.query("SELECT COUNT(*) n FROM security_evidence WHERE action='activity_blocked' AND request_id=?",[alert.request_id]);expect(Number(e.n)).toBe(1);
 });
 it('serializes concurrent file requests across connections so only five win',async()=>{
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>file(req(),`file-${i}`)));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(5);
  const [[usage]]=await state.db.query('SELECT SUM(units) n FROM activity_protection_usage');expect(Number(usage.n)).toBe(5);
 });
 it('permits repeated access to the same file before a hold, but not arbitrary new file IDs',async()=>{
  await file(req(),'same');await file(req(),'same');for(let i=0;i<4;i++)await file(req(),`extra-${i}`);await expect(file(req(),'different')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('stops 600-recipient email and cumulatively stops single-recipient sends after 50',async()=>{
  await expect(protectOutboundEmail({to:Array.from({length:600},(_,i)=>`r${i}@example.invalid`)})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const request=req(2);await evidenceRequestContext.run(request,async()=>{for(let i=0;i<50;i++)await protectOutboundEmail({to:`r${i}@example.invalid`});await expect(protectOutboundEmail({to:'last@example.invalid'})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');});
  const [[usage]]=await state.db.query("SELECT SUM(units) n FROM activity_protection_usage WHERE user_id=2 AND kind='email'");expect(Number(usage.n)).toBe(50);
 });
 it('requires another fresh reviewer and bounds approval to session, quantity and expiry',async()=>{
  const owner=req();owner.body={reason:'Prepare the requested care coordination records.',units:2};const ticket=await call(requestFileAccess,owner);
  owner.params={id:ticket.id};owner.body={decision:'approved',note:'Verified the work purpose.',units:2};await expect(call(reviewTicket,owner)).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');
  const reviewer=req(2);reviewer.params={id:ticket.id};reviewer.body=owner.body;
  await state.db.query("UPDATE account_mfa_sessions SET device_id='remembered-device' WHERE session_key='key-2'");await expect(call(reviewTicket,reviewer)).rejects.toHaveProperty('code','MFA_FRESH_REQUIRED');
  await state.db.query("UPDATE account_mfa_sessions SET device_id=NULL WHERE session_key='key-2'");await call(reviewTicket,reviewer);
  await file(req(),'force-one',{forceReview:true});await file(req(),'force-two',{forceReview:true});await expect(file(req(),'force-three',{forceReview:true})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const [[row]]=await state.db.query('SELECT * FROM activity_protection_tickets WHERE id=?',[ticket.id]);expect(row.used_units).toBe(2);
 });
 it('does not reuse another session’s approval or an expired grant',async()=>{
  const owner=req();owner.body={reason:'Prepare records for the requested review meeting.',units:2};const ticket=await call(requestFileAccess,owner);
  const reviewer=req(2);reviewer.params={id:ticket.id};reviewer.body={decision:'approved',note:'Validated this specific work purpose.',units:2};await call(reviewTicket,reviewer);
  await expect(file(req(1,'different-session'),'x',{forceReview:true})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  await state.db.query('UPDATE activity_protection_tickets SET expires_at=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND WHERE id=?',[ticket.id]);await expect(file(req(),'y',{forceReview:true})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('keeps requests owner-scoped and never approves automatically on submission',async()=>{
  const owner=req();owner.body={reason:'Compile required records for our review.',units:2};await call(requestFileAccess,owner);
  expect((await call(ownProtection,req(2))).tickets).toHaveLength(0);await expect(file(req(),'bulk',{forceReview:true})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('blocks before the controller and fails closed if protection storage fails',async()=>{
  for(let i=0;i<5;i++)await file(req(),`first-${i}`);const request=req();const next=vi.fn();await enforceActivityProtection(request,{},next);expect(next.mock.calls[0][0]).toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const spy=vi.spyOn(state.db,'getConnection').mockRejectedValueOnce(new Error('offline'));await expect(file(req(),'next')).rejects.toThrow('offline');spy.mockRestore();
 });
 it('does not collapse different POST document selections into one allowed resource',async()=>{
  for(let i=0;i<4;i++)await file(req(),`first-${i}`);
  const first=req();first.method='POST';first.originalUrl='/api/clients/pdf';first.body={clientId:1};const next=vi.fn();await enforceActivityProtection(first,{},next);expect(next).toHaveBeenCalledWith();
  const second=req();second.method='POST';second.originalUrl=first.originalUrl;second.body={clientId:2};const denied=vi.fn();await enforceActivityProtection(second,{},denied);expect(denied.mock.calls[0][0]).toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('counts additional storage objects and cannot retry a denied object within one request',async()=>{
  for(let i=0;i<4;i++)await file(req(),`first-${i}`);
  const request=req();await enforceActivityProtection(request,{},e=>{if(e)throw e;});
  await evidenceRequestContext.run(request,async()=>{await protectStorageResource('intake_signed/1/a.pdf');await expect(protectStorageResource('intake_signed/1/b.pdf')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');await expect(protectStorageResource('intake_signed/1/b.pdf')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');});
 });
 it('shares login throttles across connections, records blocks and resets expired windows',async()=>{
  const make=()=>({...req(),user:undefined,body:{username:'one@example.invalid'}});
  const attempts=await Promise.all(Array.from({length:10},()=>reserveLoginAttempts(make())));expect(attempts.filter(Boolean)).toHaveLength(5);
  const [[alerts]]=await state.db.query("SELECT COUNT(*) n FROM activity_protection_alerts WHERE kind='login'");expect(Number(alerts.n)).toBe(5);
  await state.db.query('UPDATE auth_attempt_windows SET expires_at=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND');expect(await reserveLoginAttempts(make())).toBe(true);
 });
 it('atomically records parallel wrong passwords and does not reset an active account lock',async()=>{
  await Promise.all(Array.from({length:10},()=>recordPasswordResult(1,false)));
  const [[row]]=await state.db.query('SELECT * FROM users WHERE id=1');expect(row.failed_login_attempts).toBe(10);expect(row.locked_until).toBeTruthy();expect(await recordPasswordResult(1,true)).toBe(false);
  await state.db.query('UPDATE users SET locked_until=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE id=1');expect(await recordPasswordResult(1,true)).toBe(true);
 });
 it('keeps alert review separate from release and denies reviewing your own block',async()=>{
  for(let i=0;i<5;i++)await file(req(),`first-${i}`);await expect(file(req(),'two')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const [[alert]]=await state.db.query('SELECT id FROM activity_protection_alerts LIMIT 1');const owner=req();owner.params=alert;owner.body={note:'This activity has been investigated.'};await expect(call(reviewAlert,owner)).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');
  const reviewer=req(2);reviewer.params=alert;reviewer.body=owner.body;await call(reviewAlert,reviewer);await expect(file(req(),'three')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('does not grant approval permission based on administrator role alone',async()=>{
  const request=req();const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await requirePrivacyReviewer(request,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
  await state.db.query("INSERT INTO privacy_reviewers VALUES (1,2,UTC_TIMESTAMP(3),NULL)");await requirePrivacyReviewer(request,res,next);expect(next).toHaveBeenCalledWith();
  await state.db.query('UPDATE privacy_reviewers SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=1');next.mockClear();await requirePrivacyReviewer(request,res,next);expect(next).not.toHaveBeenCalled();
 });
 it('allows designated staff reviewers and prevents self-designation',async()=>{
  const admin=req();admin.body={userId:1,confirmUserId:1,enabled:true,note:'Designate the privacy officer.'};await expect(call(assignPrivacyReviewer,admin)).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');
  admin.body={...admin.body,userId:2,confirmUserId:2};await call(assignPrivacyReviewer,admin);
  await state.db.query("UPDATE users SET role='school_staff' WHERE id=2");const reviewer=req(2);reviewer.user.role='school_staff';const next=vi.fn();await requirePrivacyReviewer(reviewer,{status:vi.fn().mockReturnThis(),json:vi.fn()},next);expect(next).toHaveBeenCalledWith();
  await state.db.query("UPDATE users SET role='super_admin' WHERE id=2");
 });

});
