import {beforeAll,afterAll,beforeEach,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';import {readFile} from 'node:fs/promises';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {reserveSecureDelivery} from '../secureInvitation.service.js';
import {createMobileConversaStore,mobileThreadItem,normalizeMobilePreferences,requireMobileThreadMembership} from '../conversa.service.js';
it('uses names rather than numeric thread IDs and separates group conversations from direct messages',()=>{
 const base={thread_id:8,thread_type:'direct',participants:[{id:2,first_name:'Ari',last_name:'Example'},{id:3,first_name:'Sam',last_name:'Example'}],last_message:{body:'Hello',sender_user_id:2}};
 expect(mobileThreadItem(base,1)).toMatchObject({category:'groups',title:'Ari Example, Sam Example'});
 expect(mobileThreadItem({...base,message_channel:'secure'},1)).toMatchObject({category:'secure',title:'Ar••• Ex•••, Sa••• Ex•••',preview:'Secure message · tap to unlock'});
});
it('normalizes swipe and shortcut preferences without accepting unsupported destinations',()=>{
 expect(normalizeMobilePreferences({swipeLeft:'delete-everything',pinnedNavigation:['mywork','admin','mywork','home'],usage:{admin:100,home:4}})).toMatchObject({swipeLeft:'archive',swipeRight:'read',pinnedNavigation:['mywork','home'],usage:{home:4}});
});
describe.runIf(process.env.MOBILE_MYSQL_TEST==='1')('personal mobile inbox SQL',()=>{
 let admin,db,store;const name=`auricwell_conversa_test_${process.pid}`;
 beforeAll(async()=>{
  const options=process.env.MOBILE_MYSQL_SOCKET?{socketPath:process.env.MOBILE_MYSQL_SOCKET}:{host:'127.0.0.1',port:Number(process.env.MOBILE_MYSQL_PORT || 3412)};
  admin=await mysql.createConnection({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD || '',multipleStatements:true});await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  db=mysql.createPool({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD || '',database:name,timezone:'+00:00',multipleStatements:true});
  await db.query(`CREATE TABLE chat_threads(id INT PRIMARY KEY,agency_id INT,message_channel VARCHAR(20));CREATE TABLE chat_thread_participants(thread_id INT,user_id INT);
    CREATE TABLE chat_messages(id INT PRIMARY KEY,thread_id INT,parent_message_id INT,sender_user_id INT);
    CREATE TABLE chat_thread_reads(thread_id INT,user_id INT,last_read_message_id INT);CREATE TABLE chat_message_views(message_id INT,user_id INT);
    CREATE TABLE chat_message_deletes(message_id INT,user_id INT);CREATE TABLE chat_message_mentions(message_id INT,mentioned_user_id INT);
    CREATE TABLE chat_message_attachments(id INT PRIMARY KEY,message_id INT);
    CREATE TABLE agencies(id INT PRIMARY KEY,is_active BOOLEAN DEFAULT 1,is_archived BOOLEAN DEFAULT 0);
    CREATE TABLE users(id INT PRIMARY KEY,email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,work_email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,personal_email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,role VARCHAR(40) DEFAULT 'provider');
    CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOLEAN DEFAULT 1);
    CREATE TABLE communication_inboxes(id INT PRIMARY KEY,agency_id INT DEFAULT 10,identity_key VARCHAR(60),kind VARCHAR(20),owner_user_id INT,from_email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci);
    CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT,inbox_id INT,owner_user_id INT,channel VARCHAR(20),subject VARCHAR(100),status VARCHAR(30),last_message_preview TEXT,last_message_at DATETIME,created_at DATETIME,archived_at DATETIME,is_spam BOOLEAN DEFAULT 0,is_unknown_sender BOOLEAN DEFAULT 0,external_thread_id VARCHAR(80));
    CREATE TABLE communication_messages(id INT PRIMARY KEY,author_user_id INT,conversation_id INT,direction VARCHAR(20),is_internal_note BOOLEAN DEFAULT 0,send_status VARCHAR(20),sent_at DATETIME,created_at DATETIME,from_json JSON);
    CREATE TABLE communication_conversation_reads(conversation_id INT,user_id INT,forced_unread BOOLEAN DEFAULT 0,last_read_at DATETIME);
    CREATE TABLE communication_participants(id INT PRIMARY KEY,conversation_id INT,is_primary BOOLEAN,email VARCHAR(100),display_name VARCHAR(100));
    CREATE TABLE managed_workspace_groups(id INT PRIMARY KEY,agency_id INT DEFAULT 10,chat_thread_id INT,email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci);CREATE TABLE email_sender_identities(id INT PRIMARY KEY,from_email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,is_active BOOLEAN DEFAULT 1);
    CREATE TABLE message_logs(id INT PRIMARY KEY,agency_id INT,sms_thread_key VARCHAR(80),user_id INT,assigned_user_id INT,number_id INT);
    CREATE TABLE twilio_number_assignments(number_id INT,user_id INT,is_active BOOLEAN,sms_access_enabled BOOLEAN);`);
  await db.query(await readFile(new URL('../../../../../database/migrations/1769_mobile_conversa_preferences.sql',import.meta.url),'utf8'));await db.query(await readFile(new URL('../../../../../database/migrations/1779_mobile_secure_delivery.sql',import.meta.url),'utf8'));store=createMobileConversaStore(db);
 });
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}});
 beforeEach(async()=>{
  await db.query(`TRUNCATE mobile_secure_deliveries;TRUNCATE chat_threads;TRUNCATE chat_thread_participants;TRUNCATE chat_messages;TRUNCATE chat_thread_reads;TRUNCATE chat_message_views;TRUNCATE chat_message_deletes;TRUNCATE chat_message_mentions;TRUNCATE chat_message_attachments;TRUNCATE mobile_message_archives;TRUNCATE mobile_workspace_preferences;TRUNCATE communication_conversations;TRUNCATE communication_messages;TRUNCATE communication_participants;TRUNCATE communication_conversation_reads;TRUNCATE users;TRUNCATE user_agencies;TRUNCATE agencies;TRUNCATE managed_workspace_groups;TRUNCATE email_sender_identities;TRUNCATE communication_inboxes;
    INSERT INTO agencies(id) VALUES(10),(20);
    INSERT INTO users(id,email,work_email,personal_email) VALUES(1,'owner@example.invalid',NULL,NULL),(2,'staff@example.invalid',NULL,'personal@example.invalid');
    INSERT INTO user_agencies VALUES(1,10,1),(2,10,1);
    INSERT INTO communication_inboxes(id,kind,owner_user_id,from_email) VALUES(1,'personal',1,'owner@example.invalid'),(2,'personal',2,'staff@example.invalid');`);
 });
 async function mail(id,{owner=1,inbox=1,agency=10,unknown=false,email='outside@example.invalid',status='new',channel='email'}={}){
  await db.execute(`INSERT INTO communication_conversations(id,agency_id,inbox_id,owner_user_id,channel,subject,status,last_message_preview,last_message_at,created_at,is_unknown_sender)VALUES(?,?,?,?,?,?,?,'Preview','2026-11-06 12:00:00','2026-11-06 12:00:00',?)`,[id,agency,inbox,owner,channel,`MESSAGE-${id}`,status,unknown?1:0]);
  await db.execute(`INSERT INTO communication_messages(id,conversation_id,direction,send_status,sent_at,created_at,from_json)VALUES(?,?,'inbound','sent','2026-11-06 12:00:00','2026-11-06 12:00:00',?)`,[id,id,JSON.stringify({name:'Fixture sender',email})]);
  await db.execute('INSERT INTO communication_participants(id,conversation_id,is_primary,email,display_name)VALUES(?,?,1,?,?)',[id,id,email,'Fixture sender']);
 }
 it('Sent is authored by this user and excludes failed or internal outbound mail',async()=>{
  for(let id=1;id<=4;id++)await mail(id,{status:'open'});
  await db.query("INSERT INTO communication_messages(id,conversation_id,direction,author_user_id,send_status,is_internal_note,created_at) VALUES (11,1,'outbound',1,'sent',0,NOW()),(12,2,'outbound',2,'sent',0,NOW()),(13,3,'outbound',1,'failed',0,NOW()),(14,4,'outbound',1,'sent',1,NOW())");
  expect((await store.emails(1,{filter:'sent'})).map(i=>i.id)).toEqual([1]);expect((await store.emailCounts(1)).reduce((n,c)=>n+c.sent,0)).toBe(1);
 });
 it('reserves exactly one secure send under concurrent retries in MySQL',async()=>{
  const args={senderId:1,requestKey:'synthetic-unique-request-001',agencyId:10,clientId:20,recipientKey:'client',text:'Synthetic secure text'};
  const receipts=await Promise.all(Array.from({length:8},()=>reserveSecureDelivery(args,db)));
  expect(receipts.filter(r=>r.fresh)).toHaveLength(1);expect(new Set(receipts.map(r=>r.row.id)).size).toBe(1);
  await expect(reserveSecureDelivery({...args,clientId:21},db)).rejects.toMatchObject({status:409});
 });
 async function seedMailRange(start,end,{statusFor=()=>'new'}={}){
  const ids=Array.from({length:end-start},(_,index)=>start+index),at='2026-11-06 12:00:00';
  await db.query('INSERT INTO communication_conversations(id,agency_id,inbox_id,owner_user_id,channel,subject,status,last_message_preview,last_message_at,created_at,is_unknown_sender) VALUES ?',[ids.map(id=>[id,10,1,1,'email',`MESSAGE-${id}`,statusFor(id),'Preview',at,at,0])]);
  await db.query('INSERT INTO communication_messages(id,conversation_id,direction,send_status,sent_at,created_at,from_json) VALUES ?',[ids.map(id=>[id,id,'inbound','sent',at,at,JSON.stringify({name:'Fixture sender',email:'outside@example.invalid'})])]);
  await db.query('INSERT INTO communication_participants(id,conversation_id,is_primary,email,display_name) VALUES ?',[ids.map(id=>[id,id,1,'outside@example.invalid','Fixture sender'])]);
 }
 it('excludes another staff mailbox and a tenant with no active membership',async()=>{
  await mail(1);await mail(2,{owner:2,inbox:2});await mail(3,{owner:1,inbox:2});await mail(4,{agency:20});await mail(5,{owner:2,inbox:1});
  expect((await store.emails(1)).map(item=>item.id).sort()).toEqual([1,5]);
  expect((await store.emailCounts(1)).reduce((sum,c)=>sum+c.total,0)).toBe(2);
  await db.execute('UPDATE agencies SET is_active=0 WHERE id=10');expect(await store.emails(1)).toHaveLength(0);await db.execute('UPDATE agencies SET is_active=1 WHERE id=10');
  await db.execute('UPDATE user_agencies SET is_active=0 WHERE user_id=1');expect(await store.emails(1)).toHaveLength(0);
 });
 it('archives only for its owner, excludes archives by default, and restores them',async()=>{
  await mail(1);await store.archive(1,'email',1,true);expect(await store.emails(1)).toHaveLength(0);expect((await store.emails(1,{includeArchived:true}))[0].archived).toBe(true);
  expect((await store.archives(2)).size).toBe(0);await store.archive(1,'email',1,false);expect(await store.emails(1)).toHaveLength(1);
 });
 it('recognizes exact app users and managed group emails in old unknown mail',async()=>{
  await db.query("INSERT INTO managed_workspace_groups(id,email) VALUES(1,'group@example.invalid')");
  await mail(1,{unknown:true,email:'group@example.invalid'});await mail(2,{unknown:true,email:'personal@example.invalid'});await mail(3,{unknown:true,email:'unregistered@example.invalid'});
  const rows=await store.emails(1);expect(rows.find(item=>item.id===1).unknown).toBe(false);expect(rows.find(item=>item.id===2).unknown).toBe(false);expect(rows.find(item=>item.id===3).unknown).toBe(true);
  const counts=await store.emailCounts(1);expect(counts.find(c=>c.unknown).total).toBe(1);expect(counts.find(c=>!c.unknown).total).toBe(2);
 });
 it('recognizes every registered address with mixed historical column collations',async()=>{
  await db.query("UPDATE users SET work_email=' work@example.invalid ' WHERE id=2; INSERT INTO managed_workspace_groups(id,email) VALUES(1,' GROUP@EXAMPLE.INVALID '); INSERT INTO email_sender_identities VALUES(1,' IDENTITY@EXAMPLE.INVALID ',1); INSERT INTO communication_inboxes(id,kind,owner_user_id,from_email) VALUES(3,'shared',NULL,' MAILBOX@EXAMPLE.INVALID ');");
  const known=['staff@example.invalid','work@example.invalid','personal@example.invalid','group@example.invalid','identity@example.invalid','mailbox@example.invalid'];
  for(const [i,email] of known.entries())await mail(i+1,{unknown:true,email});
  await mail(99,{unknown:true,email:'unregistered@example.invalid'});await mail(100,{unknown:true,email:'work@example.invalid.evil.invalid'});
  const rows=await store.emails(1);for(const id of [1,2,3,4,5,6])expect(rows.find(row=>row.id===id).unknown).toBe(false);
  for(const id of [99,100])expect(rows.find(row=>row.id===id).unknown).toBe(true);
  expect((await store.emails(1,{suite:'email'})).map(row=>row.id).sort()).toEqual([1,2,3,4,5,6]);
  expect((await store.emails(1,{suite:'unknown'})).map(row=>row.id).sort()).toEqual([100,99]);
  expect(await store.emailCounts(1)).toEqual(expect.arrayContaining([{category:'email',unknown:false,total:6,unread:6,needs:6,sent:0},{category:'email',unknown:true,total:2,unread:2,needs:2,sent:0}]));
 });
 it('computes counts beyond a visible page and filters before pagination',async()=>{
  await seedMailRange(1,106,{statusFor:id=>id<=3?'closed':'new'});
  expect(await store.emails(1)).toHaveLength(101);expect((await store.emailCounts(1))[0]).toMatchObject({total:105,unread:105,needs:102});
  await db.execute("INSERT INTO communication_conversation_reads VALUES(105,1,0,'2026-11-06 13:00:00')");expect((await store.emails(1,{filter:'unread'})).some(item=>item.id===105)).toBe(false);
  expect((await store.emailCounts(1))[0].unread).toBe(104);
  const next=await store.emails(1,{beforeAt:'2026-11-06T12:00:00Z',beforeKey:`email:${String(56).padStart(20,'0')}`});expect(next).toHaveLength(55);expect(next.at(-1).id).toBe(1);
 });
 it('counts a sent reply in the middle of a thread rather than only the newest sender',async()=>{
  await db.query('INSERT INTO chat_messages VALUES(100,10,NULL,2),(101,10,100,1),(102,10,100,2)');
  expect((await store.extraCounts(1,[10])).threads.sent).toBe(1);
  await db.query('INSERT INTO chat_message_deletes VALUES(101,1)');expect((await store.extraCounts(1,[10])).threads.sent).toBe(0);
 });
 it('counts only authorized threads and leaves messages above unread until actually viewed',async()=>{
  await db.query(`INSERT INTO chat_messages VALUES(100,10,NULL,1),(101,10,100,2),(200,20,NULL,1),(201,20,200,2);
    INSERT INTO chat_message_mentions VALUES(101,1),(201,1);INSERT INTO chat_message_attachments VALUES(1,101),(2,201);`);
  expect(await store.extraCounts(1,[10])).toEqual({threads:{total:1,unread:1,needs:1,sent:1},mentions:{total:1,unread:1,needs:1,sent:0},files:{total:1,unread:1,needs:0,sent:0}});
  await db.execute('INSERT INTO chat_message_views VALUES(101,1)');expect((await store.extraCounts(1,[10])).threads.unread).toBe(0);
 });
 it('keeps current membership and school-staff secure-message restrictions on device sign-ins',async()=>{
  await db.query(`INSERT INTO chat_threads VALUES(10,10,'internal'),(11,10,'secure');INSERT INTO chat_thread_participants VALUES(10,1),(11,1),(10,2),(11,2);UPDATE users SET role='school_staff' WHERE id=2;`);
  await expect(requireMobileThreadMembership(1,11,db)).resolves.toBe(true);await expect(requireMobileThreadMembership(2,10,db)).resolves.toBe(true);
  await expect(requireMobileThreadMembership(2,11,db)).rejects.toMatchObject({status:403});await db.execute('UPDATE user_agencies SET is_active=0 WHERE user_id=1');await expect(requireMobileThreadMembership(1,11,db)).rejects.toMatchObject({status:403});
 });
 it('orders mixed source kinds consistently when a timestamp has more than a page',async()=>{
  await seedMailRange(1000,1105);
  await mail(1,{channel:'sms',unknown:true});const rows=await store.emails(1);expect(rows[0]).toMatchObject({id:1,category:'sms',unknown:false});
 });
 it('persists personal swipe and navigation choices without crossing accounts',async()=>{
  await store.savePreferences(1,{swipeRight:'unread',navigationMode:'pinned',pinnedNavigation:['mywork','home']});expect(await store.preferences(1)).toMatchObject({swipeRight:'unread',navigationMode:'pinned',pinnedNavigation:['mywork','home']});expect((await store.preferences(2)).swipeRight).toBe('read');
 });
 it('includes only authorized shared group mail and classifies group delivery in a personal inbox without duplicates',async()=>{
  await db.query(`INSERT INTO chat_threads VALUES(30,10,'internal');INSERT INTO chat_thread_participants VALUES(30,1);
    INSERT INTO managed_workspace_groups(id,agency_id,chat_thread_id,email)VALUES(1,10,30,'clinical@example.invalid');
    INSERT INTO communication_inboxes(id,agency_id,kind,identity_key,from_email)VALUES(3,10,'shared','clinical','clinical@example.invalid'),(4,10,'shared','payroll','payroll@example.invalid');`);
  await mail(1,{email:'clinical@example.invalid'});await mail(2,{owner:2,inbox:2,email:'clinical@example.invalid'});await mail(3,{owner:0,inbox:3,email:'outside@example.invalid'});await mail(4,{owner:0,inbox:4});await mail(5,{email:'ordinary@example.invalid'});
  const scoped=createMobileConversaStore(db,{listAgencies:async()=>({agencies:[{id:10}]}),groupAccess:async()=>false});
  const items=await scoped.emails(1);expect(items.map(row=>row.id).sort()).toEqual([1,3,5]);expect(items.filter(row=>row.category==='groups').map(row=>row.id).sort()).toEqual([1,3]);
  expect((await scoped.emails(1,{suite:'groups'})).map(row=>row.id).sort()).toEqual([1,3]);expect((await scoped.emails(1,{suite:'email'})).map(row=>row.id)).toEqual([5]);
  const counts=await scoped.emailCounts(1);expect(counts.find(row=>row.category==='groups').total).toBe(2);expect(counts.reduce((n,row)=>n+row.total,0)).toBe(3);
 });
 it('uses current explicit grants for secondary mailbox scope and retains personal ownership checks',async()=>{
  await db.query(`INSERT INTO communication_inboxes(id,agency_id,kind,owner_user_id,from_email)VALUES(6,20,'personal',1,'secondary@example.invalid'),(7,20,'personal',2,'other@example.invalid')`);
  await mail(1,{agency:20,inbox:6});await mail(2,{agency:20,inbox:7,owner:2});
  let granted=true;const scoped=createMobileConversaStore(db,{listAgencies:async()=>({agencies:granted?[{id:10},{id:20}]:[{id:10}]}),groupAccess:async()=>false});
  expect((await scoped.emails(1)).map(row=>row.id)).toEqual([1]);granted=false;expect(await scoped.emails(1)).toEqual([]);
 });

});
