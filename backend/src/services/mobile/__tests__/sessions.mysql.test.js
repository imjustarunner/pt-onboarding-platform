import {beforeAll,afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../hireStaffAccess.service.js',()=>({assertHireStaffAccess:vi.fn()}));
vi.mock('../../productIdentity.service.js',()=>({assertFullSuiteIdentity:vi.fn()}));
vi.mock('../../quickViewAuth.service.js',()=>({startAuthenticatedMobileSession:vi.fn()}));
vi.mock('../../clientSecureConversation.service.js',()=>({refreshClientSecureAccess:vi.fn()}));
vi.mock('../../communicationAccess.service.js',()=>({requireConversationAccess:vi.fn()}));
import {createMobileSessionService} from '../session.service.js';
import {createMobilePushWorker,createMobilePushRegistration,mobilePushPayload,validateWebSubscription} from '../push.service.js';
import {digest,opaqueToken} from '../policy.js';

it('uses a private, unique message notification with no message text',()=>{
  const payload=mobilePushPayload({source_kind:'chat',source_id:23,body:'private',sender:'private'});
  expect(payload).toEqual({title:'Auricwell',body:'New message',url:'/mobile/workspace?kind=chat&id=23',tag:'auricwell-chat-23'});
  expect(()=>validateWebSubscription({endpoint:'https://127.0.0.1/private',keys:{}})).toThrow();
});

describe.runIf(process.env.MOBILE_MYSQL_TEST==='1')('isolated MySQL device sessions and complete Conversa push',()=>{
  let admin,db,service,clock;
  const name=`auricwell_mobile_test_${process.pid}`;
  const redirectUri='https://auricwell.com/mobile/callback';
  beforeAll(async()=>{
    // Never use application DB_NAME or its credentials for this disposable fixture.
    const options=process.env.MOBILE_MYSQL_SOCKET?{socketPath:process.env.MOBILE_MYSQL_SOCKET}:{host:'127.0.0.1',port:Number(process.env.MOBILE_MYSQL_PORT || 3408)};
    admin=await mysql.createConnection({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD || '',multipleStatements:true});
    await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db=mysql.createPool({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD || '',database:name,timezone:'+00:00',multipleStatements:true});
    await db.query(`CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(40),last_name VARCHAR(40),email VARCHAR(100),role VARCHAR(40),password_hash VARCHAR(100),is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0,status VARCHAR(40),terminated_at DATETIME);
      CREATE TABLE user_quick_view_credentials(user_id INT PRIMARY KEY,agency_id INT,passcode_hash VARCHAR(100),passcode_set_at DATETIME,passcode_version INT DEFAULT 0,failed_passcode_attempts INT DEFAULT 0,passcode_locked_until DATETIME,last_passcode_ok_at DATETIME);
      CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(50),portal_url VARCHAR(50),is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0);
      CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOLEAN DEFAULT 1);
      CREATE TABLE quick_view_sessions(id INT PRIMARY KEY AUTO_INCREMENT,user_id INT,agency_id INT,session_token_hash VARCHAR(64),credential_token_version INT DEFAULT 0,expires_at DATETIME,revoked_at DATETIME);
      CREATE TABLE chat_threads(id INT PRIMARY KEY,agency_id INT,message_channel VARCHAR(20) NOT NULL DEFAULT 'internal');
      CREATE TABLE chat_messages(id INT PRIMARY KEY AUTO_INCREMENT,thread_id INT,sender_user_id INT,parent_message_id INT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE chat_thread_participants(thread_id INT,user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE chat_message_deletes(message_id INT,user_id INT);
      CREATE TABLE notifications(id INT PRIMARY KEY,user_id INT,related_entity_type VARCHAR(40),related_entity_id INT,muted_until DATETIME);
      CREATE TABLE notification_user_reads(notification_id INT,user_id INT,muted_until DATETIME);
      CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT);
      CREATE TABLE communication_messages(id INT PRIMARY KEY AUTO_INCREMENT,conversation_id INT,channel VARCHAR(20),direction VARCHAR(20),is_internal_note BOOLEAN DEFAULT 0,subject VARCHAR(255),suppress_push BOOLEAN DEFAULT 0,auto_reply_kind VARCHAR(64));
      CREATE TABLE message_logs(id INT PRIMARY KEY AUTO_INCREMENT,agency_id INT,user_id INT,assigned_user_id INT,number_id INT,client_id INT,direction VARCHAR(20));
      CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,provider_id INT);
      CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active BOOLEAN);
      CREATE TABLE twilio_number_assignments(number_id INT,user_id INT,is_active BOOLEAN,sms_access_enabled BOOLEAN);`);
    const migration=await readFile(new URL('../../../../../database/migrations/1762_auricwell_mobile_device_sessions.sql',import.meta.url),'utf8');
    await db.query(migration);
    await db.query(await readFile(new URL('../../../../../database/migrations/1768_mobile_optional_app_lock.sql',import.meta.url),'utf8'));
    await db.query(await readFile(new URL('../../../../../database/migrations/1778_mobile_primary_authentication_context.sql',import.meta.url),'utf8'));
    await db.query('ALTER TABLE mobile_device_sessions ADD COLUMN notification_cursor BIGINT UNSIGNED NULL');
    await db.query(await readFile(new URL('../../../../../database/migrations/1797_mandatory_mobile_account_lock.sql',import.meta.url),'utf8'));
    await db.query(await readFile(new URL('../../../../../database/migrations/1798_mobile_inactivity_window.sql',import.meta.url),'utf8'));
    const secureBoundary=await readFile(new URL('../../../../../database/migrations/1556_secure_message_boundaries.sql',import.meta.url),'utf8');
    await db.query(secureBoundary.slice(secureBoundary.indexOf('CREATE TABLE client_secure_message_records')));
    await db.query(await readFile(new URL('../../../../../database/migrations/1794_family_shared_conversations.sql',import.meta.url),'utf8'));
  });
  afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE ${name}`);await admin.end();}});
  beforeEach(async()=>{
    clock=new Date(Math.floor(Date.now()/1000)*1000);
    await db.query(`SET FOREIGN_KEY_CHECKS=0;TRUNCATE mobile_push_deliveries;TRUNCATE mobile_authorization_codes;TRUNCATE mobile_device_sessions;TRUNCATE user_quick_view_credentials;TRUNCATE quick_view_sessions;TRUNCATE users;TRUNCATE agencies;TRUNCATE user_agencies;TRUNCATE chat_messages;TRUNCATE chat_threads;TRUNCATE chat_thread_participants;TRUNCATE communication_messages;TRUNCATE communication_conversations;TRUNCATE message_logs;TRUNCATE notifications;SET FOREIGN_KEY_CHECKS=1;
      INSERT INTO users(id,first_name,email,role,password_hash)VALUES(1,'Test','one@example.invalid','provider','hash'),(2,'Other','two@example.invalid','provider','other');
      INSERT INTO agencies(id,name,portal_url)VALUES(10,'Test','itsco'),(20,'Other','other');
      INSERT INTO user_agencies(user_id,agency_id)VALUES(1,10),(2,10);INSERT INTO user_quick_view_credentials(user_id,agency_id,passcode_hash,passcode_set_at)VALUES(1,10,'fixture:123456',NOW());`);
    service=createMobileSessionService({db,findUser:async id=>(await db.execute('SELECT * FROM users WHERE id=?',[id]))[0][0],assertStaff:async()=>{},assertProduct:async()=>{},now:()=>clock,
      compare:async(code,encoded)=>encoded===`fixture:${code}`,hash:async code=>`fixture:${code}`,issueSession:async({userId,agencyId,mobileDeviceId,mobileDeviceVersion=0,expiresAt})=>{const sessionToken=opaqueToken();await db.execute('INSERT INTO quick_view_sessions(user_id,agency_id,mobile_device_session_id,session_token_hash,credential_token_version,expires_at)VALUES(?,?,?,?,?,?)',[userId,agencyId,mobileDeviceId,digest(sessionToken),mobileDeviceVersion,expiresAt]);return {sessionToken,userId,agencyId,expiresAt};}});
  });
  async function enroll(clientId='web',existingToken=null,primaryAuthentication=null) {
    const verifier=opaqueToken(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const callback=clientId==='web'?redirectUri:'com.auricwell.mobile://auth';
    const grant=await service.authorize({userId:1,agencyId:10,clientId,redirectUri:callback,challenge,primaryAuthentication});
    return {...await service.exchange({code:grant.code,verifier,clientId,redirectUri:callback},existingToken),code:grant.code,verifier};
  }
  async function configureAccountCode(raw,code){await db.execute('UPDATE user_quick_view_credentials SET passcode_hash=? WHERE user_id=1',[`fixture:${code}`]);return service.configureLock(await service.device(raw),{method:'code',code});}
  it('rejects a wrong verifier without consuming the code; allows exactly one exchange',async()=>{
    const verifier=opaqueToken(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const {code}=await service.authorize({userId:1,agencyId:10,clientId:'web',redirectUri,challenge});
    await expect(service.exchange({code,verifier:opaqueToken(),clientId:'web',redirectUri})).rejects.toMatchObject({code:'MOBILE_CODE_EXPIRED'});
    const results=await Promise.allSettled([1,2].map(()=>service.exchange({code,verifier,clientId:'web',redirectUri})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  });
  it('retains server verification context through code exchange and replaces it on re-enrollment without exposing it',async()=>{
    const proof={sessionKey:'original-verified-session',authMethod:'account',issuedAt:Math.floor(clock.getTime()/1000)};
    const grant=await enroll('web',null,proof),context=await service.device(grant.deviceToken);
    const decode=value=>typeof value==='string'?JSON.parse(value):value;
    expect(decode(context.device.primary_authentication_json)).toEqual(proof);
    expect(JSON.stringify(grant.profile)).not.toContain(proof.sessionKey);
    const replacement={...proof,sessionKey:'new-verified-session'};
    const renewed=await enroll('web',grant.deviceToken,replacement);
    expect(renewed.deviceId).toBe(grant.deviceId);expect(decode((await service.device(grant.deviceToken)).device.primary_authentication_json)).toEqual(replacement);
  });
  it('requires the existing account code and preserves it across primary re-sign-in',async()=>{
    const first=await enroll();expect(first.needsCode).toBe(false);expect(first.profile.appLock).toMatchObject({method:'code',usesAccountCode:true});expect(first.initialAccountCode).toBeUndefined();
    expect((await service.resume(first.deviceToken)).sessionToken).toBeTruthy();await expect(service.setCode(first.deviceToken,'999999')).rejects.toMatchObject({code:'MOBILE_ACCOUNT_CODE_REQUIRED'});
    const second=await enroll('web',first.deviceToken);expect(second.deviceId).toBe(first.deviceId);expect(second.newDevice).toBe(false);expect((await service.unlock(second.deviceToken,{code:'123456'})).sessionToken).toBeTruthy();
    const [[credential]]=await db.execute('SELECT passcode_hash FROM user_quick_view_credentials WHERE user_id=1');expect(credential.passcode_hash).toBe('fixture:123456');
  });
  it('resumes the same valid short grant without extending its inactivity timer; requires unlock at the exact hour',async()=>{
    const grant=await enroll('web',null,{sessionKey:'fresh-sso',authMethod:'google',issuedAt:Math.floor(clock.getTime()/1000)}),deadline=new Date(grant.expiresAt).getTime();
    expect(deadline-clock.getTime()).toBe(3600000);
    clock=new Date(clock.getTime()+3599999);
    const resumed=await service.resume(grant.deviceToken,{sessionToken:grant.sessionToken});
    expect(resumed.sessionToken).toBe(grant.sessionToken);expect(new Date(resumed.expiresAt).getTime()).toBe(deadline);
    clock=new Date(deadline);await expect(service.resume(grant.deviceToken)).rejects.toMatchObject({code:'MOBILE_LOCKED'});
    const unlocked=await service.unlock(grant.deviceToken,{code:'123456'});expect(new Date(unlocked.expiresAt).getTime()).toBe(deadline+3600000);
  });
  it('extends only verified actual activity, preserves +10 minutes, and rejects activity after expiry or manual lock',async()=>{
    const grant=await enroll(),first=new Date(grant.expiresAt).getTime();clock=new Date(clock.getTime()+30*60000);
    let context=await service.device(grant.deviceToken);const activity=await service.recordActivity(context);
    expect(new Date(activity.expiresAt).getTime()).toBe(first+30*60000);
    context=await service.device(grant.deviceToken);const extended=await service.recordActivity(context,{extendMinutes:10});expect(new Date(extended.expiresAt).getTime()).toBe(first+40*60000);
    await service.lock(grant.deviceToken);await expect(service.resume(grant.deviceToken)).rejects.toMatchObject({code:'MOBILE_LOCKED'});
    await expect(service.recordActivity(await service.device(grant.deviceToken))).rejects.toMatchObject({code:'MOBILE_LOCKED'});
    const [[old]]=await db.execute('SELECT revoked_at FROM quick_view_sessions WHERE session_token_hash=?',[digest(grant.sessionToken)]);expect(old.revoked_at).toBeTruthy();
  });
  it('never revives a grant cleared by a concurrent explicit lock while a resume is issuing a replacement short token',async()=>{
    const grant=await enroll(),original=db.execute.bind(db);let intercepted=false;
    const spy=vi.spyOn(db,'execute').mockImplementation(async(sql,args)=>{
      if(!intercepted && sql.startsWith('UPDATE mobile_device_sessions SET last_used_at=? WHERE')){intercepted=true;await original('UPDATE mobile_device_sessions SET unlocked_until=NULL WHERE id=?',[grant.deviceId]);}
      return original(sql,args);
    });
    try{await expect(service.resume(grant.deviceToken)).rejects.toMatchObject({code:'MOBILE_LOCKED'});expect(intercepted).toBe(true);const [[device]]=await original('SELECT unlocked_until FROM mobile_device_sessions WHERE id=?',[grant.deviceId]);expect(device.unlocked_until).toBeNull();}
    finally{spy.mockRestore();}
  });
  it('chooses an authorized internal context when primary sign-in omits an agency',async()=>{
    await db.query('INSERT INTO user_agencies(user_id,agency_id)VALUES(1,20)');
    const verifier=opaqueToken(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const auth=await service.authorize({userId:1,clientId:'web',redirectUri,challenge});const result=await service.exchange({code:auth.code,verifier,clientId:'web',redirectUri});
    expect(result.profile.agencies.map(a=>a.id).sort()).toEqual([10,20]);expect([10,20]).toContain(result.agencyId);
    await expect(service.authorize({userId:1,agencyId:999,clientId:'web',redirectUri,challenge})).rejects.toMatchObject({code:'MOBILE_WORKSPACE_UNAVAILABLE'});
  });
  it('creates a random account code only when missing and returns it once after primary sign-in',async()=>{await db.query('DELETE FROM user_quick_view_credentials');const first=await enroll();expect(first.initialAccountCode).toMatch(/^\d{6}$/);expect((await service.unlock(first.deviceToken,{code:first.initialAccountCode})).sessionToken).toBeTruthy();expect((await enroll('web',first.deviceToken)).initialAccountCode).toBeUndefined();});
  it('enables native biometrics, rejects browser biometric claims and never permits opting out',async()=>{
    const grant=await enroll('ios'),context=await service.device(grant.deviceToken);await expect(service.configureLock(context,{method:'biometric'})).rejects.toMatchObject({code:'MOBILE_NATIVE_ONLY'});
    const protectedSession=await service.configureLock(context,{method:'biometric',biometricVerified:true});expect(protectedSession.profile.appLock).toMatchObject({method:'biometric',usesAccountCode:true});expect((await service.resume(grant.deviceToken)).sessionToken).toBeTruthy();expect((await service.unlock(grant.deviceToken,{biometric:true})).sessionToken).toBeTruthy();await expect(service.configureLock(await service.device(grant.deviceToken),{method:'none'})).rejects.toMatchObject({code:'MOBILE_METHOD_INVALID'});
  });
  it('migrates a legacy opt-out to the account code without accepting its old custom device code',async()=>{const grant=await enroll();await db.execute("UPDATE mobile_device_sessions SET app_lock_method='none',quick_code_hash='fixture:999999' WHERE id=?",[grant.deviceId]);expect(service.lockInfo((await service.device(grant.deviceToken)).device).method).toBe('code');expect((await service.resume(grant.deviceToken)).sessionToken).toBeTruthy();await expect(service.unlock(grant.deviceToken,{code:'999999'})).rejects.toMatchObject({code:'MOBILE_UNLOCK_FAILED'});expect((await service.unlock(grant.deviceToken,{code:'123456'})).sessionToken).toBeTruthy();});
  it('invalidates short sessions minted against a previous app lock preference',async()=>{
    const grant=await enroll();
    const oldVersion=(await service.device(grant.deviceToken)).device.app_lock_version;
    await service.configureLock(await service.device(grant.deviceToken),{method:'code',code:'123456'});
    await expect(service.access(grant.deviceId,1,10,oldVersion)).rejects.toMatchObject({code:'MOBILE_LOCKED'});
    const current=await service.device(grant.deviceToken);expect(Number(current.device.app_lock_version)).toBe(Number(oldVersion)+1);
    await expect(service.access(grant.deviceId,1,10,current.device.app_lock_version)).resolves.toMatchObject({device:{id:grant.deviceId}});
  });
  it('keeps the device signed in across locks and revokes every scoped session on logout',async()=>{
    const {deviceToken,deviceId}=await enroll();const first=await configureAccountCode(deviceToken,'012345');
    clock=new Date(clock.getTime()+20*60000);
    const second=await service.unlock(deviceToken,{code:'012345'});expect(second.sessionToken).not.toBe(first.sessionToken);
    await service.logout(deviceToken);await expect(service.device(deviceToken)).rejects.toMatchObject({code:'MOBILE_SIGN_IN_REQUIRED'});
    const [[remaining]]=await db.execute('SELECT COUNT(*) AS n FROM quick_view_sessions WHERE mobile_device_session_id=? AND revoked_at IS NULL',[deviceId]);expect(remaining.n).toBe(0);
  });
  it('serializes account-code attempts and locks after three; browser cannot claim biometric unlock',async()=>{
    const {deviceToken}=await enroll();await configureAccountCode(deviceToken,'123456');
    await expect(service.unlock(deviceToken,{biometric:true})).rejects.toMatchObject({code:'MOBILE_NATIVE_ONLY'});
    await Promise.allSettled(Array.from({length:3},()=>service.unlock(deviceToken,{code:'111111'})));
    await expect(service.unlock(deviceToken,{code:'123456'})).rejects.toMatchObject({code:'MOBILE_ACCOUNT_CODE_LOCKED'});
  });
  it('blocks removed memberships, disabled users, password changes and expired device grants',async()=>{
    const {deviceToken}=await enroll();await configureAccountCode(deviceToken,'123456');
    await expect(service.switchWorkspace(await service.device(deviceToken),20)).rejects.toMatchObject({code:'MOBILE_WORKSPACE_UNAVAILABLE'});
    await db.execute("UPDATE users SET password_hash='changed' WHERE id=1");
    await expect(service.device(deviceToken)).rejects.toMatchObject({code:'MOBILE_ACCOUNT_CHANGED'});
    const next=await enroll();clock=new Date(clock.getTime()+91*86400000);
    await expect(service.device(next.deviceToken)).rejects.toMatchObject({code:'MOBILE_SIGN_IN_REQUIRED'});
  });
  it('rolls out mandatory lock without changing the account code or durable primary authentication',async()=>{const grant=await enroll(),before=(await service.device(grant.deviceToken)).device;await db.execute("UPDATE mobile_device_sessions SET app_lock_method='none',quick_code_hash='fixture:654321' WHERE id=?",[grant.deviceId]);await db.query(await readFile(new URL('../../../../../database/migrations/1797_mandatory_mobile_account_lock.sql',import.meta.url),'utf8'));
    const after=(await service.device(grant.deviceToken)).device;expect(after.app_lock_method).toBe('code');expect(after.quick_code_hash).toBeNull();expect(after.enrolled_at).toEqual(before.enrolled_at);expect(after.revoked_at).toBeNull();const [[active]]=await db.execute('SELECT COUNT(*) AS n FROM quick_view_sessions WHERE mobile_device_session_id=? AND revoked_at IS NULL',[grant.deviceId]);expect(active.n).toBe(0);expect((await service.unlock(grant.deviceToken,{code:'123456'})).sessionToken).toBeTruthy();});
  it('requires primary sign-in at 30 days despite continued code unlocks or activity',async()=>{const proof={sessionKey:'verified-account',authMethod:'account',issuedAt:Math.floor(clock.getTime()/1000)},grant=await enroll('web',null,proof);clock=new Date(clock.getTime()+29*86400000);expect((await service.unlock(grant.deviceToken,{code:'123456'})).sessionToken).toBeTruthy();clock=new Date(clock.getTime()+86400000);await expect(service.unlock(grant.deviceToken,{code:'123456'})).rejects.toMatchObject({code:'MOBILE_SIGN_IN_REQUIRED'});const [[row]]=await db.execute('SELECT revoked_at,push_enabled FROM mobile_device_sessions WHERE id=?',[grant.deviceId]);expect(row.revoked_at).toBeTruthy();expect(Number(row.push_enabled)).toBe(0);await expect(enroll('web',null,proof)).rejects.toMatchObject({code:'MOBILE_PRIMARY_REQUIRED'});const next=await enroll('web',grant.deviceToken,{...proof,issuedAt:Math.floor(clock.getTime()/1000)});expect((await service.unlock(next.deviceToken,{code:'123456'})).sessionToken).toBeTruthy();});
  it('revalidates disabled accounts and removed workspace membership on an existing device',async()=>{
    let grant=await enroll();await db.execute('UPDATE user_agencies SET is_active=0 WHERE user_id=1');
    await expect(service.device(grant.deviceToken)).rejects.toMatchObject({code:'MOBILE_WORKSPACE_UNAVAILABLE'});
    await db.execute('UPDATE user_agencies SET is_active=1 WHERE user_id=1');grant=await enroll();
    await db.execute('UPDATE users SET is_active=0 WHERE id=1');
    await expect(service.device(grant.deviceToken)).rejects.toMatchObject({code:'ACCOUNT_DISABLED'});
  });
  it('starts notification cursors at opt-in and preserves them on token renewal',async()=>{
    const {deviceToken,deviceId}=await enroll('ios');await configureAccountCode(deviceToken,'123456');
    const register=createMobilePushRegistration(db),context=await service.device(deviceToken);
    await db.query('INSERT INTO chat_messages(thread_id,sender_user_id)VALUES(1,2)');
    await register(context,{enabled:true,token:'a'.repeat(64),environment:'sandbox'});
    await db.query('INSERT INTO chat_messages(thread_id,sender_user_id)VALUES(1,2)');
    await register(context,{enabled:true,token:'b'.repeat(64),environment:'sandbox'});
    let device=(await service.device(deviceToken)).device;expect(Number(device.chat_cursor)).toBe(1);
    await register(context,{enabled:false});await register(context,{enabled:true,token:'c'.repeat(64),environment:'sandbox'});
    device=(await service.device(deviceToken)).device;expect(Number(device.chat_cursor)).toBe(2);
    expect(Number(device.id)).toBe(deviceId);
  });
  it('includes authorized secondary workspaces and skips explicit chat mutes',async()=>{
    const {deviceToken}=await enroll();await configureAccountCode(deviceToken,'123456');
    await db.query('INSERT INTO user_agencies VALUES(1,20,1);INSERT INTO chat_threads(id,agency_id) VALUES(2,20);INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(2,1);INSERT INTO chat_messages(thread_id,sender_user_id)VALUES(2,2)');
    const worker=createMobilePushWorker({db,sessions:service,refreshSecure:async()=>{}}),device=(await service.device(deviceToken)).device;
    expect(await worker.permitted(device,'chat',1)).toBe(2);
    await db.query("INSERT INTO notifications VALUES(1,1,'chat_thread',2,DATE_ADD(NOW(),INTERVAL 1 HOUR))");
    expect(await worker.permitted(device,'chat',1)).toBeNull();
    await db.query('DELETE FROM notifications;UPDATE user_agencies SET is_active=0 WHERE user_id=1 AND agency_id=20');
    expect(await worker.permitted(device,'chat',1)).toBeNull();
  });
  it('queues every chat/reply, email and SMS once and rechecks recipient permissions before delivery',async()=>{
    const {deviceToken,deviceId}=await enroll();await configureAccountCode(deviceToken,'123456');
    await db.execute('UPDATE mobile_device_sessions SET push_enabled=1,chat_cursor=0,email_cursor=0,sms_cursor=0 WHERE id=?',[deviceId]);
    await db.query(`INSERT INTO chat_threads(id,agency_id) VALUES(1,10),(2,20);INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(1,1),(2,1);
      INSERT INTO chat_messages(thread_id,sender_user_id)VALUES(1,2),(1,2),(1,1),(2,2);
      INSERT INTO communication_conversations VALUES(1,10),(2,20);INSERT INTO communication_messages(conversation_id,channel,direction)VALUES(1,'email','inbound'),(1,'email','outbound'),(2,'email','inbound');
      INSERT INTO message_logs(agency_id,user_id,direction)VALUES(10,1,'INBOUND'),(10,2,'INBOUND'),(20,1,'INBOUND');`);
    const sendWeb=vi.fn(),worker=createMobilePushWorker({db,sessions:service,refreshSecure:async()=>{},conversationAccess:async()=>{},configuration:()=>({webReady:true}),sendWeb});
    await worker.tick();await worker.tick();expect(sendWeb).toHaveBeenCalledTimes(4);
    const [[queued]]=await db.execute('SELECT COUNT(*) AS n FROM mobile_push_deliveries');expect(queued.n).toBe(4);
    await db.query('INSERT INTO chat_messages(thread_id,sender_user_id)VALUES(1,2)');
    const device=(await service.device(deviceToken)).device;await worker.scan(device);
    await db.execute('DELETE FROM chat_thread_participants WHERE thread_id=1 AND user_id=1');
    await worker.tick();expect(sendWeb).toHaveBeenCalledTimes(4);
  });
});
