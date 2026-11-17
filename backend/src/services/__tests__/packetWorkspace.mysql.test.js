import {afterAll,beforeAll,expect,it} from 'vitest';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {hasPortalMigrationEnrollment} from '../portalMigrationEnrollment.service.js';
import {readDirectoryPage} from '../../utils/clientDirectoryPage.js';
import {providerScheduleWindowQuery} from '../../utils/providerScheduleWindowQuery.js';
import {firstLoginDedupSql} from '../../utils/notificationFirstLoginDedup.js';
import {beginClientChartImport,completeClientChartImport} from '../clientChartImportProgress.service.js';
import {clientChartSetupNeeds} from '../clientChartSetupNeeds.service.js';
const enabled=!!process.env.GUARDIAN_INVITE_TEST_MYSQL_HOST;
if(process.env.REQUIRE_PACKET_WORKSPACE_MYSQL==='1'&&!enabled)throw Error('Isolated MySQL fixture is required');
let db,admin;const name=`qa_packet_workspace_${process.pid}_${Math.random().toString(36).slice(2,8)}`;
beforeAll(async()=>{if(!enabled)return;
 const config={host:process.env.GUARDIAN_INVITE_TEST_MYSQL_HOST,port:Number(process.env.GUARDIAN_INVITE_TEST_MYSQL_PORT||33316),user:'root',password:'',multipleStatements:true};
 admin=await mysql.createConnection(config);await admin.query(`CREATE DATABASE ${name}`);db=await mysql.createConnection({...config,database:name});
 await db.query(`CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80));CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(80) DEFAULT 'employee',is_active INT DEFAULT 1);CREATE TABLE client_statuses(id INT PRIMARY KEY,label VARCHAR(50),status_key VARCHAR(50));CREATE TABLE paperwork_statuses(id INT PRIMARY KEY,status_key VARCHAR(50));CREATE TABLE insurance_types(id INT PRIMARY KEY,label VARCHAR(50));CREATE TABLE client_paperwork_items(client_id INT,is_needed INT,INDEX(client_id));CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,full_name VARCHAR(80),initials VARCHAR(32),status VARCHAR(50),client_status_id INT,paperwork_status_id INT,provider_id INT,organization_id INT,insurance_type_id INT,INDEX(agency_id));INSERT INTO agencies VALUES(2,'Allowed'),(9,'Other');INSERT INTO client_statuses VALUES(1,'Current','current'),(2,'Pending','pending');INSERT INTO paperwork_statuses VALUES(1,'completed');`);
 await db.query(`ALTER TABLE clients ADD source VARCHAR(50),ADD client_type VARCHAR(50),ADD demographics_phi_enc JSON,ADD date_of_birth DATE,ADD contact_phone VARCHAR(50),ADD email VARCHAR(80),ADD address_street VARCHAR(80),ADD onboarding_docs_json JSON;CREATE TABLE client_intake_note_drafts(client_id INT,status VARCHAR(30),session_context_enc TEXT,INDEX(client_id));CREATE TABLE clinical_treatment_plans(client_id INT,agency_id INT,status VARCHAR(30),title VARCHAR(120),source_tool_id VARCHAR(80),INDEX(client_id,agency_id));`);
 const rows=Array.from({length:906},(_,i)=>[i+1,i<900?2:9,`Client ${String(i+1).padStart(4,'0')}`,i<10?'ARCHIVED':'ACTIVE',i<100?2:1,1,null,null,null]);await db.query('INSERT INTO clients(id,agency_id,full_name,status,client_status_id,paperwork_status_id,provider_id,organization_id,insurance_type_id) VALUES ?',[rows]);
 await db.query(`CREATE TABLE notifications(id INT PRIMARY KEY,type VARCHAR(80),agency_id INT,user_id INT,related_entity_id INT);CREATE TABLE organization_affiliations(organization_id INT,is_active BOOL);CREATE TABLE agency_schools(school_organization_id INT,is_active BOOL);INSERT INTO organization_affiliations VALUES(4,1);INSERT INTO notifications VALUES(1,'first_login',4,20,20),(8,'first_login',2,20,20),(11,'first_login_pending',2,20,20),(2,'first_login',9,20,20),(12,'first_login',2,NULL,NULL),(13,'chat_message',2,20,20);`);
 await db.query(`CREATE TABLE provider_schedule_events(id INT PRIMARY KEY,agency_id INT,provider_id INT,kind VARCHAR(50),recurrence_horizon_held INT DEFAULT 0,all_day INT DEFAULT 0,start_at DATETIME,end_at DATETIME,start_date DATE,end_date DATE,status VARCHAR(30),INDEX(provider_id,agency_id,start_at,end_at));CREATE TABLE provider_schedule_event_attendees(event_id INT,user_id INT,INDEX(user_id));CREATE TABLE scheduled_trainings(event_id INT,agency_visible INT,INDEX(event_id));CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT,INDEX(user_id,agency_id));INSERT INTO users(id,role) VALUES(20,'provider');INSERT INTO user_agencies VALUES(20,2,1);`);
 const events=[
 [1,2,20,'TEAM_MEETING',0,0,'ACTIVE'],[2,2,30,'TEAM_MEETING',0,0,'CANCELLED'],[3,2,30,'TRAINING',0,0,'ACTIVE'],[4,9,20,'FALL_CHECKIN_BOOKED',0,0,'ACTIVE'],
 [5,9,20,'TEAM_MEETING',0,0,'ACTIVE'],[6,2,30,'PRIVATE',0,0,'ACTIVE'],[7,2,20,'TEAM_MEETING',1,0,'ACTIVE'],[8,2,20,'ALL_DAY',0,1,'ACTIVE'],[9,9,30,'TRAINING',0,0,'ACTIVE']
 ].map(([id,agency,provider,kind,held,allDay,status])=>[id,agency,provider,kind,held,allDay,'2026-11-17 10:00:00','2026-11-17 11:00:00','2026-11-17','2026-11-18',status]);
 await db.query('INSERT INTO provider_schedule_events VALUES ?',[events]);await db.query(`INSERT INTO provider_schedule_event_attendees VALUES(1,20),(2,20),(5,20),(6,20);INSERT INTO scheduled_trainings VALUES(3,1),(9,1);`);
},30000);
afterAll(async()=>{if(db)await db.end();if(admin){await admin.query(`DROP DATABASE ${name}`);await admin.end();}});
const query="SELECT c.*,provider.first_name AS provider_first_name FROM clients c LEFT JOIN users provider ON provider.id=c.provider_id LEFT JOIN agencies org ON org.id=c.organization_id LEFT JOIN client_statuses cs ON cs.id=c.client_status_id LEFT JOIN paperwork_statuses ps ON ps.id=c.paperwork_status_id LEFT JOIN insurance_types it ON it.id=c.insurance_type_id WHERE 1=1 AND c.agency_id=? AND c.status<>'ARCHIVED'";
it.skipIf(!enabled)('pages a 900-client agency in MySQL without hydrating other agencies or all 900 charts',async()=>{
 const page=await readDirectoryPage({executor:db,query,values:[2],hasChecklist:true,page:2,perPage:50,sort:'full_name',order:'asc'});expect(page.total).toBe(890);expect(page.items).toHaveLength(50);expect(page.items[0].id).toBe(61);expect(page.items.at(-1).id).toBe(110);expect(page.items.every(c=>c.agency_id===2)).toBe(true);expect(page.summary).toMatchObject({pending:90,completed:800,attention:0});
 const pending=await readDirectoryPage({executor:db,query,values:[2],hasChecklist:true,page:2,perPage:50,sort:'full_name',order:'asc',summaryTone:'pending'});expect(pending.total).toBe(90);expect(pending.items).toHaveLength(40);
});
it.skipIf(!enabled)('deduplicates first logins once, preserving root-agency priority, identity and agency boundaries',async()=>{
 const [rows]=await db.execute(`SELECT n.id FROM notifications n WHERE n.agency_id IN (?,?) AND ${firstLoginDedupSql([2,4])} ORDER BY n.id`,[2,4,2,4]);expect(rows.map(r=>r.id)).toEqual([8,13]);
});

it.skipIf(!enabled)('retains scoped host, invited meeting, agency training, fall visit and cancelled events with indexed candidates',async()=>{
 const input={agencyId:2,providerId:20,windowStart:'2026-11-16 00:00:00',windowEnd:'2026-11-23 00:00:00'};
 const plan=providerScheduleWindowQuery(input);const [rows]=await db.execute(plan.sql,plan.params);expect(rows.map(r=>r.id)).toEqual([8,1,2,3,4]);
 const [all]=await db.execute(providerScheduleWindowQuery({...input,allAgencies:true}).sql,providerScheduleWindowQuery({...input,allAgencies:true}).params);expect(all.map(r=>r.id)).toEqual([8,1,2,3,4,5]);
 expect(rows.find(r=>r.id===2).status).toBe('CANCELLED');expect(rows.some(r=>[6,7,9].includes(r.id))).toBe(false);
});

it.skipIf(!enabled)('persists import progress atomically in MySQL without changing packet evidence or accepting stale completion',async()=>{
 const scope={clientId:101,agencyId:2};await db.execute('UPDATE clients SET onboarding_docs_json=? WHERE id=101',[JSON.stringify({paperPacketSource:{documentId:99}})]);
 expect(await beginClientChartImport(scope,['demographics'],10,{db})).toMatchObject({status:'pending',revision:1});
 await expect(beginClientChartImport({...scope,agencyId:9},['demographics'],10,{db})).rejects.toHaveProperty('status',404);
 await expect(completeClientChartImport(scope,10,{db,readRecord:async()=>({value:{imported:false}})})).rejects.toHaveProperty('status',409);
 expect(await completeClientChartImport(scope,10,{db,readRecord:async()=>({value:{imported:true}})})).toMatchObject({status:'complete',revision:2});
 const[[row]]=await db.execute('SELECT onboarding_docs_json FROM clients WHERE id=101');const docs=typeof row.onboarding_docs_json==='string'?JSON.parse(row.onboarding_docs_json):row.onboarding_docs_json;expect(docs.paperPacketSource).toEqual({documentId:99});
 await beginClientChartImport(scope,['demographics'],10,{db});
 await expect(completeClientChartImport(scope,10,{db,readRecord:async()=>{await db.execute("UPDATE clients SET onboarding_docs_json=JSON_SET(onboarding_docs_json,'$.recordsImport.revision',4) WHERE id=101");return{value:{imported:true}};}})).rejects.toHaveProperty('status',409);
});

it.skipIf(!enabled)('uses the chart setup evidence for Needs in MySQL, including manual demographics and authored plans',async()=>{
 await db.query("UPDATE clients SET source='ADMIN_CREATED',client_type='clinical',onboarding_docs_json=NULL,demographics_phi_enc=NULL,date_of_birth=NULL,address_street=NULL WHERE id IN(101,102,103)");
 await db.query("UPDATE clients SET demographics_phi_enc=JSON_OBJECT('ciphertext','synthetic') WHERE id=102;UPDATE clients SET date_of_birth='2010-01-02',address_street='123 Synthetic Street' WHERE id=103;INSERT INTO client_intake_note_drafts(client_id,status) VALUES(102,'final'),(103,'final');INSERT INTO clinical_treatment_plans(client_id,agency_id,status,title) VALUES(102,2,'active','Intake Treatment Plan (placeholder)'),(103,2,'active','Reviewed treatment plan')");
 expect(Object.fromEntries(await clientChartSetupNeeds([101,102,103],{db,clinicalDb:db}))).toEqual({101:true,102:true,103:false});
 await db.execute("UPDATE clients SET onboarding_docs_json=JSON_OBJECT('recordsImport',JSON_OBJECT('status','complete')) WHERE id=102");
 expect((await clientChartSetupNeeds([102],{db,clinicalDb:db})).get(102)).toBe(true);
 await db.execute("UPDATE clinical_treatment_plans SET status='draft',title='Imported Treatment Plan',source_tool_id='client_records_import:synthetic' WHERE client_id=102");
 expect((await clientChartSetupNeeds([102],{db,clinicalDb:db})).get(102)).toBe(false);
});

it.skipIf(!enabled)('reads transition enrollment using the actual composite-key schema, without inventing an id column',async()=>{
 const migration=readFileSync(new URL('../../../../database/migrations/1674_portal_migration_benefit_notices.sql',import.meta.url),'utf8');
 const ddl=migration.match(/CREATE TABLE IF NOT EXISTS family_portal_migration_enrollments\s*\([\s\S]*?\);/)[0];
 await db.query(ddl);
 expect(await hasPortalMigrationEnrollment({agencyId:2,clientId:101,guardianUserId:20},db)).toBe(false);
 await db.execute("INSERT INTO family_portal_migration_enrollments(agency_id,client_id,guardian_user_id,cohort_label,created_by_user_id) VALUES(2,101,20,'Synthetic transition',10)");
 expect(await hasPortalMigrationEnrollment({agencyId:2,clientId:101,guardianUserId:20},db)).toBe(true);
 for(const scope of [{agencyId:9,clientId:101,guardianUserId:20},{agencyId:2,clientId:102,guardianUserId:20},{agencyId:2,clientId:101,guardianUserId:21}])expect(await hasPortalMigrationEnrollment(scope,db)).toBe(false);
});
