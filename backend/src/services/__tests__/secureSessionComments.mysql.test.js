import fs from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { createSecureSessionComments } from '../secureSessionComments.service.js';
import { createFamilySharedConversations, familySharedConversations, assertReviewedFamilyRecipients } from '../familySharedConversations.service.js';
import { createSharedFamilyNotice } from '../sharedFamilyNotice.service.js';
import { describeFamilySecureThread } from '../familySecureMessageAccess.service.js';

describe.skipIf(!recoveryMysqlEnabled)('secure comments and immutable shared audiences — real isolated MySQL',()=>{
  let fixture,db,comments,shared,notice,testNow;
  const clock=()=>new Date(testNow);
  const scopes=JSON.stringify(['clinical_messages']);
  beforeAll(async()=>{
    fixture=await isolatedWorkflowMysql('secure_session_comments');db=fixture.db;
    const ddl=[
      `CREATE TABLE users (id INT PRIMARY KEY,role VARCHAR(64),first_name VARCHAR(80),last_name VARCHAR(80),email VARCHAR(180),personal_email VARCHAR(180),work_email VARCHAR(180),phone_number VARCHAR(40),personal_phone VARCHAR(40),work_phone VARCHAR(40),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,status VARCHAR(40) DEFAULT 'ACTIVE',status_expires_at DATETIME NULL,terminated_at DATETIME NULL,timezone VARCHAR(80) DEFAULT 'America/Denver')`,
      `CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80),slug VARCHAR(80),is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0)`,
      `CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT DEFAULT 1)`,
      `CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT NULL,provider_id INT,client_type VARCHAR(40),guardian_portal_enabled TINYINT DEFAULT 1,full_name VARCHAR(180),initials VARCHAR(20),date_of_birth DATE)`,
      `CREATE TABLE client_agency_assignments(client_id INT,agency_id INT,is_active TINYINT)`,
      `CREATE TABLE client_provider_assignments(id INT PRIMARY KEY AUTO_INCREMENT,client_id INT,provider_user_id INT,organization_id INT,is_active TINYINT DEFAULT 1)`,
      `CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,relationship_type VARCHAR(30),access_enabled TINYINT DEFAULT 1,permissions_json JSON,PRIMARY KEY(client_id,guardian_user_id))`,
      `CREATE TABLE guardian_clinical_grants(agency_id INT,client_id INT,guardian_user_id INT,access_level VARCHAR(30),medical_rights_verified TINYINT,consent_basis VARCHAR(40),scopes_json JSON,review_due_date DATE,revoked_at DATETIME NULL)`,
      `CREATE TABLE client_service_enrollments(id INT PRIMARY KEY AUTO_INCREMENT,client_id INT,agency_id INT,service_kind VARCHAR(30),provider_user_id INT,organization_id INT,label VARCHAR(80),is_active TINYINT DEFAULT 1)`,
      `CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,start_at DATETIME,end_at DATETIME,status VARCHAR(40),source_timezone VARCHAR(80))`,
      `CREATE TABLE appointment_participants(id INT PRIMARY KEY AUTO_INCREMENT,appointment_id INT,client_id INT)`,
      `CREATE TABLE user_preferences(user_id INT PRIMARY KEY,timezone VARCHAR(80),daily_digest_time VARCHAR(12))`,
      `CREATE TABLE chat_threads(id INT PRIMARY KEY AUTO_INCREMENT,agency_id INT,client_id INT NULL,thread_type VARCHAR(50),message_channel VARCHAR(20),service_enrollment_id INT DEFAULT 0,name VARCHAR(100))`,
      `CREATE TABLE chat_thread_participants(thread_id INT,user_id INT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(thread_id,user_id))`,
      `CREATE TABLE secure_message_events(id BIGINT PRIMARY KEY AUTO_INCREMENT,agency_id INT,thread_id INT,message_id INT NULL,notification_id INT NULL,actor_user_id INT,event_type VARCHAR(48),ip_hash CHAR(64),user_agent VARCHAR(512))`
    ];
    for(const sql of ddl)await db.query(sql);
    for(const migration of ['1792_secure_session_comments.sql','1793_secure_family_communication_acknowledgments.sql','1794_family_shared_conversations.sql']){
      let source;
      try{source=await fs.readFile(new URL(`../../../../database/migrations/${migration}`,import.meta.url),'utf8');}
      catch(error){if(migration.startsWith('1793_')){
        const files=await fs.readdir(new URL('../../../../database/migrations/',import.meta.url));
        const actual=files.find(f=>f.startsWith('1793_'));if(!actual)throw error;
        source=await fs.readFile(new URL(`../../../../database/migrations/${actual}`,import.meta.url),'utf8');
      }else throw error;}
      for(const sql of source.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.query(sql);
    }
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,28).toString('base64'));
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_ID','qa-mysql-key');
    comments=createSecureSessionComments({db,clock});shared=createFamilySharedConversations({db});notice=createSharedFamilyNotice({db,audit:()=>{}});
  },30000);
  beforeEach(async()=>{
    for(const table of ['secure_session_comments','secure_session_comment_revisions','secure_session_comment_recipients','secure_session_comment_deliveries','secure_session_comment_audit','secure_session_comment_attention','secure_family_communication_acknowledgments','family_shared_conversations','secure_message_events','chat_thread_participants','chat_threads','users','agencies','user_agencies','clients','client_guardians','guardian_clinical_grants','client_provider_assignments','client_service_enrollments','appointments','appointment_participants','user_preferences'])await db.query(`DELETE FROM ${table}`);
    await db.query("INSERT INTO agencies(id,name,slug)VALUES(450,'Fictional QA','fictional-qa'),(999,'Other QA','other-qa')");
    await db.query(`INSERT INTO users(id,role,first_name,last_name,email) VALUES
      (1,'provider','Provider','QA','testing+provider@itsco.health'),(2,'client_guardian','Parent','One','testing+parent1@itsco.health'),
      (3,'client_guardian','Parent','Two','testing+parent2@itsco.health'),(4,'support','Support','QA','testing+support@itsco.health'),
      (5,'client_guardian','Future','Guardian','testing+future@itsco.health'),(7,'client_guardian','Other','Child','testing+other@itsco.health')`);
    await db.query('INSERT INTO user_agencies(user_id,agency_id)VALUES(1,450),(4,450)');
    await db.query("INSERT INTO clients(id,agency_id,provider_id,client_type,full_name,initials,date_of_birth)VALUES(10,450,1,'clinical','Child A QA','CAQ','2018-01-01'),(11,450,1,'clinical','Child B QA','CBQ','2018-02-01')");
    await db.query('INSERT INTO client_provider_assignments(client_id,provider_user_id)VALUES(10,1),(11,1)');
    await db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,permissions_json)VALUES(10,2,'guardian','{}'),(10,3,'guardian','{}'),(11,7,'guardian','{}')");
    for(const [clientId,userId]of [[10,2],[10,3],[11,7]])await db.execute("INSERT INTO guardian_clinical_grants(agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,review_due_date)VALUES(450,?,?,'full',1,'legal_representative',?,'2030-01-01')",[clientId,userId,scopes]);
    // Use one frozen, whole-second instant for both the appointment and service
    // clock. Adding an hour to the real clock moves this fixture into tomorrow
    // during Denver's last hour of the day; fractional DATETIME rounding could
    // similarly cross midnight without truncation.
    testNow=new Date(Math.floor(Date.now()/1000)*1000);
    await db.execute("INSERT INTO appointments(id,agency_id,provider_user_id,start_at,end_at,status,source_timezone)VALUES(101,450,1,?,?,'scheduled','America/Denver')",[testNow,new Date(testNow.getTime()+60*60*1000)]);
    await db.query('INSERT INTO appointment_participants(appointment_id,client_id)VALUES(101,10),(101,11)');
  });
  afterAll(async()=>{vi.unstubAllEnvs();await fixture?.close();});
  const post=(extra={})=>comments.create({user:{id:1},appointmentId:101,clientId:10,body:'Synthetic encrypted family update',recipientUserIds:[2,3],requestId:'mysql_request_unique_001',...extra});
  async function acknowledge(...users){for(const userId of users)await notice.acknowledge({userId,agencyId:450,version:'2026-11-11',acknowledged:true});}

  it('applies real migrations, enforces first-send notice, encrypts persisted data and preserves one send across a concurrent retry',async()=>{
    await expect(post()).rejects.toMatchObject({status:409,code:'FAMILY_SHARING_ACK_REQUIRED'});
    expect((await db.query('SELECT COUNT(*) AS n FROM secure_session_comments'))[0][0].n).toBe(0);
    await acknowledge(1);
    const results=await Promise.all([post(),post()]);expect(new Set(results.map(r=>r.comment.id)).size).toBe(1);
    const [[stored]]=await db.query('SELECT * FROM secure_session_comments');expect(stored.body_ciphertext).not.toContain('Synthetic encrypted');expect(stored.encryption_key_id).toBe('qa-mysql-key');
    const [[count]]=await db.query('SELECT COUNT(*) AS n FROM secure_session_comment_deliveries');expect(count.n).toBe(2);
    const view=await comments.thread({user:{id:2},appointmentId:101,clientId:10});expect(view.appointment.clientName).toBe('Child A QA');expect(view.comments[0].body).toBe('Synthetic encrypted family update');expect(view.comments[0].readAt).toBeNull();
    await comments.read({user:{id:2},appointmentId:101,clientId:10,commentIds:[stored.id],commentVersions:{[stored.id]:1}});
    const [[read]]=await db.execute('SELECT read_at FROM secure_session_comment_recipients WHERE comment_id=? AND user_id=2',[stored.id]);expect(read.read_at).not.toBeNull();
  });
  it('isolates the two children in a group, current grants and new membership; history and worker summaries stay metadata-only',async()=>{
    await acknowledge(1);const {comment}=await post();
    await expect(comments.thread({user:{id:7},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
    expect((await comments.thread({user:{id:7},appointmentId:101,clientId:11})).comments).toEqual([]);
    await expect(comments.read({user:{id:7},appointmentId:101,clientId:11,commentIds:[comment.id],commentVersions:{[comment.id]:1}})).rejects.toMatchObject({status:403});
    await db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,permissions_json)VALUES(10,5,'guardian','{}')");
    await db.execute("INSERT INTO guardian_clinical_grants(agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,review_due_date)VALUES(450,10,5,'full',1,'legal_representative',?,'2030-01-01')",[scopes]);
    expect((await comments.thread({user:{id:5},appointmentId:101,clientId:10})).comments).toEqual([]);
    expect((await comments.history({user:{id:2},clientId:10})).comments[0].body).toBeNull();
    const decrypt=vi.fn(()=>{throw new Error('A metadata operation must not decrypt');});
    const metadata=createSecureSessionComments({db,decrypt,clock});expect((await metadata.today({user:{id:2},includeBodies:false,auditView:false})).unreadCount).toBe(1);expect(decrypt).not.toHaveBeenCalled();
    await db.query('UPDATE guardian_clinical_grants SET revoked_at=UTC_TIMESTAMP() WHERE guardian_user_id=2');await expect(comments.thread({user:{id:2},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
    await expect(comments.thread({user:{id:4},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
  });
  it('allows one 250-code-point comment per author and retains encrypted revisions without exposing old text to a newly eligible parent',async()=>{
    await acknowledge(1,2);
    const first=await post({body:'🙂'.repeat(250)});
    expect(Array.from(first.comment.body)).toHaveLength(250);
    await expect(post({requestId:'different_create_request_001'})).rejects.toMatchObject({status:409,code:'SESSION_COMMENT_EXISTS'});
    const parent=await comments.create({user:{id:2},appointmentId:101,clientId:10,body:'Parent update',recipientUserIds:[1,3],requestId:'parent_create_request_001'});
    expect(parent.comment.version).toBe(1);
    const authorView=await comments.thread({user:{id:1},appointmentId:101,clientId:10,before:first.comment.id});expect(authorView.ownComment.id).toBe(first.comment.id);
    await db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,permissions_json)VALUES(10,5,'guardian','{}')");
    await db.execute("INSERT INTO guardian_clinical_grants(agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,review_due_date)VALUES(450,10,5,'full',1,'legal_representative',?,'2030-01-01')",[scopes]);
    expect((await comments.thread({user:{id:5},appointmentId:101,clientId:10})).comments).toEqual([]);
    const args={user:{id:1},appointmentId:101,clientId:10,commentId:first.comment.id,body:'Only the updated version is shared now.',expectedVersion:1,recipientUserIds:[2,3,5],requestId:'comment_edit_request_001'};
    const edited=await comments.edit(args);expect(edited.comment).toMatchObject({id:first.comment.id,version:2,body:args.body});expect(edited.comment.editedAt).not.toBeNull();expect(edited.comment.attentionToken).toBeGreaterThan(first.comment.attentionToken);
    expect((await comments.edit(args)).comment.reused).toBe(true);
    const visible=(await comments.thread({user:{id:5},appointmentId:101,clientId:10})).comments;expect(visible).toHaveLength(1);expect(visible[0].body).toBe(args.body);expect(JSON.stringify(visible)).not.toContain('🙂');
    const [[storedCount]]=await db.execute('SELECT COUNT(*) AS n FROM secure_session_comment_revisions WHERE comment_id=?',[first.comment.id]);expect(storedCount.n).toBe(2);
    const [archive]=await db.execute('SELECT body_ciphertext,audience_json FROM secure_session_comment_revisions WHERE comment_id=? ORDER BY revision',[first.comment.id]);expect(archive[0].body_ciphertext).not.toContain('🙂');expect(JSON.parse(typeof archive[0].audience_json==='string'?archive[0].audience_json:JSON.stringify(archive[0].audience_json))).not.toContain(5);
    const [[delivered]]=await db.execute('SELECT COUNT(*) AS n FROM secure_session_comment_deliveries WHERE comment_id=? AND revision=2',[first.comment.id]);expect(delivered.n).toBe(3);
    await expect(comments.edit({...args,user:{id:2}})).rejects.toMatchObject({status:403});
  });
  it('detects concurrent edits and stale read acknowledgments, leaves the updated revision unread and skips outdated deliveries',async()=>{
    await acknowledge(1);const first=await post();
    const edit={user:{id:1},appointmentId:101,clientId:10,commentId:first.comment.id,body:'First saved edit',expectedVersion:1,recipientUserIds:[2,3],requestId:'concurrent_edit_request_001'};
    const results=await Promise.allSettled([comments.edit(edit),comments.edit({...edit,body:'Other browser edit',requestId:'concurrent_edit_request_002'})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected').reason).toMatchObject({status:409,code:'SESSION_COMMENT_VERSION_CONFLICT'});
    await expect(comments.read({user:{id:2},appointmentId:101,clientId:10,commentIds:[first.comment.id],commentVersions:{[first.comment.id]:1}})).rejects.toMatchObject({status:409,code:'SESSION_COMMENT_VERSION_CONFLICT'});
    const [[recipient]]=await db.execute('SELECT read_at FROM secure_session_comment_recipients WHERE comment_id=? AND revision=2 AND user_id=2',[first.comment.id]);expect(recipient.read_at).toBeNull();
    const [[oldDelivery]]=await db.execute('SELECT * FROM secure_session_comment_deliveries WHERE comment_id=? AND revision=1 AND recipient_user_id=2',[first.comment.id]);await expect(comments.deliveryAccess(oldDelivery)).rejects.toMatchObject({status:403});
    const [[newDelivery]]=await db.execute('SELECT * FROM secure_session_comment_deliveries WHERE comment_id=? AND revision=2 AND recipient_user_id=2',[first.comment.id]);expect((await comments.deliveryAccess(newDelivery)).current.id).toBe(2);
    await comments.read({user:{id:2},appointmentId:101,clientId:10,commentIds:[first.comment.id],commentVersions:{[first.comment.id]:2}});
    expect((await comments.thread({user:{id:2},appointmentId:101,clientId:10})).comments[0].readAt).not.toBeNull();
  });
  it('denies archived, terminated, expired and pending relationships; completed private-answer flags do not waive clinical permission',async()=>{
    await acknowledge(1);await db.query('UPDATE users SET is_archived=1 WHERE id=3');
    const recipients=await comments.thread({user:{id:1},appointmentId:101,clientId:10});expect(recipients.recipients.map(r=>r.id)).toEqual([2]);
    await expect(post()).rejects.toMatchObject({status:409,code:'SESSION_COMMENT_AUDIENCE_CHANGED'});
    const first=await post({recipientUserIds:[2]});
    await db.query("UPDATE client_guardians SET permissions_json='{\"noViewOtherGuardian\":true}' WHERE guardian_user_id=2");await expect(comments.thread({user:{id:2},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
    await db.query("UPDATE client_guardians SET permissions_json='{\"noViewOtherGuardian\":false,\"hideOtherGuardianAnswers\":true}' WHERE guardian_user_id=2");expect((await comments.thread({user:{id:2},appointmentId:101,clientId:10})).comments[0].id).toBe(first.comment.id);
    await db.query('UPDATE clients SET guardian_portal_enabled=0 WHERE id=10');await expect(comments.thread({user:{id:2},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});await db.query('UPDATE clients SET guardian_portal_enabled=1 WHERE id=10');
    await db.query('UPDATE users SET terminated_at=UTC_TIMESTAMP() WHERE id=2');await expect(comments.thread({user:{id:2},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
    await db.query('UPDATE users SET terminated_at=NULL,status_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=2');await expect(comments.thread({user:{id:2},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
    await db.query('UPDATE users SET is_archived=1 WHERE id=1');await expect(comments.thread({user:{id:1},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
    await db.query('UPDATE users SET is_archived=0 WHERE id=1');await db.query('UPDATE client_provider_assignments SET is_active=0 WHERE client_id=10 AND provider_user_id=1');
    await expect(comments.thread({user:{id:1},appointmentId:101,clientId:10})).rejects.toMatchObject({status:403});
  });
  it('starts a new immutable shared thread for an audience change, leaves old private membership intact, and requires a real reviewed full recipient list',async()=>{
    await db.query("INSERT INTO chat_threads(id,agency_id,thread_type,message_channel,name)VALUES(50,450,'client_secure','secure','Previous private thread')");
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id)VALUES(50,1),(50,2)');
    const first=await shared.open({userId:2,clientId:10,agencyId:450});expect(first.audienceUserIds).toEqual([1,2,3]);
    expect((await db.query('SELECT user_id FROM chat_thread_participants WHERE thread_id=50 ORDER BY user_id'))[0].map(r=>r.user_id)).toEqual([1,2]);
    expect((await shared.open({userId:1,clientId:10,agencyId:450})).threadId).toBe(first.threadId);
    const current=await shared.requireAccess(2,first.threadId,{forSend:true});
    expect(()=>assertReviewedFamilyRecipients({shared:current,userId:2,expectedRecipientUserIds:[1]})).toThrow();
    expect(()=>assertReviewedFamilyRecipients({shared:current,userId:2,expectedRecipientUserIds:[1,3]})).not.toThrow();
    await db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,permissions_json)VALUES(10,5,'guardian','{}')");
    await db.execute("INSERT INTO guardian_clinical_grants(agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,review_due_date)VALUES(450,10,5,'full',1,'legal_representative',?,'2030-01-01')",[scopes]);
    await expect(shared.requireAccess(5,first.threadId)).rejects.toMatchObject({status:403});
    await expect(shared.requireAccess(2,first.threadId,{forSend:true})).rejects.toMatchObject({status:409,code:'FAMILY_SHARED_AUDIENCE_CHANGED'});
    const next=await shared.open({userId:2,clientId:10,agencyId:450});expect(next.threadId).not.toBe(first.threadId);expect(next.audienceUserIds).toEqual([1,2,3,5]);
    expect((await shared.requireAccess(2,first.threadId)).readOnly).toBe(true);
    await db.query('UPDATE users SET is_archived=1 WHERE id=1');await expect(shared.requireAccess(1,next.threadId)).rejects.toMatchObject({status:403});
    expect((await shared.requireAccess(2,next.threadId)).readOnly).toBe(true);
    // Metadata is shared by normal chat and native mobile. Its read path must
    // not call send authorization after the provider leaves the practice.
    const metadataAccess=vi.spyOn(familySharedConversations,'requireAccess').mockImplementation((userId,threadId,options)=>shared.requireAccess(userId,threadId,options));
    try {
      const metadata=await describeFamilySecureThread(2,next.threadId,db);
      expect(metadata).toMatchObject({clientId:10,agencyId:450,readOnly:true,sharingPolicy:'all_eligible_family'});
      expect(metadata.participants.map(p=>p.id)).toEqual([2,3,5]);
      expect(metadataAccess.mock.calls.every(([, , options])=>!options?.forSend)).toBe(true);
      await expect(describeFamilySecureThread(5,first.threadId,db)).rejects.toMatchObject({status:403});
      await expect(shared.requireAccess(2,next.threadId,{forSend:true})).rejects.toMatchObject({status:409});
    } finally { metadataAccess.mockRestore(); }

  });
});
