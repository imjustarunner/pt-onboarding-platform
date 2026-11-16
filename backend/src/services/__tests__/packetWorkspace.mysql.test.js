import {afterAll,beforeAll,expect,it} from 'vitest';
import mysql from 'mysql2/promise';
import {readDirectoryPage} from '../../utils/clientDirectoryPage.js';
import {firstLoginDedupSql} from '../../utils/notificationFirstLoginDedup.js';
const enabled=!!process.env.GUARDIAN_INVITE_TEST_MYSQL_HOST;
if(process.env.REQUIRE_PACKET_WORKSPACE_MYSQL==='1'&&!enabled)throw Error('Isolated MySQL fixture is required');
let db,admin;const name=`qa_packet_workspace_${process.pid}_${Math.random().toString(36).slice(2,8)}`;
beforeAll(async()=>{if(!enabled)return;
 const config={host:process.env.GUARDIAN_INVITE_TEST_MYSQL_HOST,port:Number(process.env.GUARDIAN_INVITE_TEST_MYSQL_PORT||33316),user:'root',password:'',multipleStatements:true};
 admin=await mysql.createConnection(config);await admin.query(`CREATE DATABASE ${name}`);db=await mysql.createConnection({...config,database:name});
 await db.query(`CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80));CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80));CREATE TABLE client_statuses(id INT PRIMARY KEY,label VARCHAR(50),status_key VARCHAR(50));CREATE TABLE paperwork_statuses(id INT PRIMARY KEY,status_key VARCHAR(50));CREATE TABLE insurance_types(id INT PRIMARY KEY,label VARCHAR(50));CREATE TABLE client_paperwork_items(client_id INT,is_needed INT,INDEX(client_id));CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,full_name VARCHAR(80),status VARCHAR(50),client_status_id INT,paperwork_status_id INT,provider_id INT,organization_id INT,insurance_type_id INT,INDEX(agency_id));INSERT INTO agencies VALUES(2,'Allowed'),(9,'Other');INSERT INTO client_statuses VALUES(1,'Current','current'),(2,'Pending','pending');INSERT INTO paperwork_statuses VALUES(1,'completed');`);
 const rows=Array.from({length:906},(_,i)=>[i+1,i<900?2:9,`Client ${String(i+1).padStart(4,'0')}`,i<10?'ARCHIVED':'ACTIVE',i<100?2:1,1,null,null,null]);await db.query('INSERT INTO clients VALUES ?',[rows]);
 await db.query(`CREATE TABLE notifications(id INT PRIMARY KEY,type VARCHAR(80),agency_id INT,user_id INT,related_entity_id INT);CREATE TABLE organization_affiliations(organization_id INT,is_active BOOL);CREATE TABLE agency_schools(school_organization_id INT,is_active BOOL);INSERT INTO organization_affiliations VALUES(4,1);INSERT INTO notifications VALUES(1,'first_login',4,20,20),(8,'first_login',2,20,20),(11,'first_login_pending',2,20,20),(2,'first_login',9,20,20),(12,'first_login',2,NULL,NULL),(13,'chat_message',2,20,20);`);
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
