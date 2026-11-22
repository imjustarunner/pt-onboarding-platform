import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args)},onTableWrite:vi.fn()}));
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:async()=>null}));
import {guardianContactContext} from '../guardianContactContext.service.js';
import {hubClientScope} from '../hubPeopleAccess.service.js';
import {createGuardianCommunications} from '../guardianCommunications.service.js';

describe.skipIf(!recoveryMysqlEnabled)('guardian communications against mixed-collation MySQL tables',()=>{
 let fixture,service;
 beforeAll(async()=>{
  fixture=await isolatedWorkflowMysql('guardian_communications');state.db=fixture.db;
  const statements=[
   "CREATE TABLE users(id INT PRIMARY KEY,role ENUM('admin','support','provider','super_admin','client_guardian') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,first_name VARCHAR(40),last_name VARCHAR(40),email VARCHAR(100),personal_email VARCHAR(100),work_email VARCHAR(100),username VARCHAR(100),phone_number VARCHAR(30),personal_phone VARCHAR(30),work_phone VARCHAR(30),status VARCHAR(30),is_active INT DEFAULT 1,is_archived INT DEFAULT 0)",
   "CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT DEFAULT 1,agency_role ENUM('admin','support','provider') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci)",
   'CREATE TABLE user_agency_access_profiles(user_id INT,agency_id INT,effective_role VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)',
   'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80),slug VARCHAR(80))',
   'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,provider_id INT,full_name VARCHAR(80),initials VARCHAR(8))',
   'CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,relationship_type VARCHAR(30),relationship_title VARCHAR(30),permissions_json JSON)',
   'CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active INT)',
   'CREATE TABLE supervisor_assignments(supervisor_id INT,supervisee_id INT,agency_id INT)',
   'CREATE TABLE client_service_enrollments(client_id INT,agency_id INT,provider_user_id INT,service_kind VARCHAR(30),is_active INT,service_status VARCHAR(30))',
   'CREATE TABLE communication_inboxes(id INT PRIMARY KEY,agency_id INT,kind VARCHAR(30),identity_key VARCHAR(80),from_email VARCHAR(100),owner_user_id INT)',
   'CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT,inbox_id INT,channel VARCHAR(20),subject VARCHAR(100),last_message_at DATETIME(3),external_thread_id VARCHAR(150))',
   'CREATE TABLE communication_participants(conversation_id INT,email VARCHAR(100))',
   'CREATE TABLE communication_links(conversation_id INT,entity_type VARCHAR(40),entity_id INT)',
   'CREATE TABLE communication_messages(id INT PRIMARY KEY,conversation_id INT)',
   'CREATE TABLE client_parent_contact_events(source_type VARCHAR(20),source_id INT,guardian_user_id INT)',
   'CREATE TABLE message_logs(id INT PRIMARY KEY,agency_id INT,client_id INT,sms_thread_key VARCHAR(150),metadata JSON,direction VARCHAR(20),from_number VARCHAR(30),to_number VARCHAR(30),body TEXT,delivery_status VARCHAR(30),created_at DATETIME(3))',
   'CREATE TABLE chat_messages(id INT PRIMARY KEY,created_at DATETIME(3))',
   'CREATE TABLE client_secure_message_records(message_id INT,client_id INT,agency_id INT,sender_user_id INT,audience_json JSON)',
   "INSERT INTO users(id,role,first_name,email,phone_number,status) VALUES(7,'admin','Staff','staff@example.test',NULL,'ACTIVE'),(8,'provider','Clinician','clinician@example.test',NULL,'ACTIVE'),(9,'support','Other staff','other@example.test',NULL,'ACTIVE'),(20,'client_guardian','Parent','parent@example.test','7195551234','ACTIVE')",
   "INSERT INTO user_agencies VALUES(7,2,1,'admin'),(8,2,1,'provider'),(9,3,1,'support')",
   "INSERT INTO user_agency_access_profiles VALUES(7,2,'admin')",
   "INSERT INTO agencies VALUES(2,'Practice','practice'),(3,'Other practice','other')",
   "INSERT INTO clients VALUES(4,2,8,'Child A','CA'),(5,2,NULL,'Past child','PC'),(6,3,NULL,'Other agency child','OC')",
   "INSERT INTO client_guardians VALUES(4,20,'guardian','Parent',JSON_OBJECT()),(5,20,'guardian','Parent',JSON_OBJECT('relationshipRevoked',true)),(6,20,'guardian','Parent',JSON_OBJECT())",
   "INSERT INTO communication_conversations VALUES(101,2,NULL,'email','Appointment email','2026-11-22 19:00:00',NULL),(102,2,NULL,'sms','Parent text','2026-11-22 19:01:00','sms:v2:client:4:+17195550100:+17195551234')",
   "INSERT INTO communication_participants VALUES(101,'parent@example.test')",
   "INSERT INTO communication_links VALUES(101,'client',4),(102,'client',4)",
   "INSERT INTO message_logs VALUES(201,2,4,'sms:v2:client:4:+17195550100:+17195551234',JSON_OBJECT('guardianUserId',20),'OUTBOUND','+17195550100','+17195551234','Care update','delivered','2026-11-22 19:01:00')",
   "INSERT INTO chat_messages VALUES(301,'2026-11-22 19:02:00')",
   "INSERT INTO client_secure_message_records VALUES(301,4,2,8,JSON_ARRAY(JSON_OBJECT('id',20),JSON_OBJECT('id',8)))"
  ];
  for(const sql of statements)await state.db.query(sql);
  service=createGuardianCommunications({db:state.db,conversationAccess:async(_user,id)=>{const [[row]]=await state.db.execute('SELECT * FROM communication_conversations WHERE id=?',[id]);return row;},recordAccess:async()=>({ok:true})});
 });
 afterAll(async()=>{if(fixture)await fixture.close();});
 it('loads current and historical guardian context with real role predicates',async()=>{
  const current=await guardianContactContext({userId:7,guardianId:20});expect(current.clients.map(c=>c.id)).toEqual([4]);
  const history=await guardianContactContext({userId:7,guardianId:20,includePast:true});expect(history.clients.map(c=>c.id)).toEqual([4,5]);
 });
 it('reads email, SMS and secure history, child filters, and cursors without collation errors',async()=>{
  const result=await service.list({user:{id:7,role:'admin'},guardianId:20});expect(result.conversations.map(c=>c.channel)).toEqual(['secure','sms','email']);
  for(const channel of ['email','sms','secure'])expect((await service.list({user:{id:7,role:'admin'},guardianId:20,query:{channel,clientId:4}})).conversations).toHaveLength(1);
  expect((await service.list({user:{id:7,role:'admin'},guardianId:20,query:{cursor:JSON.stringify({at:'2026-11-22T19:01:00.000Z',key:'conversation-102'})}})).conversations.map(c=>c.channel)).toEqual(['email']);
  expect((await service.smsDetail({user:{id:7,role:'admin'},guardianId:20,conversationId:102})).messages[0]).toMatchObject({body_text:'Care update',send_status:'delivered'});
 });
 it('preserves agency role overrides, fallback roles, assigned-provider access and tenant boundaries',async()=>{
  const ids=async userId=>{const scope=hubClientScope(userId);const [rows]=await state.db.execute(`SELECT c.id FROM clients c WHERE ${scope.sql} ORDER BY c.id`,scope.params);return rows.map(c=>c.id);};
  expect(await ids(7)).toEqual([4,5]);expect(await ids(8)).toEqual([4]);expect(await ids(9)).toEqual([6]);
  await state.db.query("UPDATE user_agency_access_profiles SET effective_role='provider' WHERE user_id=7");
  try{expect(await ids(7)).toEqual([]);}finally{await state.db.query("UPDATE user_agency_access_profiles SET effective_role='admin' WHERE user_id=7");}
 });
});
