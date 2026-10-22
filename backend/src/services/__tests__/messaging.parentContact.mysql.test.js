import {beforeAll,afterAll,it,expect,describe,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:async()=>({execute:(...args)=>state.db.execute(...args),beginTransaction:()=>state.db.beginTransaction(),commit:()=>state.db.commit(),rollback:()=>state.db.rollback(),release:()=>{}})}}));
import {syncEmailParentContact,syncSmsParentContact,syncSecureParentContact} from '../parentContact.service.js';
import {canReadSharedClientConversation} from '../clientConversationRecord.service.js';
import {guardianContactContext} from '../guardianContactContext.service.js';
import ClientNotes from '../../models/ClientNotes.model.js';
import {persistInboundEmail} from '../inboundEmailPersistence.service.js';
import {decryptChatText} from '../chatEncryption.service.js';
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
const dbName=`parent_contact_test_${process.pid}`;
describe.skipIf(!socketPath)('parent contact events in isolated MySQL',()=>{
 beforeAll(async()=>{
  process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');
  state.db=await mysql.createConnection({socketPath,user:'root'});await state.db.query(`CREATE DATABASE ${dbName}`);await state.db.query(`USE ${dbName}`);
  for(const sql of [
   'CREATE TABLE users (id INT PRIMARY KEY,role VARCHAR(40),first_name VARCHAR(40),last_name VARCHAR(40),email VARCHAR(100),personal_email VARCHAR(100),phone_number VARCHAR(40),personal_phone VARCHAR(40),work_phone VARCHAR(40),status VARCHAR(40),is_archived INT DEFAULT 0)',
   'CREATE TABLE agencies (id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(100))',
   'CREATE TABLE user_agencies (user_id INT,agency_id INT)',
   'CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT,provider_id INT,full_name VARCHAR(100),initials VARCHAR(20),parents_contacted_at DATETIME,parents_contacted_successful TINYINT,checklist_updated_at DATETIME,checklist_updated_by_user_id INT)',
   'CREATE TABLE client_provider_assignments (client_id INT,provider_user_id INT,is_active INT)',
   'CREATE TABLE supervisor_assignments (supervisor_id INT,supervisee_id INT,agency_id INT)',
   'CREATE TABLE client_guardians (client_id INT,guardian_user_id INT,relationship_type VARCHAR(30),relationship_title VARCHAR(30))',
   'CREATE TABLE communication_conversations (id INT PRIMARY KEY,agency_id INT,inbox_id INT,status VARCHAR(30),archived_at DATETIME,last_message_preview TEXT,last_message_at DATETIME)',
   'CREATE TABLE communication_inboxes (id INT PRIMARY KEY,agency_id INT)',
   'CREATE TABLE communication_email_receipts (inbox_id INT,delivery_hash VARCHAR(100),message_id INT,UNIQUE KEY receipt(inbox_id,delivery_hash))',
   'CREATE TABLE communication_participants (conversation_id INT,kind VARCHAR(20),email VARCHAR(100),display_name VARCHAR(100),is_primary INT)',
   'CREATE TABLE communication_links (conversation_id INT,entity_type VARCHAR(30),entity_id INT)',
   'CREATE TABLE communication_messages (id INT PRIMARY KEY AUTO_INCREMENT,conversation_id INT,channel VARCHAR(20),direction VARCHAR(20),author_user_id INT,send_status VARCHAR(20),from_json JSON,to_json JSON,cc_json JSON,bcc_json JSON,is_internal_note INT DEFAULT 0,is_auto_reply INT DEFAULT 0,auto_reply_kind VARCHAR(30),subject VARCHAR(100),body_text TEXT,body_html TEXT,internet_message_id VARCHAR(100),in_reply_to VARCHAR(100),references_header TEXT,is_group_email INT DEFAULT 0,sent_at DATETIME,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
   'CREATE TABLE client_notes (id INT PRIMARY KEY AUTO_INCREMENT,client_id INT,author_id INT,category VARCHAR(30),urgency VARCHAR(20),message TEXT,message_ciphertext TEXT,message_iv VARCHAR(100),message_auth_tag VARCHAR(100),encryption_key_id VARCHAR(100),is_internal_only INT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
   'CREATE TABLE message_logs (id INT PRIMARY KEY,agency_id INT,client_id INT,user_id INT,direction VARCHAR(20),delivery_status VARCHAR(20),from_number VARCHAR(40),to_number VARCHAR(40),sms_thread_key VARCHAR(100),created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
   'CREATE TABLE guardian_client_threads (client_id INT,agency_id INT,thread_id INT)',
   'CREATE TABLE chat_thread_participants (thread_id INT,user_id INT)',
   'CREATE TABLE chat_messages (id INT PRIMARY KEY,thread_id INT,sender_user_id INT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
   "INSERT INTO users (id,role,first_name,email,personal_phone,status) VALUES (10,'provider','Halle','provider@example.test',NULL,'ACTIVE'),(20,'client_guardian','Parent','parent@example.test','7195550100','ACTIVE'),(30,'supervisor','Supervisor',NULL,NULL,'ACTIVE'),(40,'provider','Unrelated',NULL,NULL,'ACTIVE')",
   "INSERT INTO agencies VALUES (2,'ITSCO','itsco')",
   'INSERT INTO user_agencies VALUES (10,2),(30,2),(40,2)',
   "INSERT INTO clients (id,agency_id,provider_id,full_name) VALUES (1,2,10,'Child One'),(2,2,10,'Child Two')",
   "INSERT INTO client_guardians VALUES (1,20,'guardian','Mother'),(2,20,'guardian','Mother')",
   'INSERT INTO supervisor_assignments VALUES (30,10,2)',
   'INSERT INTO communication_inboxes VALUES (10,2)',
   'INSERT INTO communication_conversations (id,agency_id,inbox_id) VALUES (100,2,10)',
   "INSERT INTO communication_links VALUES (100,'client',1),(100,'client',2)",
   `INSERT INTO communication_messages (id,conversation_id,channel,direction,author_user_id,send_status,to_json) VALUES (1,100,'email','outbound',10,'scheduled',JSON_ARRAY(JSON_OBJECT('email','parent@example.test')))`
  ])await state.db.query(sql);
  const migration=readFileSync(new URL('../../../../database/migrations/1689_parent_contact_events.sql',import.meta.url),'utf8');
  for(const sql of migration.split(';').filter(s=>s.trim()))await state.db.query(sql);
 });
 afterAll(async()=>{if(state.db){await state.db.query(`DROP DATABASE ${dbName}`);await state.db.end();}});
 it('writes exactly one encrypted contact note per child only after a successful send',async()=>{
  await syncEmailParentContact(1);expect((await state.db.query('SELECT * FROM client_notes'))[0]).toHaveLength(0);
  await state.db.query("UPDATE communication_messages SET send_status='sent',sent_at=NOW() WHERE id=1");
  await syncEmailParentContact(1);await syncEmailParentContact(1);
  const [clients]=await state.db.query('SELECT * FROM clients');
  expect(clients.every(c=>c.parents_contacted_at && c.parents_contacted_successful===null)).toBe(true);
  const [notes]=await state.db.query('SELECT * FROM client_notes');expect(notes).toHaveLength(2);
  expect(notes.every(n=>n.message===null && n.is_internal_only===1)).toBe(true);
  expect(decryptChatText({ciphertextB64:notes[0].message_ciphertext,ivB64:notes[0].message_iv,authTagB64:notes[0].message_auth_tag,keyId:notes[0].encryption_key_id})).toContain('Awaiting a reply');
 });
 it('marks both children successful for a human reply, never for an automatic reply',async()=>{
  await state.db.query(`INSERT INTO communication_messages (id,conversation_id,channel,direction,send_status,from_json,is_auto_reply) VALUES (2,100,'email','inbound','sent',JSON_OBJECT('email','parent@example.test'),1)`);
  await syncEmailParentContact(2);expect((await state.db.query('SELECT * FROM client_notes'))[0]).toHaveLength(2);
  const inbound={inboxId:10,agencyId:2,conversationId:100,deliveryId:'<parent-reply@example.test>',fromEmail:'parent@example.test',subject:'Re: Both children',bodyText:'Thank you, this is my reply.'};
  const result=await persistInboundEmail(inbound);
  expect(result.ingested).toBe(true);
  expect((await persistInboundEmail(inbound)).duplicate).toBe(true);
  await syncEmailParentContact(result.messageId);
  expect((await state.db.query('SELECT * FROM client_notes'))[0]).toHaveLength(4);
  expect((await state.db.query('SELECT * FROM clients'))[0].every(c=>c.parents_contacted_successful===1)).toBe(true);
 });
 it('limits the full shared conversation and guardian account to assigned staff and their supervisor',async()=>{
  expect(await canReadSharedClientConversation(10,100)).toBe(true);expect(await canReadSharedClientConversation(30,100)).toBe(true);
  expect(await canReadSharedClientConversation(40,100)).toBe(false);
  expect((await guardianContactContext({userId:10,guardianId:20})).clients).toHaveLength(2);
  await expect(guardianContactContext({userId:40,guardianId:20})).rejects.toMatchObject({status:404});
  await state.db.query('UPDATE clients SET provider_id=40 WHERE id=2');
  expect(await canReadSharedClientConversation(10,100)).toBe(false);
  expect((await guardianContactContext({userId:10,guardianId:20})).clients).toHaveLength(1);
  await state.db.query('UPDATE clients SET provider_id=10 WHERE id=2');
 });
 it('exposes the generated contact notes to authorized clinicians without exposing other internal notes',async()=>{
  await state.db.query("INSERT INTO client_notes (client_id,author_id,category,message,is_internal_only) VALUES (1,10,'clinical','Private unrelated note',1)");
  expect(await ClientNotes.findByClientId(1,{canViewContactEvents:true})).toHaveLength(2);
  expect(await ClientNotes.findByClientId(1,{canViewContactEvents:false})).toHaveLength(0);
 });
 it('records matched SMS and secure replies without double counting',async()=>{
  await state.db.query("INSERT INTO message_logs (id,agency_id,client_id,user_id,direction,delivery_status,from_number,to_number,sms_thread_key) VALUES (10,2,1,10,'OUTBOUND','sent','+17195550200','+17195550100','pair'),(11,2,1,NULL,'INBOUND','received','+17195550100','+17195550200','pair')");
  await syncSmsParentContact(10);await syncSmsParentContact(11);await syncSmsParentContact(11);
  await state.db.query('INSERT INTO guardian_client_threads VALUES (1,2,200),(2,2,200)');await state.db.query('INSERT INTO chat_thread_participants VALUES (200,10),(200,20)');
  await state.db.query('INSERT INTO chat_messages (id,thread_id,sender_user_id) VALUES (20,200,10),(21,200,20)');
  await syncSecureParentContact(20);await syncSecureParentContact(21);await syncSecureParentContact(21);
  expect((await state.db.query("SELECT * FROM client_parent_contact_events WHERE source_type='sms'"))[0]).toHaveLength(2);
  expect((await state.db.query("SELECT * FROM client_parent_contact_events WHERE source_type='secure'"))[0]).toHaveLength(4);
 });
});
