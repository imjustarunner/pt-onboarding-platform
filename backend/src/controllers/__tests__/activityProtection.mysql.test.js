import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const state=vi.hoisted(()=>({db:null,verification:{verified:true,required:true}}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>state.db.execute(...a),getConnection:()=>state.db.getConnection()}}));
vi.mock('../../services/accountSecurity.service.js',()=>({accountSecurityState:async()=>state.verification,requireAccountSession:req=>{if(!req.user?.sessionId)throw new Error('Sign in');}}));
import {authorizeProtectedActivity,protectOutboundEmail,protectFileResource,protectStorageResource} from '../../services/activityProtection.service.js';
import {reserveLoginAttempts,recordPasswordResult} from '../../middleware/loginProtection.middleware.js';
import {requestFileAccess,reviewTicket,reviewAlert,ownProtection,reviewQueue,protectionSummary,pendingFileRequests,requirePrivacyReviewer,assignPrivacyReviewer} from '../activityProtection.controller.js';
import {evidenceRequestContext} from '../../utils/evidenceRequestContext.js';
import {enforceActivityProtection} from '../../middleware/activityProtection.middleware.js';
const socket=process.env.EVIDENCE_TEST_SOCKET;
const req=(id=1,session=`session-${id}`)=>({user:{id,role:'super_admin',email:`user${id}@example.invalid`,sessionId:session},sessionSecurity:{key:`key-${id}`},method:'GET',originalUrl:'/api/documents/1/download',headers:{},socket:{remoteAddress:'192.0.2.1'},body:{},params:{},query:{},evidenceContext:{requestId:crypto.randomUUID(),method:'GET',route:'/api/documents/:id/download',clientIp:'192.0.2.1',ipSource:'direct_peer',peerIp:'192.0.2.1',forwardedIps:[]}});
async function call(fn,request){const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};let error;await fn(request,response,e=>{error=e;});if(error)throw error;return response.json.mock.calls[0]?.[0];}
const file=(request,resource,extra={})=>authorizeProtectedActivity(request,{kind:'client_file',resource,...extra});
describe.skipIf(!socket)('shared activity protection integration',()=>{
 beforeAll(async()=>{
  if(!/^\/private\/tmp\/pt-security-evidence-db\.[^/]+\/mysql\.sock$/.test(socket))throw new Error('Use the isolated test socket');
  const db=await mysql.createConnection({socketPath:socket,user:'root'});await db.query('CREATE DATABASE activity_protection_test');await db.end();
  state.db=mysql.createPool({socketPath:socket,user:'root',database:'activity_protection_test',timezone:'Z',connectionLimit:12});
  await state.db.query('CREATE TABLE users (id INT PRIMARY KEY,email VARCHAR(255),role VARCHAR(64),status VARCHAR(64),failed_login_attempts INT DEFAULT 0,locked_until DATETIME,is_demo BOOLEAN DEFAULT FALSE,is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE)');
  await state.db.query("INSERT INTO users (id,email,role) VALUES (1,'one@example.invalid','super_admin'),(2,'two@example.invalid','super_admin')");
  await state.db.query("INSERT INTO users (id,email,role,is_demo) VALUES (1433,'qa.provider.auricwell@example.com','provider',TRUE)");
  await state.db.query('CREATE TABLE agencies (id INT PRIMARY KEY,slug VARCHAR(255),is_active BOOLEAN DEFAULT TRUE,feature_flags JSON)');
  await state.db.query(`INSERT INTO agencies (id,slug,feature_flags) VALUES (450,'auricwell-qa-demo','{"qaSandbox":{"syntheticOnly":true}}'),(456,'scb-qa-company','{}'),(2,'real-company','{}')`);
  await state.db.query('CREATE TABLE user_agencies (user_id INT,agency_id INT,is_active BOOLEAN DEFAULT TRUE)');
  await state.db.query('CREATE TABLE account_mfa_sessions (session_key VARCHAR(64) PRIMARY KEY,verified_at DATETIME(3),device_id VARCHAR(36))');
  for(const name of ['1456_security_evidence.sql','1459_activity_protection.sql'])for(const sql of splitSqlStatements(stripSqlLineComments(await fs.readFile(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8'))))await state.db.query(sql);
 });
 beforeEach(async()=>{state.verification={verified:true,required:true};vi.spyOn(console,'info').mockImplementation(()=>{});vi.stubEnv('AUDIT_PROXY_MODE','direct');
  for(const table of ['activity_protection_tickets','activity_protection_alerts','activity_protection_usage','activity_protection_state','auth_attempt_windows','account_mfa_sessions','privacy_reviewers'])await state.db.query(`DELETE FROM ${table}`);
  await state.db.query('UPDATE users SET failed_login_attempts=0,locked_until=NULL');
  await state.db.query('UPDATE users SET is_demo=TRUE WHERE id=1433');
  await state.db.query('DELETE FROM user_agencies');
  await state.db.query('INSERT INTO user_agencies (user_id,agency_id) VALUES (1433,450),(1433,456)');
  await state.db.query("INSERT INTO account_mfa_sessions VALUES ('key-1',UTC_TIMESTAMP(3),NULL),('key-2',UTC_TIMESTAMP(3),NULL)");
 });
 afterAll(async()=>{if(state.db){await state.db.query('DROP DATABASE activity_protection_test');await state.db.end();}});
 it('gives only the verified Avery demo account audited permanent file access while retaining its historical hold evidence',async()=>{
  await state.db.query("INSERT INTO activity_protection_state (user_id,kind,held_at) VALUES (1433,'client_file',UTC_TIMESTAMP(3))");
  const avery=()=>({...req(1433),user:{...req(1433).user,role:'provider'}});
  for(let i=0;i<30;i++)await file(avery(),`demo-${i}`,{forceReview:i===29});
  const own=await call(ownProtection,avery());expect(own.demoFileAccessExempt).toBe(true);expect(own.holds).toEqual([]);
  const [[usage]]=await state.db.query('SELECT COUNT(*) n FROM activity_protection_usage WHERE user_id=1433');expect(Number(usage.n)).toBe(0);
  const [[audit]]=await state.db.query("SELECT COUNT(*) n FROM security_evidence WHERE user_id=1433 AND action='demo_file_access_authorized'");expect(Number(audit.n)).toBe(30);
  const [[hold]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1433 AND kind='client_file'");expect(hold.held_at).not.toBeNull();
  await state.db.query('UPDATE users SET is_demo=FALSE WHERE id=1433');
  await expect(file(avery(),'after-demo-removed')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  expect((await call(ownProtection,avery())).demoFileAccessExempt).toBe(false);
 });
 it('withdraws Avery exemption immediately if a real organization membership is added',async()=>{
  const avery={...req(1433),user:{...req(1433).user,role:'provider'}};
  await file(avery,'demo-file');
  await state.db.query('INSERT INTO user_agencies (user_id,agency_id) VALUES (1433,2)');
  expect((await call(ownProtection,avery)).demoFileAccessExempt).toBe(false);
  for(let i=0;i<5;i++)await file(avery,`normal-${i}`);
  await expect(file(avery,'sixth-normal-file')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('allows five distinct downloads and records a persistent block for the sixth, including superadmins',async()=>{
  for(let i=0;i<5;i++)await file(req(),`first-${i}`);await expect(file(req(),'file-two')).rejects.toMatchObject({code:'ACTIVITY_REVIEW_REQUIRED'});
  await expect(file(req(1,'new-session'),'file-three')).rejects.toMatchObject({code:'ACTIVITY_REVIEW_REQUIRED'});
  const [[alert]]=await state.db.query('SELECT * FROM activity_protection_alerts ORDER BY occurred_at LIMIT 1');expect(alert.user_id).toBe(1);expect(alert.reason).toBe('volume_limit');expect(alert.client_ip).toBe('192.0.2.1');
  const [[e]]=await state.db.query("SELECT COUNT(*) n FROM security_evidence WHERE action='activity_blocked' AND request_id=?",[alert.request_id]);expect(Number(e.n)).toBe(1);
 });
 it('allows SSO superadmin payroll exports during a client-file hold without consuming approval or clearing the hold',async()=>{
  for(let i=0;i<5;i++)await file(req(),`client-${i}`);
  await expect(file(req(),'sixth-client')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const owner=req();owner.body={reason:'Download the employee payroll summary report.',units:20};
  const ticket=await call(requestFileAccess,owner);
  for(const [method,originalUrl] of [['GET','/api/payroll/periods/42/export.csv'],['POST','/api/payroll/periods/42/adp/export']]){
   const request={...req(),method,originalUrl,authClaims:{authMethod:'google'}};
   const next=vi.fn();await enforceActivityProtection(request,{},next);
   expect(next).toHaveBeenCalledWith();
   expect(request.protectionRouteChecked).not.toBe(true);
  }
  const [[usage]]=await state.db.query("SELECT SUM(units) n FROM activity_protection_usage WHERE user_id=1 AND kind='client_file'");
  expect(Number(usage.n)).toBe(5);
  const [[savedTicket]]=await state.db.query('SELECT status,used_units FROM activity_protection_tickets WHERE id=?',[ticket.id]);
  expect(savedTicket).toMatchObject({status:'pending',used_units:0});
  await expect(file(req(),'another-client')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('allows optional unverified users to request and designated reviewers to approve, but never self-approve',async()=>{
  state.verification={verified:false,required:false};await state.db.query('DELETE FROM account_mfa_sessions');
  const owner=req();owner.body={reason:'Prepare the requested care coordination records.',units:2};
  const ticket=await call(requestFileAccess,owner);
  owner.params={id:ticket.id};owner.body={decision:'approved',note:'Verified the work purpose.',units:2};
  await expect(call(reviewTicket,owner)).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');
  const reviewer=req(2);reviewer.params={id:ticket.id};reviewer.body=owner.body;
  await call(requirePrivacyReviewer,reviewer);await call(reviewTicket,reviewer);
  const [[row]]=await state.db.query('SELECT status FROM activity_protection_tickets WHERE id=?',[ticket.id]);expect(row.status).toBe('approved');
 });
 it('serializes concurrent file requests across connections so only five win',async()=>{
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>file(req(),`file-${i}`)));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(5);
  const [[usage]]=await state.db.query('SELECT SUM(units) n FROM activity_protection_usage');expect(Number(usage.n)).toBe(5);
 });
 it.each(['admin','support','super_admin'])('allows audited views during a download hold for %s without releasing it',async role=>{
  for(let i=0;i<5;i++)await file(req(),`download-${i}`);
  await expect(file(req(),'sixth-download')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  for(let i=0;i<30;i++){
   const viewer=req();viewer.user.role=role;viewer.authClaims={authMethod:'google'};viewer.originalUrl=`/api/phi-documents/${i+1}/view`;
   await file(viewer,`view-${i}`);
  }
  const [[usage]]=await state.db.query("SELECT SUM(units) n FROM activity_protection_usage WHERE kind='client_file'");expect(Number(usage.n)).toBe(5);
  const [[views]]=await state.db.query("SELECT COUNT(*) n FROM security_evidence WHERE action='file_view_requested' AND actor_role=?",[role]);expect(Number(views.n)).toBeGreaterThanOrEqual(30);
  const [[hold]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1 AND kind='client_file'");expect(hold.held_at).not.toBeNull();
  expect((await call(ownProtection,{...req(),user:{...req().user,role}})).unlimitedFileViews).toBe(true);
  await expect(file(req(),'another-download')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('permits repeated access to the same file before a hold, but not arbitrary new file IDs',async()=>{
  await file(req(),'same');await file(req(),'same');for(let i=0;i<4;i++)await file(req(),`extra-${i}`);await expect(file(req(),'different')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
 });
 it('stops 600-recipient email and cumulatively stops single-recipient sends after 50',async()=>{
  await expect(protectOutboundEmail({to:Array.from({length:600},(_,i)=>`r${i}@example.invalid`)})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const request=req(2);await evidenceRequestContext.run(request,async()=>{for(let i=0;i<50;i++)await protectOutboundEmail({to:`r${i}@example.invalid`});await expect(protectOutboundEmail({to:'last@example.invalid'})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');});
  const [[usage]]=await state.db.query("SELECT SUM(units) n FROM activity_protection_usage WHERE user_id=2 AND kind='email'");expect(Number(usage.n)).toBe(50);
 });
 it('queues a one-click hold request once and rejects requests without a hold',async()=>{
  const owner=req();owner.body={reviewHold:true};
  await expect(call(requestFileAccess,owner)).rejects.toHaveProperty('code','NO_FILE_HOLD');
  for(let i=0;i<6;i++)await file(req(),`held-${i}`).catch(()=>{});
  const [a,b]=await Promise.all([call(requestFileAccess,owner),call(requestFileAccess,owner)]);
  expect(a.id).toBe(b.id);expect((await call(pendingFileRequests,req(2))).tickets).toHaveLength(1);
  const [[hold]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1 AND kind='client_file'");expect(hold.held_at).not.toBeNull();
 });
 it.each(['keep_holding','dismissed'])('persists %s and retains the existing hold and all evidence',async decision=>{
  for(let i=0;i<6;i++)await file(req(),`held-${i}`).catch(()=>{});
  const owner=req();owner.body={reviewHold:true};const ticket=await call(requestFileAccess,owner);
  const reviewer=req(2);reviewer.params={id:ticket.id};reviewer.body={decision};await call(reviewTicket,reviewer);
  expect((await call(pendingFileRequests,reviewer)).tickets).toHaveLength(0);
  const [[hold]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1 AND kind='client_file'");expect(hold.held_at).not.toBeNull();
  await expect(file(req(),'still-held')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const [[row]]=await state.db.query('SELECT status,reviewer_id FROM activity_protection_tickets WHERE id=?',[ticket.id]);expect(row.status).toBe(decision);expect(row.reviewer_id).toBe(2);
 });
 it('resets only reviewed file usage, preserves historical logs and email holds, and allows one decision',async()=>{
  for(let i=0;i<6;i++)await file(req(),`held-${i}`).catch(()=>{});
  await state.db.query("INSERT INTO activity_protection_state (user_id,kind,held_at) VALUES (1,'email',UTC_TIMESTAMP(3))");
  const owner=req();owner.body={reviewHold:true};const ticket=await call(requestFileAccess,owner);
  owner.params={id:ticket.id};owner.body={decision:'reset'};
  await expect(call(reviewTicket,owner)).rejects.toHaveProperty('code','SELF_APPROVAL_FORBIDDEN');
  const reviewer=req(2);reviewer.params={id:ticket.id};reviewer.body={decision:'reset'};
  await call(reviewTicket,reviewer);await expect(call(reviewTicket,reviewer)).rejects.toThrow('already been reviewed');
  const [[counts]]=await state.db.query("SELECT (SELECT COUNT(*) FROM activity_protection_usage WHERE user_id=1) usageCount,(SELECT COUNT(*) FROM activity_protection_alerts WHERE user_id=1) alertCount,(SELECT COUNT(*) FROM security_evidence WHERE user_id=1) auditCount");
  expect(Number(counts.usageCount)).toBe(5);expect(Number(counts.alertCount)).toBe(1);expect(Number(counts.auditCount)).toBeGreaterThan(0);
  const [[email]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1 AND kind='email'");expect(email.held_at).not.toBeNull();
  for(let i=0;i<5;i++)await file(req(),`fresh-${i}`);
  await expect(file(req(),'fresh-sixth')).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const [[allUsage]]=await state.db.query('SELECT COUNT(*) n FROM activity_protection_usage WHERE user_id=1');expect(Number(allUsage.n)).toBe(10);
 });
 it('commits only one concurrent decision on a request',async()=>{
  for(let i=0;i<6;i++)await file(req(),`held-${i}`).catch(()=>{});
  const owner=req();owner.body={reviewHold:true};const ticket=await call(requestFileAccess,owner);
  const review=()=>{const r=req(2);r.params={id:ticket.id};r.body={decision:'reset'};return call(reviewTicket,r);};
  const results=await Promise.allSettled([review(),review()]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const [[audit]]=await state.db.query("SELECT COUNT(*) n FROM security_evidence WHERE action='file_access_reviewed' AND outcome='reset' AND JSON_UNQUOTE(JSON_EXTRACT(details,'$.ticketId'))=?",[ticket.id]);expect(Number(audit.n)).toBe(1);
 });
 it('rolls back reset and ticket resolution when the audit insert fails',async()=>{
  for(let i=0;i<6;i++)await file(req(),`held-${i}`).catch(()=>{});
  const owner=req();owner.body={reviewHold:true};const ticket=await call(requestFileAccess,owner);
  await state.db.query("CREATE TRIGGER fail_reset_audit BEFORE INSERT ON security_evidence FOR EACH ROW BEGIN IF NEW.action='file_access_reviewed' AND NEW.outcome='reset' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END");
  try{
   const reviewer=req(2);reviewer.params={id:ticket.id};reviewer.body={decision:'reset'};
   await expect(call(reviewTicket,reviewer)).rejects.toThrow('synthetic audit failure');
   const [[hold]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1 AND kind='client_file'");expect(hold.held_at).not.toBeNull();
   const [[row]]=await state.db.query('SELECT status FROM activity_protection_tickets WHERE id=?',[ticket.id]);expect(row.status).toBe('pending');
  }finally{await state.db.query('DROP TRIGGER fail_reset_audit');}
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

 it('counts blocked requests separately from accounts and filters review history without changing holds',async()=>{
  await state.db.query("INSERT INTO activity_protection_state (user_id,kind,held_at) VALUES (1,'client_file',UTC_TIMESTAMP(3))");
  const makeAlert=async(userId,reviewed=false)=>{const id=crypto.randomUUID();await state.db.query("INSERT INTO activity_protection_alerts (id,user_id,kind,reason,request_id,session_ref,ip_source,route,units,occurred_at,reviewed_at) VALUES (?,?,'client_file','review_hold',?,?,'unverified_proxy','/api/clients/:id/:value',1,UTC_TIMESTAMP(3),?)",[id,userId,crypto.randomUUID(),'session-a',reviewed?new Date():null]);return id;};
  const a=await makeAlert(1),b=await makeAlert(1),c=await makeAlert(2),unknown=await makeAlert(null),reviewed=await makeAlert(2,true);
  expect(await call(protectionSummary,req())).toMatchObject({alerts:4,accounts:2,unidentified:1,requests:0});
  expect((await call(reviewQueue,req())).alerts.map(x=>x.id).sort()).toEqual([a,b,c,unknown].sort());
  const history={...req(),query:{status:'reviewed'}};expect((await call(reviewQueue,history)).alerts.map(x=>x.id)).toEqual([reviewed]);
  expect((await call(reviewQueue,{...req(),query:{status:'all'}})).alerts).toHaveLength(5);
  await expect(call(reviewQueue,{...req(),query:{status:'invalid'}})).rejects.toHaveProperty('code','ACTIVITY_REVIEW_REQUIRED');
  const [[hold]]=await state.db.query("SELECT held_at FROM activity_protection_state WHERE user_id=1 AND kind='client_file'");expect(hold.held_at).not.toBeNull();
  const [[count]]=await state.db.query('SELECT COUNT(*) n FROM activity_protection_alerts');expect(Number(count.n)).toBe(5);
 });

});
