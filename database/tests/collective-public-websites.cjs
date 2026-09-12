// Requires a disposable MySQL 8.4 instance on localhost:33320 with the synthetic-only password.
// Never points at application databases. Creates and drops only collective_check.
const mysql=require('../../backend/node_modules/mysql2/promise');const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'../..');const assert=require('node:assert/strict');
(async()=>{const c=await mysql.createConnection({host:'127.0.0.1',port:33320,user:'root',password:'synthetic-only',multipleStatements:true});try{
 await c.query('CREATE DATABASE collective_check');await c.query('USE collective_check');
 const base=fs.readFileSync(path.join(root,'database/migrations/598_public_marketing_pages.sql'),'utf8').split('CREATE TABLE IF NOT EXISTS public_marketing_page_sources')[0];await c.query(base);
 await c.query(`CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(255),slug VARCHAR(191),organization_type VARCHAR(64),is_active BOOLEAN,is_archived BOOLEAN,public_availability_enabled BOOLEAN,city VARCHAR(100),state VARCHAR(100));
 CREATE TABLE agency_public_service_types(agency_id INT,service_type VARCHAR(32),is_enabled BOOLEAN);
 INSERT INTO agencies(id,name,slug,organization_type,is_active,is_archived,public_availability_enabled) VALUES(1,'Real','real','agency',1,0,1),(2,'Demo','demo','agency',1,0,1),(3,'Burning Sage','burningsage','agency',1,0,1),(4,'School','school','school',1,0,1),(5,'Coach','coach','life_coach',1,0,1),(6,'Archived','archived','agency',1,1,1),(7,'Consulting','consulting','consultant',1,0,1),(8,'Inactive','inactive','agency',0,0,1),(9,'Unpublished booking','private','agency',1,0,0);
 INSERT INTO agency_public_service_types VALUES(1,'counseling',1),(1,'tutoring',1),(5,'coaching',1),(7,'consulting',1),(9,'counseling',1);`);
 const migrations=['1427_mh4kidz_public_website.sql','1428_mental_range_collective.sql'].map(f=>fs.readFileSync(path.join(root,'database/migrations',f),'utf8'));for(const sql of migrations)await c.query(sql);
 let[rows]=await c.query('SELECT agency_id FROM mental_range_memberships ORDER BY agency_id');assert.deepEqual(rows.map(r=>r.agency_id),[1,5,7,9]);
 await c.query("UPDATE mental_range_memberships SET included=0,description='Edited' WHERE agency_id=1; UPDATE public_marketing_pages SET title='Edited',is_active=0;");for(const sql of migrations)await c.query(sql);
 [rows]=await c.query('SELECT * FROM mental_range_memberships WHERE agency_id=1');assert.equal(rows[0].included,0);assert.equal(rows[0].description,'Edited');[rows]=await c.query('SELECT * FROM public_marketing_pages');assert.equal(rows.length,2);assert.ok(rows.every(r=>r.title==='Edited'&&r.is_active===0));
 await c.query(`CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(50),last_name VARCHAR(50),title VARCHAR(50),profile_photo_path VARCHAR(100),provider_accepting_new_clients BOOLEAN,is_active BOOLEAN,is_archived BOOLEAN,status VARCHAR(50),role VARCHAR(50));
 CREATE TABLE user_agencies(user_id INT,agency_id INT);
 CREATE TABLE provider_public_service_enrollments(user_id INT,agency_id INT,service_type VARCHAR(50),is_active BOOLEAN);
 CREATE TABLE provider_public_profiles(user_id INT,public_blurb TEXT,insurances_json JSON,accepting_new_clients_override BOOLEAN);
 CREATE TABLE provider_tutoring_profiles(user_id INT,agency_id INT,bio TEXT,subject_areas_json JSON,grade_levels_json JSON,accepting_new_students BOOLEAN);
 INSERT INTO users(id,first_name,last_name,is_active,is_archived,status,role) VALUES(1,'Published','Provider',1,0,'ACTIVE_EMPLOYEE','provider'),(2,'Archived','Provider',1,1,'ACTIVE_EMPLOYEE','provider'),(3,'Client','Account',1,0,'ACTIVE_EMPLOYEE','client'),(4,'Consulting','Provider',1,0,'ACTIVE_EMPLOYEE','provider'),(5,'No affiliation','Provider',1,0,'ACTIVE_EMPLOYEE','provider');
 INSERT INTO user_agencies VALUES(1,5),(1,9),(2,5),(3,5),(4,7);
 INSERT INTO provider_public_service_enrollments VALUES(1,5,'coaching',1),(1,9,'counseling',1),(2,5,'coaching',1),(3,5,'coaching',1),(4,7,'consulting',1),(5,5,'coaching',1);`);
 const {RANGE_PROVIDER_SQL}=await import(path.join(root,'backend/src/services/mentalRange.service.js'));[rows]=await c.query(RANGE_PROVIDER_SQL);assert.equal(rows.length,1);assert.equal(rows[0].id,1);assert.equal(rows[0].agency_id,5);
 console.log('PASS: both website seeds are repeatable; opt-outs/unpublished content preserved; school/demo/Burning Sage/inactive exclusion; provider SQL excludes private booking, clients, archived staff, consulting, and missing affiliations.');
 }finally{await c.query('DROP DATABASE IF EXISTS collective_check');await c.end();}})().catch(e=>{console.error(e);process.exit(1)});
