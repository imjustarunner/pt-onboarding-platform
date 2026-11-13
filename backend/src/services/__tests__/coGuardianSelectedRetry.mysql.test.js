import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
const m=vi.hoisted(()=>({db:null,email:vi.fn(),access:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...a)=>m.db.execute(...a),getConnection:()=>m.db.getConnection()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>(await m.db.execute('SELECT * FROM users WHERE id=?',[id]))[0][0],
 findByEmail:async email=>(await m.db.execute('SELECT * FROM users WHERE LOWER(email)=?',[email]))[0][0]}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:4,name:'Synthetic agency'})}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../coGuardianInvite.service.js',()=>({emailCoGuardianInvite:m.email,invitePublicUrl:()=> 'https://synthetic.test/intake/local',insertGuardianAccessTicket:vi.fn()}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:vi.fn()}));
import {previewStaffGuardianRetries,sendStaffSelectedGuardianRetry,resendGuardianInvitation,sendStaffGuardianInvitationReminder} from '../coGuardianDelivery.service.js';

describe.skipIf(!recoveryMysqlEnabled)('selected failed guardian retry with actual isolated SQL',()=>{
 let fixture;
 beforeAll(async()=>{
  fixture=await isolatedWorkflowMysql('guardian_selected_retry');m.db=fixture.db;
  const statements=[
   `CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(32),first_name VARCHAR(64),last_name VARCHAR(64),email VARCHAR(255),is_active TINYINT,status VARCHAR(32),is_archived TINYINT DEFAULT 0)`,
   `CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,initials VARCHAR(32),date_of_birth DATE)`,
   `CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled TINYINT,permissions_json JSON)`,
   `CREATE TABLE intake_links(id INT PRIMARY KEY,public_key VARCHAR(80) COLLATE utf8mb4_0900_ai_ci,is_active TINYINT,create_guardian TINYINT,master_channel VARCHAR(32),scope_type VARCHAR(32),organization_id INT)`,
   `CREATE TABLE co_guardian_invites(id INT PRIMARY KEY,agency_id INT,invited_by_user_id INT,invited_email VARCHAR(255),invited_first_name VARCHAR(64),invited_last_name VARCHAR(64),status VARCHAR(24),source VARCHAR(32),public_key VARCHAR(80) COLLATE utf8mb4_unicode_ci,token_hash VARCHAR(64),expires_at DATETIME)`,
   `CREATE TABLE co_guardian_invite_clients(invite_id INT,client_id INT)`,
   `CREATE TABLE co_guardian_invite_deliveries(id INT AUTO_INCREMENT PRIMARY KEY,invite_id INT,recipient_email VARCHAR(255),enrollment_channel VARCHAR(32),delivery_kind VARCHAR(24),automatic_reminder TINYINT,delivery_status VARCHAR(24) DEFAULT 'sending',communication_id INT,internet_message_id VARCHAR(255),failure_kind VARCHAR(32),created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
   `CREATE TABLE co_guardian_invite_reminders(invite_id INT PRIMARY KEY,recipient_email VARCHAR(255),first_sent_at DATETIME,next_due_at DATETIME,state VARCHAR(24),reminders_attempted INT DEFAULT 0)`,
   `CREATE TABLE intake_submissions(id INT PRIMARY KEY,intake_link_id INT,co_guardian_invite_id INT,session_token VARCHAR(80),status VARCHAR(24),submitted_at DATETIME,updated_at DATETIME,draft_expires_at DATETIME,retention_expires_at DATETIME)`
  ];for(const sql of statements)await m.db.query(sql);
 });
 beforeEach(async()=>{
  for(const table of ['co_guardian_invite_reminders','co_guardian_invite_deliveries','co_guardian_invite_clients','co_guardian_invites','intake_submissions','intake_links','client_guardians','clients','users'])await m.db.query(`DELETE FROM ${table}`);
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(501,'support','Fictional','Support','testing+support@example.com',1,'ACTIVE'),(8,'client_guardian','Fictional','Parent','testing+parent@example.com',1,'ACTIVE')`);
  await m.db.query(`INSERT INTO clients VALUES(5,4,'FCO','2016-01-01'),(6,4,'FCT','2016-02-02')`);
  await m.db.query(`INSERT INTO client_guardians VALUES(5,8,1,'{}'),(6,8,1,'{}')`);
  await m.db.query(`INSERT INTO intake_links VALUES(20,'synthetic-packet',1,1,'counseling','agency',4)`);
  await m.db.query(`INSERT INTO co_guardian_invites VALUES(35,4,8,'testing+recipient@example.com','Fictional','Recipient','pending','school','synthetic-packet','historical-hash','2027-01-01')`);
  await m.db.query(`INSERT INTO co_guardian_invite_clients VALUES(35,5),(35,6)`);
  await m.db.query(`INSERT INTO co_guardian_invite_deliveries(id,invite_id,recipient_email,delivery_kind,delivery_status,failure_kind,created_at) VALUES(1,35,'testing+recipient@example.com','invitation','failed','send_failed','2026-01-01')`);
  m.email.mockReset().mockResolvedValue({sent:true,communicationId:100});m.access.mockReset().mockResolvedValue({ok:true});
 });
 afterAll(async()=>{if(fixture)await fixture.close();});
 const preview=()=>previewStaffGuardianRetries({actorUserId:501,agencyId:4,clientIds:[5,6]});
 const send=recipient=>sendStaffSelectedGuardianRetry({actorUserId:501,agencyId:4,inviteId:35,clientIds:[5,6],snapshot:recipient.snapshot});
 it('previews the existing failed invitation and sends only that recipient, preserving historical failures and ownership',async()=>{
  const selected=(await preview()).recipients[0];expect(selected).toMatchObject({kind:'own_enrollment',invitationId:35,clients:[{clientId:5,label:'FCO'},{clientId:6,label:'FCT'}]});
  const result=await send(selected);expect(result).toMatchObject({deliveryStatus:'sent',invitationId:35,communicationId:100});
  const [history]=await m.db.query('SELECT id,delivery_status FROM co_guardian_invite_deliveries WHERE invite_id=35 ORDER BY id');
  expect(history).toEqual([{id:1,delivery_status:'failed'},{id:result.deliveryAttemptId,delivery_status:'sent'}]);
  const [[invite]]=await m.db.query('SELECT invited_by_user_id,invited_email FROM co_guardian_invites WHERE id=35');expect(invite.invited_by_user_id).toBe(8);expect(invite.invited_email).toBe(selected.email);
  expect((await preview()).recipients).toEqual([]);await expect(send(selected)).rejects.toHaveProperty('status',409);expect(m.email).toHaveBeenCalledOnce();
 });
 it('requires every bound child and refuses an invitation containing another agency child',async()=>{
  expect((await previewStaffGuardianRetries({actorUserId:501,agencyId:4,clientIds:[5]})).recipients).toEqual([]);
  const selected=(await preview()).recipients[0];await m.db.query('UPDATE clients SET agency_id=99 WHERE id=6');
  await expect(send(selected)).rejects.toHaveProperty('status',409);expect(m.email).not.toHaveBeenCalled();
 });
 it.each(['sent','pending','sending','unknown'])('refuses stale retry after actual latest delivery becomes %s',async status=>{
  const selected=(await preview()).recipients[0];await m.db.execute('UPDATE co_guardian_invite_deliveries SET delivery_status=? WHERE id=1',[status]);
  expect((await preview()).recipients).toEqual([]);await expect(send(selected)).rejects.toMatchObject({status:409,code:'PORTAL_INVITATION_PREVIEW_CHANGED'});expect(m.email).not.toHaveBeenCalled();
 });
 it('rechecks requester access and a new delivery attempt after preview',async()=>{
  const selected=(await preview()).recipients[0];await m.db.query(`UPDATE client_guardians SET permissions_json='{"noContact":true}' WHERE client_id=6`);
  await expect(send(selected)).rejects.toHaveProperty('status',403);
  await m.db.query(`UPDATE client_guardians SET permissions_json='{}';`);
  await m.db.query(`INSERT INTO co_guardian_invite_deliveries(invite_id,recipient_email,delivery_status,created_at) VALUES(35,'testing+recipient@example.com','failed','2026-01-02')`);
  await expect(send(selected)).rejects.toMatchObject({status:409,code:'PORTAL_INVITATION_PREVIEW_CHANGED'});expect(m.email).not.toHaveBeenCalled();
 });
 it('holds the invitation lock through transport so two concurrent staff sends cannot duplicate delivery',async()=>{
  const selected=(await preview()).recipients[0];let entered,release;
  const atTransport=new Promise(resolve=>{entered=resolve;});const held=new Promise(resolve=>{release=resolve;});
  m.email.mockImplementation(async()=>{entered();await held;return {sent:true,communicationId:100};});
  const first=send(selected);
  try{await atTransport;await expect(send(selected)).rejects.toHaveProperty('status',409);}finally{release();}
  expect((await first).deliveryStatus).toBe('sent');expect(m.email).toHaveBeenCalledOnce();
  const [[count]]=await m.db.query('SELECT COUNT(*) AS n FROM co_guardian_invite_deliveries WHERE invite_id=35');expect(Number(count.n)).toBe(2);
 });
 it('rechecks a target account suspension and explicit child revocation both in preview and inside the send lock',async()=>{
  const selected=(await preview()).recipients[0];
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+recipient@example.com',1,'ACTIVE')`);
  await m.db.query(`INSERT INTO client_guardians VALUES(5,10,1,'{"noView":true,"noViewOtherGuardian":true}'),(6,10,1,'{"noView":true,"noViewOtherGuardian":true}')`);
  expect((await preview()).recipients).toHaveLength(1);
  for(const mutation of ["UPDATE users SET is_active=0 WHERE id=10", "UPDATE users SET status='SUSPENDED' WHERE id=10",
    'UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=10 AND client_id=6',
    `UPDATE client_guardians SET permissions_json='{"noContact":true}' WHERE guardian_user_id=10 AND client_id=6`,
    `UPDATE client_guardians SET permissions_json='{"revoked":true}' WHERE guardian_user_id=10 AND client_id=6`]){
   await m.db.query(mutation);expect((await preview()).recipients).toEqual([]);await expect(send(selected)).rejects.toHaveProperty('status',403);
   await m.db.query("UPDATE users SET is_active=1,status='ACTIVE' WHERE id=10");
   await m.db.query(`UPDATE client_guardians SET access_enabled=1,permissions_json='{"noView":true,"noViewOtherGuardian":true}' WHERE guardian_user_id=10`);
  }
  expect(m.email).not.toHaveBeenCalled();
 });
 it('permits own enrollment with expected no-view privacy while keeping those target restrictions intact',async()=>{
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+recipient@example.com',1,'ACTIVE')`);
  await m.db.query(`INSERT INTO client_guardians VALUES(5,10,1,'{"noView":true,"noViewOtherGuardian":true,"coGuardianInviteRestricted":true,"coGuardianInviteId":35}'),(6,10,1,'{"noView":true,"noViewOtherGuardian":true,"coGuardianInviteRestricted":true,"coGuardianInviteId":35}')`);
  const selected=(await preview()).recipients[0];expect((await send(selected)).deliveryStatus).toBe('sent');
  const [links]=await m.db.query('SELECT permissions_json,access_enabled FROM client_guardians WHERE guardian_user_id=10');
  expect(links.every(link=>link.access_enabled===1&&link.permissions_json.noView&&link.permissions_json.noViewOtherGuardian)).toBe(true);
 });
 it('permits a corrected address after the normal old privacy-only link was disabled without reactivating that link',async()=>{
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+old-address@example.com',1,'ACTIVE')`);
  await m.db.query(`INSERT INTO client_guardians VALUES(5,10,0,'{"noView":true,"coGuardianInviteRestricted":true,"coGuardianInviteId":35}'),(6,10,0,'{"noView":true,"coGuardianInviteRestricted":true,"coGuardianInviteId":35}')`);
  expect((await send((await preview()).recipients[0])).deliveryStatus).toBe('sent');
  const [links]=await m.db.query('SELECT access_enabled FROM client_guardians WHERE guardian_user_id=10');expect(links.every(row=>row.access_enabled===0)).toBe(true);
 });
 it('cannot use a corrected new email to bypass an explicit restriction on this invitation’s original target',async()=>{
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+old-address@example.com',1,'ACTIVE')`);
  const privacy={noView:true,coGuardianInviteRestricted:true,coGuardianInviteId:35};
  await m.db.execute('INSERT INTO client_guardians VALUES(5,10,0,?),(6,10,0,?)',[JSON.stringify(privacy),JSON.stringify(privacy)]);
  const selected=(await preview()).recipients[0];
  for(const flag of ['noContact','contactRestricted','revoked','relationshipRevoked']){
   await m.db.execute('UPDATE client_guardians SET permissions_json=? WHERE guardian_user_id=10 AND client_id=6',[JSON.stringify({...privacy,[flag]:true})]);
   expect((await preview()).recipients).toEqual([]);await expect(send(selected)).rejects.toHaveProperty('status',403);
  }
  await m.db.execute('UPDATE client_guardians SET permissions_json=? WHERE guardian_user_id=10',[JSON.stringify(privacy)]);
  await m.db.query('UPDATE users SET is_active=0 WHERE id=10');expect((await preview()).recipients).toEqual([]);await expect(send(selected)).rejects.toHaveProperty('status',403);
  expect(m.email).not.toHaveBeenCalled();
 });
 it('allows the submitting parent to correct a failed address through the same safe delivery path',async()=>{
  const result=await resendGuardianInvitation({userId:8,agencyId:4,inviteId:35,email:'testing+corrected@example.com'});
  expect(result).toMatchObject({deliveryStatus:'sent',email:'testing+corrected@example.com'});
  expect(m.email).toHaveBeenCalledOnce();
 });
 it('prevents parent correction from bypassing current target no-contact or disabled access before any token mutation',async()=>{
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+recipient@example.com',1,'ACTIVE')`);
  await m.db.query(`INSERT INTO client_guardians VALUES(5,10,1,'{"noContact":true,"coGuardianInviteId":35,"coGuardianInviteRestricted":true}')`);
  const retry=()=>resendGuardianInvitation({userId:8,agencyId:4,inviteId:35,email:'testing+corrected@example.com'});
  await expect(retry()).rejects.toHaveProperty('status',403);
  await m.db.query(`UPDATE client_guardians SET access_enabled=0,permissions_json='{"coGuardianInviteId":35,"coGuardianInviteRestricted":true}' WHERE guardian_user_id=10`);
  await expect(retry()).rejects.toHaveProperty('status',403);
  const [[saved]]=await m.db.query('SELECT invited_email,token_hash FROM co_guardian_invites WHERE id=35');
  expect(saved).toEqual({invited_email:'testing+recipient@example.com',token_hash:'historical-hash'});expect(m.email).not.toHaveBeenCalled();
 });
 it('also checks a prospective corrected address’s existing target restrictions',async()=>{
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+corrected@example.com',1,'SUSPENDED')`);
  await expect(resendGuardianInvitation({userId:8,agencyId:4,inviteId:35,email:'testing+corrected@example.com'})).rejects.toHaveProperty('status',403);expect(m.email).not.toHaveBeenCalled();
 });
 it('does not let a staff reminder bypass a target revocation',async()=>{
  await m.db.query("UPDATE users SET role='super_admin' WHERE id=501");
  await m.db.query(`INSERT INTO users(id,role,first_name,last_name,email,is_active,status) VALUES(10,'client_guardian','Fictional','Recipient','testing+recipient@example.com',1,'ACTIVE')`);
  await m.db.query(`INSERT INTO client_guardians VALUES(5,10,1,'{"revoked":true,"coGuardianInviteId":35}')`);
  await expect(sendStaffGuardianInvitationReminder({actorUserId:501,agencyId:4,inviteId:35})).rejects.toHaveProperty('status',403);expect(m.email).not.toHaveBeenCalled();
 });
});
