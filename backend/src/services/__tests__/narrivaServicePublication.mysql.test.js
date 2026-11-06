import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
import {listNarrivaClinicalAgencies,publishNarrivaServiceAmendment} from '../narrivaServicePublication.service.js';
import {H2011_HANDBOOK_SLUG,NARRIVA_SERVICE_RELEASE} from '../../content/narrivaServiceHandbookAmendment.js';
const socket=process.env.NARRIVA_MYSQL_SOCKET;
const suite=socket||process.env.NARRIVA_MYSQL_TEST==='1'?describe:describe.skip;
let conn,db;
const migration=readFileSync(new URL('../../../../database/migrations/1772_narriva_h2011_service_reference.sql',import.meta.url),'utf8');
suite('H2011 migration and publication against MySQL',()=>{
 beforeAll(async()=>{
  conn=await mysql.createConnection({...(socket?{socketPath:socket}:{host:'127.0.0.1',port:Number(process.env.NARRIVA_MYSQL_PORT||3306),password:process.env.NARRIVA_MYSQL_PASSWORD||''}),user:'root',multipleStatements:true});
  await conn.query('CREATE DATABASE IF NOT EXISTS narriva_services_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.changeUser({database:'narriva_services_test'});
  await conn.query(`DROP TABLE IF EXISTS workplace_handbook_digest_entries,workplace_handbook_digests,workplace_handbook_sections,workplace_handbook_versions,workplace_handbook_documents,provider_update_pushes,admin_updates,tenant_services,payroll_service_code_rules,agency_medical_service_codes,agency_business_types,credential_service_code_eligibility,scheduling_service_codes,agencies;
  CREATE TABLE agencies(id INT PRIMARY KEY,slug VARCHAR(100),is_active TINYINT,organization_type VARCHAR(40));
  CREATE TABLE agency_business_types(agency_id INT,business_type VARCHAR(64),is_enabled TINYINT);
  CREATE TABLE scheduling_service_codes(code VARCHAR(32) PRIMARY KEY,label VARCHAR(160),is_billable TINYINT,default_note_type VARCHAR(40),min_duration_minutes INT,is_active TINYINT);
  CREATE TABLE credential_service_code_eligibility(credential_tier VARCHAR(40),service_code VARCHAR(32),allowed TINYINT,PRIMARY KEY(credential_tier,service_code));
  CREATE TABLE agency_medical_service_codes(agency_id INT,service_code VARCHAR(32),description VARCHAR(500),unit_calc_mode VARCHAR(40),unit_minutes INT,min_minutes INT,max_minutes INT,max_units_per_session INT,max_units_per_day INT,ladder_bands_json JSON,overflow_service_code VARCHAR(32),overflow_at_minutes INT,allowed_credential_tiers_json JSON,is_addon TINYINT,is_active TINYINT,session_mode VARCHAR(20),PRIMARY KEY(agency_id,service_code));
  CREATE TABLE payroll_service_code_rules(agency_id INT,service_code VARCHAR(64),category VARCHAR(40),other_slot INT,unit_to_hour_multiplier DECIMAL(12,4),duration_minutes INT,counts_for_tier TINYINT,tier_credit_multiplier DECIMAL(12,4),pay_divisor DECIMAL(12,4),pay_rate_unit VARCHAR(40),credit_value DECIMAL(12,4),show_in_rate_sheet TINYINT,PRIMARY KEY(agency_id,service_code));
  CREATE TABLE tenant_services(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,business_type VARCHAR(64),name VARCHAR(200),description TEXT,service_code VARCHAR(32),default_duration_minutes INT,allows_individual TINYINT,allows_group TINYINT,modality VARCHAR(32),price_cents INT,billing_method VARCHAR(64),is_publicly_bookable TINYINT,is_staff_bookable TINYINT,package_eligible TINYINT,program_eligible TINYINT,is_active TINYINT,sort_order INT);
  CREATE TABLE admin_updates(id INT PRIMARY KEY,agency_id INT,status VARCHAR(32),title VARCHAR(180));
  CREATE TABLE provider_update_pushes(id INT PRIMARY KEY,agency_id INT,status VARCHAR(32),title VARCHAR(255));
  CREATE TABLE workplace_handbook_documents(id INT PRIMARY KEY,agency_id INT UNIQUE,published_version_id INT);
  CREATE TABLE workplace_handbook_versions(id INT AUTO_INCREMENT PRIMARY KEY,document_id INT,agency_id INT,version_number INT,is_draft TINYINT,source_revision VARCHAR(64),metadata_json JSON,changelog TEXT,published_at DATETIME,published_by_user_id INT);
  CREATE TABLE workplace_handbook_sections(id INT AUTO_INCREMENT PRIMARY KEY,version_id INT,agency_id INT,sort_order INT,slug VARCHAR(128),title VARCHAR(255),body_html MEDIUMTEXT,parent_slug VARCHAR(128),source_page INT,content_status VARCHAR(20),source_body_hash VARCHAR(64),UNIQUE KEY(version_id,slug));
  CREATE TABLE workplace_handbook_digests(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,title VARCHAR(255),period_label VARCHAR(64),status VARCHAR(20),notes TEXT,admin_update_id INT,provider_update_push_id INT,published_at DATETIME,published_by_user_id INT);
  CREATE TABLE workplace_handbook_digest_entries(id INT AUTO_INCREMENT PRIMARY KEY,digest_id INT,agency_id INT,sort_order INT,subject VARCHAR(500),rationale TEXT,changed_content MEDIUMTEXT,handbook_section_slug VARCHAR(128),change_kind VARCHAR(32),handbook_version_id INT);
  INSERT INTO agencies VALUES(1,'itsco',1,NULL),(2,'nlu',1,NULL),(3,'coach',1,NULL),(4,'school',1,'school'),(5,'inactive',0,NULL),(6,'custom-clinical',1,NULL);
  INSERT INTO agency_business_types VALUES(1,'mental_health',1),(2,'mental_health',1),(3,'coaching',1),(4,'mental_health',1),(5,'mental_health',1),(6,'healthcare',1);
  INSERT INTO agency_medical_service_codes(agency_id,service_code,is_active) VALUES(1,'H0004',1),(2,'H2011',0);
  UPDATE agency_medical_service_codes SET description='Agency-specific',max_units_per_session=9 WHERE agency_id=2;
  INSERT INTO credential_service_code_eligibility VALUES('bachelors','H2011',0);
  INSERT INTO payroll_service_code_rules(agency_id,service_code,pay_divisor) VALUES(2,'H2011',9);
  INSERT INTO tenant_services(agency_id,service_code,is_active,price_cents) VALUES(2,'H2011',0,9999);
  INSERT INTO admin_updates VALUES(2,1,'draft','November 2026 Updates');
  INSERT INTO provider_update_pushes VALUES(2,1,'draft','November 2026 Provider Update');
  INSERT INTO workplace_handbook_documents VALUES(1,1,11),(2,2,12);
  INSERT INTO workplace_handbook_versions(id,document_id,agency_id,version_number,is_draft,metadata_json) VALUES(11,1,1,1,0,'{"keep":"company-specific"}'),(12,2,2,1,0,'{}'),(13,2,2,2,1,'{}');
  INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html,content_status) VALUES(11,1,0,'welcome','Company welcome','<p>Keep exact approved wording</p>','ready'),(12,2,0,'welcome','Company welcome','<p>Keep current edition</p>','ready'),(13,2,0,'welcome','Working draft','<p>Do not publish or alter my unfinished draft</p>','ready');
  INSERT INTO workplace_handbook_digests(id,agency_id,title,period_label,status,notes) VALUES(20,1,'November 2026 Draft','November 2026','draft','unrelated-november'),(21,1,'October 2026 Draft','October 2026','draft','unrelated-october');
  INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,subject,changed_content) VALUES(20,1,'Unfinished other policy','<p>Do not publish</p>');`);
  await conn.query(migration);await conn.query(migration);
  db={execute:(...args)=>conn.execute(...args),getConnection:async()=>({execute:(...args)=>conn.execute(...args),beginTransaction:()=>conn.beginTransaction(),commit:()=>conn.commit(),rollback:()=>conn.rollback(),release:()=>{}})};
 });
 afterAll(async()=>{if(conn)await conn.end();});
 it('selects only active clinical companies and is retry-safe',async()=>{
  expect((await listNarrivaClinicalAgencies(db)).map(a=>a.id)).toEqual([1,2,6]);
  const [rows]=await conn.execute("SELECT agency_id,max_units_per_session,max_minutes,overflow_service_code,ladder_bands_json FROM agency_medical_service_codes WHERE service_code='H2011' ORDER BY agency_id");
  expect(rows).toHaveLength(3);expect(rows[0]).toMatchObject({agency_id:1,max_units_per_session:16,max_minutes:247,overflow_service_code:null});
  expect(rows[0].ladder_bands_json).toHaveLength(16);
 });
 it('preserves agency overrides, disabled entries, saved prices and global denials',async()=>{
  const [[medical]]=await conn.execute("SELECT * FROM agency_medical_service_codes WHERE agency_id=2 AND service_code='H2011'");expect(medical).toMatchObject({is_active:0,max_units_per_session:9,description:'Agency-specific'});
  const [[pay]]=await conn.execute("SELECT pay_divisor FROM payroll_service_code_rules WHERE agency_id=2 AND service_code='H2011'");expect(Number(pay.pay_divisor)).toBe(9);
  const [[booking]]=await conn.execute("SELECT price_cents,is_active FROM tenant_services WHERE agency_id=2 AND service_code='H2011'");expect(booking).toMatchObject({price_cents:9999,is_active:0});
  const [[grant]]=await conn.execute("SELECT allowed FROM credential_service_code_eligibility WHERE credential_tier='bachelors' AND service_code='H2011'");expect(grant.allowed).toBe(0);
 });
 it('adds one separate November draft per company without changing October or other draft content',async()=>{
  const [digests]=await conn.execute('SELECT * FROM workplace_handbook_digests WHERE notes=?',[NARRIVA_SERVICE_RELEASE]);expect(digests).toHaveLength(3);
  expect(digests.find(d=>d.agency_id===1)).toMatchObject({status:'draft',period_label:'November 2026',admin_update_id:2,provider_update_push_id:2});
  const [[old]]=await conn.execute('SELECT * FROM workplace_handbook_digests WHERE id=21');expect(old).toMatchObject({status:'draft',notes:'unrelated-october'});
 });
 it('previews without inserting or publishing anything',async()=>{
  const result=await publishNarrivaServiceAmendment({agencyId:1},db);expect(result).toMatchObject({applied:false,handbookStatus:'ready-to-publish',digestStatus:'ready-to-publish'});
  const [[count]]=await conn.execute('SELECT COUNT(*) AS n FROM workplace_handbook_versions');expect(count.n).toBe(3);
 });
 it('publishes only the additive immutable handbook version and its own internal November addendum',async()=>{
  const result=await publishNarrivaServiceAmendment({agencyId:1,apply:true},db);expect(result).toMatchObject({handbookStatus:'published',digestStatus:'published'});
  const [[old]]=await conn.execute('SELECT body_html FROM workplace_handbook_sections WHERE version_id=11');expect(old.body_html).toBe('<p>Keep exact approved wording</p>');
  const [current]=await conn.execute('SELECT slug,body_html FROM workplace_handbook_sections WHERE version_id=?',[result.versionId]);expect(current.find(s=>s.slug==='welcome').body_html).toBe(old.body_html);expect(current.some(s=>s.slug===H2011_HANDBOOK_SLUG)).toBe(true);
  const [[metadata]]=await conn.execute('SELECT metadata_json FROM workplace_handbook_versions WHERE id=?',[result.versionId]);expect(metadata.metadata_json).toEqual({keep:'company-specific'});
  const [[other]]=await conn.execute('SELECT status FROM workplace_handbook_digests WHERE id=20');expect(other.status).toBe('draft');
  expect(await publishNarrivaServiceAmendment({agencyId:1,apply:true},db)).toMatchObject({handbookStatus:'already-published',digestStatus:'already-published'});
 });
 it('preserves an unfinished handbook draft while publishing the independent November addendum',async()=>{
  expect(await publishNarrivaServiceAmendment({agencyId:2,apply:true},db)).toMatchObject({handbookStatus:'draft-collision',digestStatus:'published'});
  const [[doc]]=await conn.execute('SELECT published_version_id FROM workplace_handbook_documents WHERE agency_id=2');expect(doc.published_version_id).toBe(12);
  const [[draft]]=await conn.execute('SELECT is_draft FROM workplace_handbook_versions WHERE id=13');expect(draft.is_draft).toBe(1);
  const [[text]]=await conn.execute('SELECT body_html FROM workplace_handbook_sections WHERE version_id=13');expect(text.body_html).toContain('Do not publish or alter');
 });
 it('rolls back a new handbook version when November publication fails',async()=>{
  await conn.query(`INSERT INTO agencies VALUES(7,'rollback-clinical',1,NULL); INSERT INTO agency_business_types VALUES(7,'mental_health',1); INSERT INTO workplace_handbook_documents VALUES(7,7,17); INSERT INTO workplace_handbook_versions(id,document_id,agency_id,version_number,is_draft,metadata_json) VALUES(17,7,7,1,0,'{}'); INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html,content_status) VALUES(17,7,0,'welcome','Keep','<p>Preserve</p>','ready')`);
  await conn.query(migration);
  const failDb={getConnection:async()=>({execute:(sql,args)=>sql.startsWith('UPDATE workplace_handbook_digests SET')?Promise.reject(new Error('Synthetic storage failure')):conn.execute(sql,args),beginTransaction:()=>conn.beginTransaction(),commit:()=>conn.commit(),rollback:()=>conn.rollback(),release:()=>{}})};
  await expect(publishNarrivaServiceAmendment({agencyId:7,apply:true},failDb)).rejects.toThrow('Synthetic storage failure');
  const [[doc]]=await conn.execute('SELECT published_version_id FROM workplace_handbook_documents WHERE agency_id=7');expect(doc.published_version_id).toBe(17);
  const [[versions]]=await conn.execute('SELECT COUNT(*) AS n FROM workplace_handbook_versions WHERE agency_id=7');expect(versions.n).toBe(1);
 });
 it('does not reactivate a disabled code through a missing sibling catalog',async()=>{
  await conn.query(`INSERT INTO agencies VALUES(8,'disabled-medical',1,NULL),(9,'disabled-booking',1,NULL); INSERT INTO agency_business_types VALUES(8,'mental_health',1),(9,'mental_health',1); INSERT INTO agency_medical_service_codes(agency_id,service_code,is_active) VALUES(8,'H2011',0); INSERT INTO tenant_services(agency_id,service_code,is_active) VALUES(9,'H2011',0)`);
  await conn.query(migration);
  const [medical]=await conn.execute("SELECT agency_id FROM agency_medical_service_codes WHERE agency_id=9 AND service_code='H2011'");expect(medical).toEqual([]);
  const [booking]=await conn.execute("SELECT agency_id FROM tenant_services WHERE agency_id=8 AND service_code='H2011'");expect(booking).toEqual([]);
  const [pay]=await conn.execute("SELECT agency_id FROM payroll_service_code_rules WHERE agency_id IN(8,9) AND service_code='H2011'");expect(pay).toEqual([]);
 });
 it('rejects nonclinical/nested/inactive agencies without touching data',async()=>{
  for(const agencyId of [3,4,5])await expect(publishNarrivaServiceAmendment({agencyId,apply:true},db)).rejects.toMatchObject({status:404});
 });
});
