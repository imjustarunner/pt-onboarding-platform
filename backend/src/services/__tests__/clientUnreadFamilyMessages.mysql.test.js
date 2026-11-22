import {beforeAll,afterAll,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
vi.mock('../../config/database.js',()=>({default:{}}));
import {clientUnreadFamilyCounts} from '../clientUnreadFamilyMessages.service.js';
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
describe.skipIf(!socketPath)('unread family messages on MySQL',()=>{
 let db;const name='family_unread_'+process.pid;
 beforeAll(async()=>{
  db=await mysql.createConnection({socketPath,user:'root'});await db.query(`CREATE DATABASE ${name}`);await db.query(`USE ${name}`);
  for(const sql of [
   'CREATE TABLE chat_threads(id INT,agency_id INT,message_channel VARCHAR(20))',
   'CREATE TABLE chat_messages(id INT,thread_id INT,parent_message_id INT,sender_user_id INT,created_at DATETIME)',
   'CREATE TABLE client_secure_message_records(client_id INT,message_id INT,thread_id INT,sender_user_id INT,audience_json JSON)',
   'CREATE TABLE chat_thread_participants(thread_id INT,user_id INT,created_at DATETIME)',
   'CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled INT,permissions_json JSON)',
   'CREATE TABLE chat_thread_reads(thread_id INT,user_id INT,last_read_message_id INT)',
   'CREATE TABLE chat_message_deletes(message_id INT,user_id INT)',
   'CREATE TABLE family_shared_conversations(thread_id INT,audience_json JSON)',
   "INSERT INTO chat_threads VALUES(1,2,'secure'),(2,3,'secure'),(3,2,'secure')",
   "INSERT INTO chat_thread_participants VALUES(1,9,'2026-01-01'),(2,9,'2026-01-01'),(3,99,'2026-01-01')",
   "INSERT INTO client_guardians VALUES(12,7,1,NULL),(12,8,0,NULL),(12,10,1,JSON_OBJECT('relationshipRevoked',true))",
   "INSERT INTO chat_messages VALUES(1,1,NULL,7,NOW()),(2,1,NULL,7,NOW()),(3,1,NULL,8,NOW()),(4,1,NULL,7,NOW()),(5,1,NULL,10,NOW()),(6,2,NULL,7,NOW()),(7,3,NULL,7,NOW()),(8,1,NULL,9,NOW()),(9,1,NULL,7,NOW())",
   "INSERT INTO client_secure_message_records VALUES(12,1,1,7,JSON_ARRAY(JSON_OBJECT('id',9))),(12,2,1,7,JSON_ARRAY(JSON_OBJECT('id',9))),(12,3,1,8,JSON_ARRAY(JSON_OBJECT('id',9))),(12,4,1,7,JSON_ARRAY(JSON_OBJECT('id',99))),(12,5,1,10,JSON_ARRAY(JSON_OBJECT('id',9))),(12,6,2,7,JSON_ARRAY(JSON_OBJECT('id',9))),(12,7,3,7,JSON_ARRAY(JSON_OBJECT('id',99))),(12,8,1,9,JSON_ARRAY(JSON_OBJECT('id',9))),(12,9,1,7,JSON_ARRAY(JSON_OBJECT('id',9)))",
   'INSERT INTO chat_thread_reads VALUES(1,9,1)',
   'INSERT INTO chat_message_deletes VALUES(9,9)'
  ])await db.query(sql);
 });
 afterAll(async()=>{if(db){await db.query(`DROP DATABASE ${name}`);await db.end();}});
 it('counts only unread messages in this agency addressed to this actor from currently authorized family members',async()=>{
  const counts=await clientUnreadFamilyCounts({agencyId:2,clientIds:[12,13],userId:9},db,async()=>'(t.id IN (1))');expect(counts.get(12)).toBe(1);expect(counts.has(13)).toBe(false);
 });
 it('omits a thread as soon as current secure access is withdrawn',async()=>{
  const counts=await clientUnreadFamilyCounts({agencyId:2,clientIds:[12],userId:9},db,async()=>'(FALSE)');expect(counts.size).toBe(0);
 });
});
