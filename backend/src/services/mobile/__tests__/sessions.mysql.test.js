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
      CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(50),portal_url VARCHAR(50),is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0);
      CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOLEAN DEFAULT 1);
      CREATE TABLE quick_view_sessions(id INT PRIMARY KEY AUTO_INCREMENT,user_id INT,agency_id INT,session_token_hash VARCHAR(64),expires_at DATETIME,revoked_at DATETIME);
      CREATE TABLE chat_threads(id INT PRIMARY KEY,agency_id INT);
      CREATE TABLE chat_messages(id INT PRIMARY KEY AUTO_INCREMENT,thread_id INT,sender_user_id INT);
      CREATE TABLE chat_thread_participants(thread_id INT,user_id INT);
      CREATE TABLE chat_message_deletes(message_id INT,user_id INT);
      CREATE TABLE notifications(id INT PRIMARY KEY,user_id INT,related_entity_type VARCHAR(40),related_entity_id INT,muted_until DATETIME);
      CREATE TABLE notification_user_reads(notification_id INT,user_id INT,muted_until DATETIME);
      CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT);
      CREATE TABLE communication_messages(id INT PRIMARY KEY AUTO_INCREMENT,conversation_id INT,channel VARCHAR(20),direction VARCHAR(20),is_internal_note BOOLEAN DEFAULT 0);
      CREATE TABLE message_logs(id INT PRIMARY KEY AUTO_INCREMENT,agency_id INT,user_id INT,assigned_user_id INT,number_id INT,client_id INT,direction VARCHAR(20));
      CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,provider_id INT);
      CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active BOOLEAN);
      CREATE TABLE twilio_number_assignments(number_id INT,user_id INT,is_active BOOLEAN,sms_access_enabled BOOLEAN);`);
    const migration=await readFile(new URL('../../../../../database/migrations/1761_auricwell_mobile_device_sessions.sql',import.meta.url),'utf8');
    await db.query(migration);
  });
  afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE ${name}`);await admin.end();}});
  beforeEach(async()=>{
    clock=new Date();
    await db.query(`SET FOREIGN_KEY_CHECKS=0;TRUNCATE mobile_push_deliveries;TRUNCATE mobile_authorization_codes;TRUNCATE mobile_device_sessions;TRUNCATE quick_view_sessions;TRUNCATE users;TRUNCATE agencies;TRUNCATE user_agencies;TRUNCATE chat_messages;TRUNCATE chat_threads;TRUNCATE chat_thread_participants;TRUNCATE communication_messages;TRUNCATE communication_conversations;TRUNCATE message_logs;TRUNCATE notifications;SET FOREIGN_KEY_CHECKS=1;
      INSERT INTO users(id,first_name,email,role,password_hash)VALUES(1,'Test','one@example.invalid','provider','hash'),(2,'Other','two@example.invalid','provider','other');
      INSERT INTO agencies(id,name,portal_url)VALUES(10,'Test','itsco'),(20,'Other','other');
      INSERT INTO user_agencies(user_id,agency_id)VALUES(1,10),(2,10);`);
    service=createMobileSessionService({db,findUser:async id=>(await db.execute('SELECT * FROM users WHERE id=?',[id]))[0][0],assertStaff:async()=>{},assertProduct:async()=>{},now:()=>clock,
      issueSession:async({userId,agencyId,mobileDeviceId})=>{const sessionToken=opaqueToken(),expiresAt=new Date(clock.getTime()+600000);await db.execute('INSERT INTO quick_view_sessions(user_id,agency_id,mobile_device_session_id,session_token_hash,expires_at)VALUES(?,?,?,?,?)',[userId,agencyId,mobileDeviceId,digest(sessionToken),expiresAt]);return {sessionToken,userId,agencyId,expiresAt};}});
  });
  async function enroll(clientId='web') {
    const verifier=opaqueToken(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const callback=clientId==='web'?redirectUri:'com.auricwell.mobile://auth';
    const grant=await service.authorize({userId:1,agencyId:10,clientId,redirectUri:callback,challenge});
    return {...await service.exchange({code:grant.code,verifier,clientId,redirectUri:callback}),code:grant.code,verifier};
  }
  it('rejects a wrong verifier without consuming the code; allows exactly one exchange',async()=>{
    const verifier=opaqueToken(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    const {code}=await service.authorize({userId:1,agencyId:10,clientId:'web',redirectUri,challenge});
    await expect(service.exchange({code,verifier:opaqueToken(),clientId:'web',redirectUri})).rejects.toMatchObject({code:'MOBILE_CODE_EXPIRED'});
    const results=await Promise.allSettled([1,2].map(()=>service.exchange({code,verifier,clientId:'web',redirectUri})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  });
  it('keeps the device signed in across locks and revokes every scoped session on logout',async()=>{
    const {deviceToken,deviceId}=await enroll();const first=await service.setCode(deviceToken,'012345');
    clock=new Date(clock.getTime()+20*60000);
    const second=await service.unlock(deviceToken,{code:'012345'});expect(second.sessionToken).not.toBe(first.sessionToken);
    await service.logout(deviceToken);await expect(service.device(deviceToken)).rejects.toMatchObject({code:'MOBILE_SIGN_IN_REQUIRED'});
    const [[remaining]]=await db.execute('SELECT COUNT(*) AS n FROM quick_view_sessions WHERE mobile_device_session_id=? AND revoked_at IS NULL',[deviceId]);expect(remaining.n).toBe(0);
  });
  it('serializes failed unlock attempts and revokes after five; browser cannot claim biometric unlock',async()=>{
    const {deviceToken}=await enroll();await service.setCode(deviceToken,'123456');
    await expect(service.unlock(deviceToken,{biometric:true})).rejects.toMatchObject({code:'MOBILE_NATIVE_ONLY'});
    await Promise.allSettled(Array.from({length:5},()=>service.unlock(deviceToken,{code:'111111'})));
    await expect(service.unlock(deviceToken,{code:'123456'})).rejects.toMatchObject({code:'MOBILE_SIGN_IN_REQUIRED'});
  });
  it('blocks removed memberships, disabled users, password changes and expired device grants',async()=>{
    const {deviceToken}=await enroll();await service.setCode(deviceToken,'123456');
    await expect(service.switchWorkspace(await service.device(deviceToken),20)).rejects.toMatchObject({code:'MOBILE_WORKSPACE_UNAVAILABLE'});
    await db.execute("UPDATE users SET password_hash='changed' WHERE id=1");
    await expect(service.device(deviceToken)).rejects.toMatchObject({code:'MOBILE_ACCOUNT_CHANGED'});
    const next=await enroll();clock=new Date(clock.getTime()+91*86400000);
    await expect(service.device(next.deviceToken)).rejects.toMatchObject({code:'MOBILE_SIGN_IN_REQUIRED'});
  });
  it('revalidates disabled accounts and removed workspace membership on an existing device',async()=>{
    let grant=await enroll();await db.execute('UPDATE user_agencies SET is_active=0 WHERE user_id=1');
    await expect(service.device(grant.deviceToken)).rejects.toMatchObject({code:'MOBILE_WORKSPACE_UNAVAILABLE'});
    await db.execute('UPDATE user_agencies SET is_active=1 WHERE user_id=1');grant=await enroll();
    await db.execute('UPDATE users SET is_active=0 WHERE id=1');
    await expect(service.device(grant.deviceToken)).rejects.toMatchObject({code:'ACCOUNT_DISABLED'});
  });
  it('starts notification cursors at opt-in and preserves them on token renewal',async()=>{
    const {deviceToken,deviceId}=await enroll('ios');await service.setCode(deviceToken,'123456');
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
    const {deviceToken}=await enroll();await service.setCode(deviceToken,'123456');
    await db.query('INSERT INTO user_agencies VALUES(1,20,1);INSERT INTO chat_threads VALUES(2,20);INSERT INTO chat_thread_participants VALUES(2,1);INSERT INTO chat_messages(thread_id,sender_user_id)VALUES(2,2)');
    const worker=createMobilePushWorker({db,sessions:service,refreshSecure:async()=>{}}),device=(await service.device(deviceToken)).device;
    expect(await worker.permitted(device,'chat',1)).toBe(2);
    await db.query("INSERT INTO notifications VALUES(1,1,'chat_thread',2,DATE_ADD(NOW(),INTERVAL 1 HOUR))");
    expect(await worker.permitted(device,'chat',1)).toBeNull();
    await db.query('DELETE FROM notifications;UPDATE user_agencies SET is_active=0 WHERE user_id=1 AND agency_id=20');
    expect(await worker.permitted(device,'chat',1)).toBeNull();
  });
  it('queues every chat/reply, email and SMS once and rechecks recipient permissions before delivery',async()=>{
    const {deviceToken,deviceId}=await enroll();await service.setCode(deviceToken,'123456');
    await db.execute('UPDATE mobile_device_sessions SET push_enabled=1,chat_cursor=0,email_cursor=0,sms_cursor=0 WHERE id=?',[deviceId]);
    await db.query(`INSERT INTO chat_threads VALUES(1,10),(2,20);INSERT INTO chat_thread_participants VALUES(1,1),(2,1);
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
