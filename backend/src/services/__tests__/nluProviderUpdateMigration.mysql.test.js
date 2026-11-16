import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import mysql from 'mysql2/promise';
import {nluNovemberMigration} from '../../scripts/buildNluNovemberProviderUpdateMigration.js';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const port=Number(process.env.NLU_UPDATE_TEST_MYSQL_PORT);
describe.skipIf(!port)('native MySQL NLU combined draft refresh',()=>{
 let db;const schema=`nlu_update_test_${process.pid}`;
 beforeAll(async()=>{
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Use an explicit disposable loopback port.');
  db=await mysql.createConnection({host:'127.0.0.1',port,user:'root',multipleStatements:true});
  await db.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4; USE \`${schema}\`;
   CREATE TABLE admin_updates(id INT PRIMARY KEY,agency_id INT,status VARCHAR(30),title TEXT,subtitle TEXT,intro_html TEXT);
   CREATE TABLE admin_update_topics(id INT AUTO_INCREMENT PRIMARY KEY,update_id INT,topic_key VARCHAR(64),title TEXT,body_html TEXT,enabled TINYINT,sort_order INT,icon_key VARCHAR(64),color VARCHAR(20),is_builtin TINYINT);
   CREATE TABLE provider_update_pushes(id INT PRIMARY KEY,agency_id INT,attached_admin_update_id INT,status VARCHAR(30),sent_at DATETIME,title TEXT,section_config_json JSON,section_audience_json JSON,amendment_plan_json JSON,notes TEXT);
   CREATE TABLE provider_update_recipients(id INT PRIMARY KEY,push_id INT,token VARCHAR(80));
   CREATE TABLE workplace_handbook_digests(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,title TEXT,period_label VARCHAR(64),admin_update_id INT,status VARCHAR(30),notes TEXT);
   CREATE TABLE workplace_handbook_digest_entries(id INT AUTO_INCREMENT PRIMARY KEY,digest_id INT,agency_id INT,sort_order INT,subject VARCHAR(500),rationale TEXT,changed_content TEXT,handbook_section_slug VARCHAR(128),change_kind VARCHAR(30),previous_content TEXT);`);
 });
 beforeEach(async()=>{
  await db.query('DROP TABLE IF EXISTS provider_update_content_revisions; DELETE FROM admin_update_topics; DELETE FROM admin_updates; DELETE FROM provider_update_pushes; DELETE FROM provider_update_recipients; DELETE FROM workplace_handbook_digest_entries; DELETE FROM workplace_handbook_digests');
  await db.query(`INSERT INTO admin_updates VALUES(2,6,'draft','October 2026','Original subtitle','Original introduction'),(9,2,'draft','ITSCO October','Unchanged','Unchanged');
   INSERT INTO provider_update_pushes VALUES(20,6,2,'draft',NULL,'[PREVIEW] NLU October',JSON_OBJECT('amendments',false,'spanish_intake',true,'_training',JSON_OBJECT('pin',JSON_ARRAY(JSON_OBJECT('id','saved-media')))),JSON_OBJECT(),NULL,'Original notes');
   INSERT INTO provider_update_recipients VALUES(1,20,'preview_synthetic');
   INSERT INTO admin_update_topics(update_id,topic_key,title,body_html,enabled,sort_order) VALUES(2,'spanish_intake','Spanish','old',1,1),(2,'school_assignments','School','old',1,2),(2,'welcome','October','old',1,3),(2,'office_kiosk','Keep training','<video src="https://example.test/clip.mp4"></video>',1,4);
   INSERT INTO workplace_handbook_digests(id,agency_id,title,period_label,admin_update_id,status,notes) VALUES(1,6,'October','October 2026',2,'draft','Original digest');
   INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug) VALUES(1,6,1,'Original local update','Keep','Original policy','local-policy');`);
 });
 afterAll(async()=>{if(db){await db.query(`DROP DATABASE \`${schema}\``);await db.end();}});
 async function apply(){for(const statement of splitSqlStatements(stripSqlLineComments(nluNovemberMigration())))await db.query(statement);}
 it('updates the correct draft, keeps media/training and snapshots original configuration with automation attribution',async()=>{
  await apply();const [[push]]=await db.query('SELECT * FROM provider_update_pushes WHERE id=20');
  expect(push.title).toBe('[PREVIEW] Next Level Up · October and November 2026 Provider Update');expect(push.section_config_json).toMatchObject({services:true,amendments:true,spanish_intake:false,school_availability:false,_training:{pin:[{id:'saved-media'}]}});expect(push.amendment_plan_json.mode).toBe('compensation');
  const [[revision]]=await db.query('SELECT * FROM provider_update_content_revisions');expect(revision.snapshot_json.update.title).toBe('October 2026');expect(revision.automation_actor).toBe('migration:1835_nlu_combined_provider_update');expect(revision.applied_at).toBeTruthy();
  const [[media]]=await db.query("SELECT body_html FROM admin_update_topics WHERE topic_key='office_kiosk'");expect(media.body_html).toContain('<video');
  const [[other]]=await db.query('SELECT title FROM admin_updates WHERE id=9');expect(other.title).toBe('ITSCO October');
  const [copies]=await db.query("SELECT e.subject FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.notes='nlu-oct-nov-2026-v1'");expect(copies).toEqual([{subject:'Original local update'}]);
 });
 it('reapplies safely and preserves later manual edits and the original snapshot',async()=>{
  await apply();await db.query("UPDATE admin_updates SET subtitle='Later manual edit' WHERE id=2");await apply();const [[update]]=await db.query('SELECT subtitle FROM admin_updates WHERE id=2');expect(update.subtitle).toBe('Later manual edit');
  const [[count]]=await db.query('SELECT COUNT(*) AS n FROM provider_update_content_revisions');expect(count.n).toBe(1);
 });
 it.each(['issued','real_recipient'])('holds an already-issued or real-invitation draft (%s)',async kind=>{
  if(kind==='issued')await db.query("UPDATE provider_update_pushes SET status='sent',sent_at=UTC_TIMESTAMP() WHERE id=20");else await db.query("UPDATE provider_update_recipients SET token='real_synthetic_invitation' WHERE id=1");
  await apply();const [[update]]=await db.query('SELECT title FROM admin_updates WHERE id=2');expect(update.title).toBe('October 2026');const [[count]]=await db.query('SELECT COUNT(*) AS n FROM provider_update_content_revisions');expect(count.n).toBe(0);
 });
});
