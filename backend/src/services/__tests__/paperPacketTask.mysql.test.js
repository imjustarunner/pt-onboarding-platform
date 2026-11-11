import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
// Any accidental use of the application's pool must fail, never contact DB_*.
vi.mock('../../config/database.js',()=>({default:{execute(){throw new Error('Use the isolated fixture connection.');}}}));
vi.mock('../../models/Task.model.js',()=>({default:{}}));
vi.mock('../../models/Notification.model.js',()=>({default:{}}));
import {listPaperPacketTasks,completePaperPacketTask} from '../paperPacketTask.service.js';

describe.skipIf(!recoveryMysqlEnabled)('paper task source joins on isolated MySQL with mixed collations',()=>{
 let fixture,db;
 beforeAll(async()=>{
  fixture=await isolatedWorkflowMysql('paper_task_collation');
  db=await fixture.db.getConnection();
  // Production's legacy task reference has 0900 collation, while the application
  // connection renders numeric CASTs with unicode_ci. Keep that difference real.
  await db.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
  await db.query(`CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT NOT NULL)`);
  await db.query(`CREATE TABLE referral_packet_upload_drafts(
   id INT PRIMARY KEY,agency_id INT NOT NULL,organization_id INT NOT NULL,phi_document_id INT,
   created_client_id INT,status VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL)`);
  await db.query(`CREATE TABLE client_phi_documents(
   id INT PRIMARY KEY,agency_id INT NOT NULL,client_id INT,school_organization_id INT,
   original_name VARCHAR(255),removed_at DATETIME NULL)`);
  await db.query(`CREATE TABLE tasks(
   id INT PRIMARY KEY,title VARCHAR(255),status VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL,
   created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,completed_at DATETIME NULL,
   source_ref_type VARCHAR(32) COLLATE utf8mb4_unicode_ci,
   source_ref_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
   assigned_to_agency_id INT,is_private TINYINT NOT NULL DEFAULT 0,
   UNIQUE KEY uq_source(source_ref_type,source_ref_id))`);
 });
 afterAll(async()=>{if(db)db.release();if(fixture)await fixture.close();});
 beforeEach(async()=>{
  for(const table of ['tasks','referral_packet_upload_drafts','client_phi_documents','clients'])await db.query(`DELETE FROM ${table}`);
  await db.query('INSERT INTO clients VALUES(55,450),(56,450),(60,999)');
  await db.query(`INSERT INTO client_phi_documents VALUES
   (30,450,55,451,'Synthetic current packet.pdf',NULL),
   (31,450,55,451,'Synthetic replacement packet.pdf',NULL),
   (32,450,56,451,'Sibling private packet.pdf',NULL),
   (33,999,60,998,'Other agency packet.pdf',NULL),
   (34,450,55,451,'Removed packet.pdf','2026-11-10'),
   (35,450,56,451,'Cross-child packet.pdf',NULL)`);
  await db.query(`INSERT INTO referral_packet_upload_drafts VALUES
   (20,450,451,30,55,'submitted'),(21,450,451,31,55,'submitted'),
   (22,450,451,32,56,'submitted'),(23,999,998,33,60,'submitted'),
   (24,999,451,30,55,'submitted'),(25,450,451,30,55,'draft'),
   (26,450,451,30,55,'submitted'),(27,450,451,30,55,'submitted'),
   (28,450,451,30,55,'submitted'),(29,450,451,34,55,'submitted'),
   (30,450,451,35,55,'submitted'),(31,450,451,30,55,'submitted')`);
  const rows=[
   [1,'20',450,'pending',0],[2,'21',450,'pending',0],[3,'22',450,'pending',0],
   [4,'23',999,'pending',0],[5,'31',999,'pending',0],[6,'25',450,'pending',0],
   [7,'26',450,'pending',1],[8,'27',450,'completed',0],[9,'28',450,'overridden',0],
   [10,'24',999,'pending',0],[11,'29',450,'pending',0],[12,'30',450,'pending',0]
  ];
  for(const [id,source,agency,status,isPrivate] of rows){
   await db.execute(`INSERT INTO tasks(id,title,status,created_at,updated_at,completed_at,source_ref_type,source_ref_id,assigned_to_agency_id,is_private)
    VALUES(?,?,?,'2026-11-10 22:10:00','2026-11-10 22:10:00',?,'paper_packet_processing',?,?,?)`,
   [id,`Synthetic packet task ${id}`,status,status==='completed'?'2026-11-10 22:15:00':null,source,agency,isPrivate]);
  }
 });
 const state=documentId=>({processedAt:'2026-11-10T22:30:00Z',documentId,guardian1Id:61,guardian2Id:62,
  invitations:{61:{status:'sent'},62:{status:'redirected'}}});
 const states=async()=>new Map((await db.execute('SELECT id,status,completed_at,updated_at FROM tasks ORDER BY id'))[0].map(row=>[row.id,row]));
 it('reproduces the uncollated SELECT and UPDATE-plan errors instead of accidentally testing a homogeneous schema',async()=>{
  const [[connection]]=await db.query('SELECT @@collation_connection AS collation');expect(connection.collation).toBe('utf8mb4_unicode_ci');
  const [[column]]=await db.query("SHOW FULL COLUMNS FROM tasks WHERE Field='source_ref_id'");expect(column.Collation).toBe('utf8mb4_0900_ai_ci');
  await expect(db.execute(`SELECT t.id FROM tasks t JOIN referral_packet_upload_drafts d ON t.source_ref_id=CAST(d.id AS CHAR) WHERE d.created_client_id=55`)).rejects.toMatchObject({errno:1267});
  await expect(db.execute(`EXPLAIN UPDATE tasks t JOIN referral_packet_upload_drafts d ON CAST(d.id AS CHAR)=t.source_ref_id SET t.status='completed' WHERE d.created_client_id=55`)).rejects.toMatchObject({errno:1267});
 });
 it('executes the actual list query for the requested child and agency, excludes private/terminal/unfinished/cross-agency sources',async()=>{
  const rows=await listPaperPacketTasks({clientId:55,agencyId:450},db);
  expect(rows.map(row=>row.id)).toEqual([1,2,11,12]);
  expect(rows.find(row=>row.id===1)).toMatchObject({draft_id:20,document_id:30,packet_filename:'Synthetic current packet.pdf'});
  expect(rows.find(row=>row.id===2)).toMatchObject({draft_id:21,document_id:31,packet_filename:'Synthetic replacement packet.pdf'});
  expect(rows.find(row=>row.id===11).packet_filename).toBeNull();
  expect(rows.find(row=>row.id===12).packet_filename).toBeNull();
  expect(JSON.stringify(rows)).not.toMatch(/Sibling private packet|Other agency packet|Removed packet|Cross-child packet/);
  expect(await listPaperPacketTasks({clientId:55,agencyId:999},db)).toEqual([]);
  expect((await listPaperPacketTasks({clientId:56,agencyId:450},db)).map(row=>row.id)).toEqual([3]);
 });
 it('completes only submitted tasks for the same legitimate child/document/agency and preserves terminal decisions',async()=>{
  expect(await completePaperPacketTask({clientId:55,state:state(30)},db)).toBe(true);
  const rows=await states();expect(rows.get(1).status).toBe('completed');expect(rows.get(7).status).toBe('completed');
  for(const id of [2,3,4,5,6,10,11,12])expect(rows.get(id).status,`task ${id}`).toBe('pending');
  expect(rows.get(8)).toMatchObject({status:'completed',completed_at:new Date('2026-11-10T22:15:00Z')});
  expect(rows.get(9).status).toBe('overridden');
  // Fixed historical timestamp makes an accidental repeat UPDATE detectable
  // without wall-clock sleeps or changing production/server time.
  await db.execute("UPDATE tasks SET completed_at='2026-11-10 22:16:00',updated_at='2026-11-10 22:16:00' WHERE id=1");
  await completePaperPacketTask({clientId:55,state:state(30)},db);
  expect((await states()).get(1)).toMatchObject({completed_at:new Date('2026-11-10T22:16:00Z'),updated_at:new Date('2026-11-10T22:16:00Z')});
 });
 it('leaves delivery-unknown, removed, cross-child and wrong-source tasks pending',async()=>{
  expect(await completePaperPacketTask({clientId:55,state:{...state(30),invitations:{61:{status:'sent'},62:{status:'unknown'}}}},db)).toBe(false);
  for(const documentId of [34,35,999])await completePaperPacketTask({clientId:55,state:state(documentId)},db);
  const rows=await states();for(const id of [1,2,3,4,5,6,7,10,11,12])expect(rows.get(id).status,`task ${id}`).toBe('pending');
 });
});
