import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import UserCommunication from '../../models/UserCommunication.model.js';
import {encryptChatText} from '../chatEncryption.service.js';
import {readFileSync} from 'node:fs';
import {resolveEmailClientFiling,autoFileEmailMessage,linkConversationClients,clientEmailThread,reconcileClientEmailFiling} from '../clientConversationRecord.service.js';
import {listContactDocumentation,contactDocumentationDetail,saveContactDocumentation} from '../contactDocumentation.service.js';
const state = vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args)}}));
import {hubClientScope,hubContactScope,scopeHubPeople,canAccessHubClient,ownEmailCorrespondent} from '../hubPeopleAccess.service.js';
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
const dbName=`hub_scope_test_${process.pid}`;
describe.skipIf(!socketPath)('messaging access boundaries (isolated MySQL)',()=>{
  beforeAll(async()=>{
    state.db=await mysql.createConnection({socketPath,user:'root'});
    await state.db.query(`CREATE DATABASE ${dbName}`); await state.db.query(`USE ${dbName}`);
    for(const sql of [
      'CREATE TABLE users (id INT PRIMARY KEY,role VARCHAR(40),first_name VARCHAR(40),last_name VARCHAR(40),status VARCHAR(40),is_archived INT DEFAULT 0)',
      'CREATE TABLE user_agencies (user_id INT,agency_id INT)',
      'CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT,provider_id INT,full_name VARCHAR(40),initials VARCHAR(10),client_type VARCHAR(20),client_status_id INT)',
      'CREATE TABLE client_statuses (id INT PRIMARY KEY,status_key VARCHAR(20))',
      'CREATE TABLE client_provider_assignments (client_id INT,provider_user_id INT,is_active INT)',
      'CREATE TABLE supervisor_assignments (supervisor_id INT,supervisee_id INT,agency_id INT)',
      'CREATE TABLE client_guardians (client_id INT,guardian_user_id INT,access_enabled INT)',
      'CREATE TABLE agency_contacts (id INT,agency_id INT,client_id INT,share_with_all INT,created_by_user_id INT,is_active INT)',
      'CREATE TABLE contact_provider_assignments (contact_id INT,provider_user_id INT)',
      'CREATE TABLE communication_conversations (id INT,agency_id INT,channel VARCHAR(20),owner_user_id INT,inbox_id INT)',
      'CREATE TABLE communication_messages (conversation_id INT,author_user_id INT,is_internal_note INT,send_status VARCHAR(20))',
      'CREATE TABLE communication_participants (conversation_id INT,email VARCHAR(100))',
      'CREATE TABLE communication_inboxes (id INT,kind VARCHAR(20),owner_user_id INT)',
      "INSERT INTO users VALUES (1,'provider','Own','Provider','ACTIVE',0),(2,'provider','Sam','Supervisee','ACTIVE',0),(3,'provider','Other','Provider','ACTIVE',0),(4,'provider','Current','Supervisor','ACTIVE',0),(5,'admin','Agency','Admin','ACTIVE',0),(6,'provider','Former','Supervisee','INACTIVE',0),(20,'client_guardian','Shared','Parent','ACTIVE',0)",
      'INSERT INTO user_agencies VALUES (1,2),(2,2),(3,2),(4,2),(5,2)',
      "INSERT INTO clients VALUES (101,2,1,'Own Child','OC',NULL,NULL),(102,2,2,'Supervised Child','SC',NULL,NULL),(103,2,3,'Unrelated Child','UC',NULL,NULL),(104,3,2,'Other Tenant','OT',NULL,NULL),(105,2,NULL,'Secondary Assignment','SA',NULL,NULL),(106,2,NULL,'Inactive Assignment','IA',NULL,NULL),(107,2,6,'Inactive Supervisee','IS',NULL,NULL)",
      'INSERT INTO client_provider_assignments VALUES (105,2,1),(106,2,0)',
      'INSERT INTO supervisor_assignments VALUES (4,2,2),(4,6,2)',
      'INSERT INTO client_guardians VALUES (102,20,1),(103,20,1)',
      'INSERT INTO agency_contacts VALUES (201,2,102,1,3,1),(202,2,103,1,1,1),(203,2,NULL,1,3,1),(204,2,NULL,0,1,1),(205,2,NULL,0,3,1)',
      "INSERT INTO communication_conversations VALUES (301,2,'email',1,401),(302,2,'email',3,402)",
      "INSERT INTO communication_messages VALUES (301,NULL,0,'sent'),(302,NULL,0,'sent')",
      "INSERT INTO communication_participants VALUES (301,'parent@example.com'),(302,'other@example.com')",
      "INSERT INTO communication_inboxes VALUES (401,'personal',1),(402,'personal',3)"
    ]) await state.db.query(sql);
  });
  beforeAll(async()=>{
    process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');
    for(const sql of [
      'ALTER TABLE users ADD email VARCHAR(100), ADD personal_email VARCHAR(100)',
      'ALTER TABLE clients ADD email VARCHAR(100)',
      'ALTER TABLE agency_contacts ADD email VARCHAR(100)',
      'ALTER TABLE communication_conversations ADD subject VARCHAR(100), ADD last_message_at DATETIME',
      "ALTER TABLE communication_messages ADD id INT PRIMARY KEY AUTO_INCREMENT, ADD channel VARCHAR(20) DEFAULT 'email', ADD direction VARCHAR(20), ADD from_json JSON, ADD to_json JSON, ADD cc_json JSON, ADD bcc_json JSON, ADD subject VARCHAR(100), ADD body_text TEXT, ADD body_html TEXT, ADD internet_message_id VARCHAR(100), ADD created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ADD sent_at DATETIME",
      'CREATE TABLE communication_links (conversation_id INT,entity_type VARCHAR(64),entity_id INT,label VARCHAR(255),UNIQUE KEY linked(conversation_id,entity_type,entity_id))',
      'CREATE TABLE guardian_client_threads (client_id INT,agency_id INT,thread_id INT)',
      'CREATE TABLE chat_threads (id INT,name VARCHAR(100))',
      'CREATE TABLE chat_messages (id INT,thread_id INT,created_at DATETIME,sender_user_id INT,body_ciphertext TEXT,body_iv VARCHAR(100),body_auth_tag VARCHAR(100),encryption_key_id VARCHAR(100))',
      'CREATE TABLE chat_thread_participants (thread_id INT,user_id INT)',
      "UPDATE clients SET email='own-child@example.test' WHERE id=101",
      "INSERT INTO users (id,role,email) VALUES (30,'guardian','siblings@example.test')",
      'INSERT INTO client_guardians VALUES (102,30,1),(105,30,1)',
      "INSERT INTO communication_conversations (id,agency_id,channel,owner_user_id,subject) VALUES (303,2,'email',4,'Both children'),(304,2,'email',1,'One child')",
      `INSERT INTO communication_messages (id,conversation_id,channel,direction,from_json,to_json,body_text,send_status) VALUES
        (401,303,'email','outbound',JSON_OBJECT('email','supervisor@example.test'),JSON_ARRAY(JSON_OBJECT('email','siblings@example.test')),'Check in','sent'),
        (402,303,'email','inbound',JSON_OBJECT('email','siblings@example.test'),JSON_ARRAY(JSON_OBJECT('email','supervisor@example.test')),'Parent reply','sent'),
        (403,304,'email','inbound',JSON_OBJECT('email','own-child@example.test'),JSON_ARRAY(JSON_OBJECT('email','provider@example.test')),'Question','sent')`,
      "INSERT INTO communication_participants VALUES (303,'siblings@example.test')"
    ])await state.db.query(sql);
    const migration=readFileSync(new URL('../../../../database/migrations/1522_contact_documentation_reviews.sql',import.meta.url),'utf8');
    for(const statement of migration.split(';').filter(x=>x.trim()))await state.db.query(statement);
  });
  afterAll(async()=>{if(state.db){await state.db.query(`DROP DATABASE IF EXISTS ${dbName}`);await state.db.end();}});
  const accessible=async userId=>{const scope=hubClientScope(userId);const [rows]=await state.db.execute(`SELECT c.id FROM clients c WHERE ${scope.sql} ORDER BY c.id`,scope.params);return rows.map(r=>r.id);};
  it('limits a provider to assigned clients even with agency membership',async()=>{expect(await accessible(1)).toEqual([101]);});
  it('includes a supervisor’s current supervisees and secondary assignments, excluding other tenants and inactive assignments',async()=>{expect(await accessible(4)).toEqual([102,105]);});
  it('preserves admin agency-wide access without giving access to other tenants',async()=>{expect(await accessible(5)).toEqual([101,102,103,105,106,107]);});
  it('immediately removes supervision access after an assignment is removed',async()=>{
    await state.db.query('DELETE FROM supervisor_assignments WHERE supervisor_id=4 AND supervisee_id=2');
    try{expect(await accessible(4)).toEqual([]);}finally{await state.db.query('INSERT INTO supervisor_assignments VALUES (4,2,2)');}
  });
  it('does not let shared/owned contacts bypass client assignment restrictions',async()=>{
    const scope=hubContactScope(1);const [rows]=await state.db.execute(`SELECT ac.id FROM agency_contacts ac WHERE ${scope.sql} ORDER BY ac.id`,scope.params);
    expect(rows.map(r=>r.id)).toEqual([203,204]);
  });
  it('labels supervisees’ parents and hides their unrelated children',async()=>{
    const result=await scopeHubPeople([{agencyId:2,userId:20,kinds:['guardian'],clientId:103,displayName:'Shared Parent',relationshipMeta:'Guardian of Unrelated Child'}],4);
    expect(result).toHaveLength(1);expect(result[0]).toMatchObject({clientId:102,guardianClientNames:['Supervised Child'],accessLabel:'Supervisee’s client — Sam Supervisee'});
    expect(result[0].relationshipMeta).not.toContain('Unrelated Child');
    expect(await scopeHubPeople([{agencyId:2,userId:20,kinds:['guardian'],clientId:103}],1)).toEqual([]);
  });
  it('labels own clients and enforces direct lookup scope',async()=>{
    expect(await canAccessHubClient({userId:1,clientId:102,agencyId:2})).toBe(false);
    expect(await scopeHubPeople([{agencyId:2,clientId:101,kinds:['client'],displayName:'Own Child'}],1)).toMatchObject([{accessLabel:'Your client'}]);
  });
  it('keeps received email replyable without leaking client links or suggesting unrelated people',async()=>{
    const person={agencyId:2,personKey:'user:20@2',userId:20,clientId:103,displayName:'Shared Parent',email:'parent@example.com',kinds:['guardian']};
    expect(await scopeHubPeople([person],1)).toEqual([]);
    expect(await ownEmailCorrespondent(person,1)).toMatchObject({displayName:'Shared Parent',email:'parent@example.com',clientId:null,userId:null,kinds:['external'],directoryRestricted:true});
    expect(await ownEmailCorrespondent({...person,email:'other@example.com'},1)).toBeNull();
    expect(await ownEmailCorrespondent(person,3)).toBeNull();
  });
  it('requires a child choice for siblings, accepts both, and carries the links across replies',async()=>{
    await expect(resolveEmailClientFiling({agencyId:2,userId:4,to:['siblings@example.test']})).rejects.toMatchObject({code:'CLIENT_FILING_CHOICE_REQUIRED',clients:[{id:105},{id:102}]});
    const filing=await resolveEmailClientFiling({agencyId:2,userId:4,to:['siblings@example.test'],clientIds:[102,105]});
    expect(filing.clientIds).toEqual([102,105]);
    await linkConversationClients(303,filing.clientIds);
    await autoFileEmailMessage(402);
    const [links]=await state.db.query("SELECT entity_id FROM communication_links WHERE conversation_id=303 AND entity_type='client' ORDER BY entity_id");
    expect(links.map(r=>r.entity_id)).toEqual([102,105]);
    await expect(resolveEmailClientFiling({agencyId:2,userId:1,to:['siblings@example.test'],clientIds:[102]})).rejects.toMatchObject({status:400});
  });
  it('automatically files a unique client and retries safely without duplicate links',async()=>{
    await autoFileEmailMessage(403);await autoFileEmailMessage(403);
    const [links]=await state.db.query("SELECT entity_id FROM communication_links WHERE conversation_id=304 AND entity_type='client'");
    expect(links).toEqual([{entity_id:101}]);
    await reconcileClientEmailFiling({limit:50});
    expect(await reconcileClientEmailFiling({limit:50})).toBe(0);
  });
  it('has one task for a sibling conversation, preserves purpose, and reopens on a later reply',async()=>{
    let tasks=await listContactDocumentation(4,2);
    expect(tasks).toHaveLength(1);expect(tasks[0]).toMatchObject({source_id:303,needsReview:true,message_count:2});
    let detail=await contactDocumentationDetail(4,2,'email',303);
    expect(detail.clients.map(c=>c.id).sort()).toEqual([102,105]);
    await expect(saveContactDocumentation(4,2,'email',303,{purpose:'',revision:0,reviewedThroughId:402,complete:true})).rejects.toMatchObject({status:400});
    detail=await saveContactDocumentation(4,2,'email',303,{purpose:'Coordinate family appointments',revision:0,reviewedThroughId:402,complete:true});
    expect(detail).toMatchObject({needsReview:false,revision:1});
    await state.db.query("INSERT INTO communication_messages (id,conversation_id,channel,direction,body_text,send_status) VALUES (404,303,'email','inbound','Another reply','sent')");
    tasks=await listContactDocumentation(4,2);
    expect(tasks).toHaveLength(1);expect(tasks[0]).toMatchObject({key:'email:303',needsReview:true,purpose:'Coordinate family appointments',reviewedThroughId:402});
    // Completing an already-open view must not swallow the arriving reply.
    detail=await saveContactDocumentation(4,2,'email',303,{purpose:'Coordinate family appointments',revision:1,reviewedThroughId:402,complete:true});
    expect(detail.needsReview).toBe(true);
    await expect(saveContactDocumentation(4,2,'email',303,{purpose:'Stale tab',revision:1,reviewedThroughId:404,complete:true})).rejects.toMatchObject({status:409});
    for(const childId of [102,105]){
      const thread=await clientEmailThread(childId,303);expect(thread.messages).toHaveLength(3);
      expect(thread.documentation.at(-1).purpose).toBe('Coordinate family appointments');
    }
    const [[stored]]=await state.db.query('SELECT purpose_enc FROM contact_documentation_reviews LIMIT 1');
    expect(stored.purpose_enc).not.toContain('Coordinate family appointments');
    await expect(contactDocumentationDetail(1,2,'email',303)).rejects.toMatchObject({status:404});
    await expect(contactDocumentationDetail(4,9,'email',303)).rejects.toMatchObject({status:404});
  });

  it('tracks secure care-team replies in one task and restricts it to participants with client access',async()=>{
    const encrypted=encryptChatText('Parent care-team update');
    await state.db.query("INSERT INTO chat_threads VALUES (501,'Care team')");
    await state.db.query('INSERT INTO guardian_client_threads VALUES (102,2,501)');
    await state.db.query('INSERT INTO chat_thread_participants VALUES (501,4),(501,30)');
    await state.db.execute('INSERT INTO chat_messages VALUES (601,501,NOW(),30,?,?,?,?)',[encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId]);
    const detail=await contactDocumentationDetail(4,2,'secure',501);
    expect(detail.thread.messages[0].body_text).toBe('Parent care-team update');
    expect(detail.clients.map(c=>c.id)).toEqual([102]);
    await saveContactDocumentation(4,2,'secure',501,{purpose:'Discuss home practice',revision:0,reviewedThroughId:601,complete:true});
    expect((await listContactDocumentation(4,2)).filter(t=>t.source_type==='secure')).toMatchObject([{needsReview:false}]);
    await expect(contactDocumentationDetail(2,2,'secure',501)).rejects.toMatchObject({status:404});
    await state.db.execute('INSERT INTO chat_messages VALUES (602,501,NOW(),30,?,?,?,?)',[encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId]);
    expect((await listContactDocumentation(4,2)).filter(t=>t.source_type==='secure')).toMatchObject([{needsReview:true,purpose:'Discuss home practice'}]);
  });

  it('never puts a sibling’s notification in another child’s communication history',async()=>{
    await state.db.query('ALTER TABLE client_guardians ADD relationship_title VARCHAR(50)');
    await state.db.query('CREATE TABLE agencies (id INT,name VARCHAR(50))');
    await state.db.query(`CREATE TABLE user_communications (id INT,user_id INT,client_id INT,agency_id INT,template_type VARCHAR(50),template_id INT,channel VARCHAR(20),subject VARCHAR(100),recipient_address VARCHAR(100),delivery_status VARCHAR(30),external_message_id VARCHAR(100),sent_at DATETIME,delivered_at DATETIME,opened_at DATETIME,first_clicked_at DATETIME,error_message VARCHAR(100),generated_at DATETIME,generated_by_user_id INT)`);
    await state.db.query("INSERT INTO users (id,role,email) VALUES (31,'guardian','single-parent@example.test')");
    await state.db.query('INSERT INTO client_guardians (client_id,guardian_user_id,access_enabled) VALUES (101,31,1)');
    await state.db.query(`INSERT INTO user_communications (id,user_id,client_id,agency_id,recipient_address) VALUES
      (701,30,102,2,'siblings@example.test'),(702,30,105,2,'siblings@example.test'),(703,30,NULL,2,'siblings@example.test'),
      (704,31,NULL,2,'single-parent@example.test'),(705,31,NULL,9,'single-parent@example.test')`);
    expect((await UserCommunication.listForClient(102)).map(m=>m.id)).toEqual([701]);
    expect((await UserCommunication.listForClient(105)).map(m=>m.id)).toEqual([702]);
    expect((await UserCommunication.listForClient(101)).map(m=>m.id)).toEqual([704]);
  });

});
