// Explicit user-requested ITSCO assignments. Read-only unless --apply is supplied.
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {writeFileSync, mkdirSync} from 'node:fs';
dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
const tasks=[
{key:'celebrations',title:'URGENT: Arrange Mia and wedding celebrations',assignees:[555],description:"Loriana: Arrange a celebration bar for Mia’s graduate-school acceptance and congratulations for the recently married colleague (confirm the recipient). Schedule recognition for Jacque’s upcoming wedding. Confirm the arrangements and schedule by October 13."},
{key:'indirect',title:'URGENT: Disable indirect submissions in TherapyNotes and assess impact',assignees:[3,559],description:"Haley, with Hannah’s help: Remove or unassign indirect time in TherapyNotes and remove it as a code so staff cannot submit it. Report what issues this change would cause and exactly who would be affected."},
{key:'locations',title:'URGENT: Resolve incorrect locations in TherapyNotes',assignees:[559],description:"Hannah: Determine how we are resolving wrong locations. Can entries be rejected, or must corrections be made client document/session by session? If individual corrections are required, bring in Aunya. Report the resolution workflow and next steps."},
{key:'pto',title:'URGENT: Finalize training/PTO balances and reconcile app with ADP',assignees:[539,538],description:"Kaitlyn O’Connell and Melissa: Finalize the training/PTO numbers, update the app with accurate numbers, and remove the corresponding tracking from ADP. Determine whether sick leave must remain in ADP; retain it there if required, otherwise report back."},
{key:'stipend',title:'URGENT: Verify recurring stipend for Aunya and missing recipients',assignees:[539],description:"Kaitlyn O’Connell: Check whether the recurring stipend feature is available and whether Aunya’s weekly indirect time for scheduling, previously configured via Cursor, is correctly scheduled. Identify any other people missing this recurring setup and report back."}
];
const apply=process.argv.includes('--apply');
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:5000,timezone:'+00:00',charset:'utf8mb4_unicode_ci'});
try {
const [[agency]]=await db.execute("SELECT id,name FROM agencies WHERE id=2 AND slug='itsco'");if(!agency)throw Error('ITSCO not verified');
const [people]=await db.execute("SELECT DISTINCT u.id,u.first_name,u.last_name,u.role,u.is_active FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=2 AND u.id IN (3,501,538,539,555,559)");
for(const [id,first,last] of [[3,'Haley','Inyart'],[501,'Michael','Mendez'],[538,'Melissa','Mendez'],[539,'Kaitlyn',"O'Connell"],[555,'Loriana','Pincente'],[559,'Hannah','Inyart']])if(!people.some(p=>p.id===id&&p.first_name===first&&p.last_name===last&&p.is_active&&['admin','super_admin'].includes(p.role)))throw Error('Staff verification failed');
if(!apply){console.log(JSON.stringify({agency,people,tasks,writes:0},null,2));}else{
await db.beginTransaction();const receipt=[];
for(const task of tasks){
const source=`itsco-urgent-2026-10-12:${task.key}`;
const [[existing]]=await db.execute('SELECT id,assigned_to_agency_id FROM tasks WHERE source_ref_type=? AND source_ref_id=? FOR UPDATE',['user_request',source]);
if(existing){
if(existing.assigned_to_agency_id!==2)throw Error('Existing task company mismatch');
if(['pto','stipend'].includes(task.key)){
const [[assigned]]=await db.execute('SELECT user_id FROM task_assignees WHERE task_id=? AND user_id=539',[existing.id]);
if(!assigned){
await db.execute('UPDATE task_assignees SET is_primary=0 WHERE task_id=?',[existing.id]);
await db.execute('INSERT INTO task_assignees (task_id,user_id,is_primary) VALUES (?,539,1)',[existing.id]);
await db.execute("UPDATE tasks SET assigned_to_user_id=539,description=?,metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.pendingKatie',false) WHERE id=?",[task.description,existing.id]);
await db.execute("INSERT INTO task_audit_log (task_id,action_type,actor_user_id,target_user_id,metadata) VALUES (?,'assigned',501,539,?)",[existing.id,JSON.stringify({requestKey:source,reason:'User identified Katie as Kaitlyn O’Connell'})]);
}}
receipt.push({id:existing.id,key:task.key,created:false});continue;}

const metadata=JSON.stringify({requestKey:source,dueLocal:'2026-10-13',timezone:'America/Denver',requestedBy:'Michael Mendez',pendingKatie:false});
const [r]=await db.execute("INSERT INTO tasks (task_type,title,description,status,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,due_date,urgency,is_required,metadata,source_ref_type,source_ref_id) VALUES ('custom',?,?,'pending',?,2,501,'2026-10-14 05:59:00','high',0,?,'user_request',?)",[task.title,task.description,task.assignees[0]||null,metadata,source]);
for(const uid of task.assignees){await db.execute('INSERT INTO task_assignees (task_id,user_id,is_primary) VALUES (?,?,?)',[r.insertId,uid,uid===task.assignees[0]?1:0]);}
await db.execute("INSERT INTO task_audit_log (task_id,action_type,actor_user_id,target_user_id,metadata) VALUES (?,'assigned',501,?,?)",[r.insertId,task.assignees[0]||null,metadata]);
receipt.push({id:r.insertId,key:task.key,created:true});}
await db.commit();
const [verified]=await db.execute("SELECT t.id,t.title,t.urgency,CAST(t.due_date AS CHAR) AS due_date_utc,t.assigned_to_agency_id,GROUP_CONCAT(CONCAT(u.first_name,' ',u.last_name) ORDER BY ta.is_primary DESC SEPARATOR ', ') AS assignees FROM tasks t LEFT JOIN task_assignees ta ON ta.task_id=t.id LEFT JOIN users u ON u.id=ta.user_id WHERE t.source_ref_type='user_request' AND t.source_ref_id LIKE 'itsco-urgent-2026-10-12:%' GROUP BY t.id ORDER BY t.id");
const result={applied:true,agency,recordedAt:new Date().toISOString(),receipt,verified,notificationsSent:false,pending:null};mkdirSync(new URL('../../../deliverables/itsco-urgent-tasks/',import.meta.url),{recursive:true});writeFileSync(new URL('../../../deliverables/itsco-urgent-tasks/receipt.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
}catch(e){await db.rollback();throw e;}finally{await db.end();}
