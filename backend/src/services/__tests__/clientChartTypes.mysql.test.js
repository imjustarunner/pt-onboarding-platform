import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import mysql from 'mysql2/promise';
import {attachGuardianSchoolAffiliations} from '../guardianSchoolAffiliations.service.js';
import {readFileSync} from 'node:fs';
import {classifyClient,personalContactReviewReason,readChartTypes,requireTypeAccess,saveChartTypes} from '../clientChartTypes.service.js';
import {putClientContactEmail} from '../../controllers/clientContactEmail.controller.js';
import {browseHubPeople, resolveHubPerson} from '../messagesHub.service.js';
import {resolveEmailClientFiling,linkConversationClients,listClientEmailThreads} from '../clientConversationRecord.service.js';

const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>state.db.execute(...args),getConnection:()=>state.db.getConnection()},onTableWrite:vi.fn()}));
const client={id:12,agency_id:2,status:'ACTIVE',client_status_key:'current',date_of_birth:'1990-05-10'};
const active=service_kind=>({service_kind,is_active:1});
function types(changes) {
  return classifyClient({client,agencyId:2,services:[],organizations:[],links:[],...changes},'2026-11-22').types;
}
it('combines active services without converting a named program into a school',()=>{
  expect(types({services:[active('counseling'),active('tutoring')],links:[{relationship_type:'guardian'}],
    organizations:[{name:'Parent Child Partnership',organization_type:'program'}]})).toEqual(['clinical','learning','dependent']);
  expect(types({services:[active('coaching')]})).toEqual(['coaching']);
  expect(types({services:[active('consultation')]})).toEqual(['consulting']);
});
it('derives Dependent from an authorized relationship or a current minor without an established self portal',()=>{
  const minor={...client,date_of_birth:'2016-01-01'};
  expect(types({client:minor})).toEqual(['dependent']);
  expect(types({client:minor,links:[{relationship_type:'self',established:1}]})).toEqual([]);
  expect(types({client:minor,links:[{relationship_type:'self',established:1},{relationship_type:'guardian'}]})).toEqual(['dependent']);
  expect(types({client:{...minor,status:'ARCHIVED'}})).toEqual([]);
  expect(types({links:[{relationship_type:'guardian',permissions_json:{relationshipRevoked:true}}]})).toEqual([]);
  expect(types({links:[{relationship_type:'guardian',permissions_json:{learningOnly:true,serviceAgencyIds:[9]}}]})).toEqual([]);
});
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET,port=Number(process.env.SCHEDULING_TEST_MYSQL_PORT||0);
const connection={...(socketPath?{socketPath}:{host:'127.0.0.1',port}),user:'root',password:process.env.SESSION_COUNT_TEST_MYSQL_PASSWORD||''};
const database=`client_chart_types_test_${process.pid}`;
const admin={id:1,role:'admin'};
describe.skipIf(!socketPath&&!port)('chart services and client email on isolated MySQL',()=>{
  let server;
  beforeAll(async()=>{
    server=await mysql.createConnection(connection);
    await server.query(`CREATE DATABASE ${database}`);
    state.db=mysql.createPool({...connection,database,connectionLimit:3});
    const DDL=[
      'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,provider_id INT,full_name VARCHAR(80),initials VARCHAR(12),client_type VARCHAR(24),email VARCHAR(255),date_of_birth DATE,status VARCHAR(20),client_status_id INT,contact_phone VARCHAR(32),identifier_code VARCHAR(24),session_sms_opt_in INT,guardian_portal_enabled INT,compliance_archived_at DATETIME)',
      'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80),organization_type VARCHAR(24),is_active INT,is_archived INT,logo_path TEXT,logo_url TEXT,slug VARCHAR(80),feature_flags JSON)',
      'CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(24),email VARCHAR(80),username VARCHAR(80),personal_email VARCHAR(80),status VARCHAR(24),is_active INT,is_archived INT,password_hash VARCHAR(80),temporary_password_hash VARCHAR(80),terminated_at DATETIME,status_expires_at DATETIME,first_name VARCHAR(20),last_name VARCHAR(20))',
      'CREATE TABLE client_statuses(id INT PRIMARY KEY,status_key VARCHAR(24))',
      'CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,relationship_type VARCHAR(24),relationship_title VARCHAR(24),access_enabled INT,permissions_json JSON)',
      'CREATE TABLE dependent_portal_access(client_id INT,user_id INT,revoked_at DATETIME)',
      'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT,agency_role VARCHAR(40))',
      'CREATE TABLE user_agency_access_profiles(user_id INT,agency_id INT,effective_role VARCHAR(40))',
      'CREATE TABLE client_agency_assignments(client_id INT,agency_id INT,is_active INT)',
      'CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active INT)',
      'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active INT)',
      'CREATE TABLE agency_schools(agency_id INT,school_organization_id INT,is_active INT)',
      'CREATE TABLE client_service_enrollments(client_id INT,agency_id INT,provider_user_id INT,service_kind VARCHAR(24),label VARCHAR(80),is_active INT,service_status VARCHAR(24))',
      'CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active INT)',
      'CREATE TABLE supervisor_assignments(supervisor_id INT,supervisee_id INT,agency_id INT)',
      'CREATE TABLE agency_contacts(client_id INT,agency_id INT,email VARCHAR(80),is_active INT)',
      'CREATE TABLE client_access_logs(client_id INT,user_id INT,user_role VARCHAR(24),action VARCHAR(80),route VARCHAR(80),method VARCHAR(8),ip_address VARCHAR(44),user_agent TEXT)',
      'CREATE TABLE communication_links(conversation_id INT,entity_type VARCHAR(25),entity_id INT,label VARCHAR(80),UNIQUE KEY link_id(conversation_id,entity_type,entity_id))',
      'CREATE TABLE communication_conversations(id INT,agency_id INT,subject VARCHAR(80),channel VARCHAR(10),last_message_at DATETIME)',
      'CREATE TABLE communication_messages(id INT,conversation_id INT,is_internal_note INT,send_status VARCHAR(24))'
    ];
    for(const sql of DDL)await state.db.query(sql);
    const migration=readFileSync(new URL('../../../../database/migrations/1864_client_chart_type_selections.sql',import.meta.url),'utf8');
    for(let run=0;run<2;run++)for(const sql of migration.split(';').filter(s=>s.trim()))await state.db.query(sql);
    for(const sql of [
      "INSERT INTO agencies(id,name,organization_type,is_active,is_archived) VALUES(2,'Practice','agency',1,0),(3,'Second practice','agency',1,0),(4,'Counseling and Psychotherapy','clinical',1,0),(5,'Pine School','school',1,0)",
      "INSERT INTO clients(id,agency_id,organization_id,full_name,initials,client_type,date_of_birth,status,client_status_id) VALUES(12,2,4,'Jordan Example','JE','basic_nonclinical','1990-05-10','ACTIVE',1)",
      "INSERT INTO client_statuses VALUES(1,'current')",
      "INSERT INTO users(id,role,status,is_active,is_archived) VALUES(1,'admin','ACTIVE',1,0),(2,'provider','ACTIVE',1,0),(3,'admin','ACTIVE',1,0)",
      'INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(1,2,1),(2,2,1),(3,3,1)',
      'INSERT INTO client_agency_assignments VALUES(12,3,1)',
      'INSERT INTO organization_affiliations VALUES(2,4,1),(2,5,1)',
      "INSERT INTO client_service_enrollments VALUES(12,2,2,'counseling','Counseling',1,'active')"
    ])await state.db.query(sql);
  });
  afterAll(async()=>{
    await state.db?.end();
    if(server){await server.query(`DROP DATABASE IF EXISTS ${database}`);await server.end();}
  });
  it('handles mixed production email collations while preserving shared-address and existing-login review',async()=>{
    await state.db.query('ALTER TABLE clients MODIFY email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    for(const field of ['email','username','personal_email'])await state.db.query(`ALTER TABLE users MODIFY ${field} VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await state.db.query("INSERT INTO clients(id,agency_id,email) VALUES(901,2,' Unique@Synthetic.example '),(902,2,'other@synthetic.example')");
    expect(await personalContactReviewReason(901,state.db)).toBeNull();
    await state.db.query("UPDATE clients SET email='unique@synthetic.example' WHERE id=902");
    expect(await personalContactReviewReason(901,state.db)).toBe('shared_email');
    await state.db.query('DELETE FROM clients WHERE id=902');
    await state.db.query("INSERT INTO users(id,role,username) VALUES(903,'provider','unique@synthetic.example')");
    expect(await personalContactReviewReason(901,state.db)).toBe('review_identity');
    await state.db.query('DELETE FROM users WHERE id=903');await state.db.query('DELETE FROM clients WHERE id=901');
  });
  it('inventories school and organization mappings before any type selections exist',async()=>{
    await state.db.query("UPDATE agencies SET slug='counseling-and-psychotherapy-2' WHERE id=4");
    await state.db.query("INSERT INTO agencies(id,name,organization_type,is_active,is_archived) VALUES(6,'Counseling and Psychotherapy','program',1,0)");
    await state.db.query("INSERT INTO clients(id,agency_id,client_type,organization_id) VALUES(101,2,'school',5),(102,2,'school',NULL),(103,2,'basic_nonclinical',6)");
    const sql=readFileSync(new URL('../../scripts/reviewSchoolClinicalRollout.sql',import.meta.url),'utf8');
    const [one]=await state.db.query(sql), [two]=await state.db.query(sql);
    expect(two).toEqual(one);
    const counts=Object.fromEntries(Object.entries(one.find(row=>row.agency_id===2)).map(([key,n])=>[key,Number(n)]));
    expect(counts).toMatchObject({active_school_assignments:1,legacy_school_charts:2,
      review_legacy_school_without_active_assignment:1,verified_clinical_group_charts:1,review_organization_identity:1});
  });
  it('persists independent agency selections and audits them without editing historical enrollments',async()=>{
    expect((await readChartTypes(12,2)).types).toEqual(['clinical']);
    const input={types:['consulting'],revision:0,suppressMinorDefault:false};
    const saved=await saveChartTypes(admin,12,2,input);
    expect(saved.types).toEqual(['clinical','consulting']);
    await expect(saveChartTypes(admin,12,2,input)).rejects.toMatchObject({status:409});
    await expect(saveChartTypes(admin,12,3,input)).rejects.toMatchObject({status:403});
    await expect(requireTypeAccess({id:2,role:'provider'},12,2,{write:true})).rejects.toMatchObject({status:403});
    expect((await readChartTypes(12,3)).types).toEqual([]);
    await state.db.query('INSERT INTO client_organization_assignments VALUES(12,5,1)');
    expect((await readChartTypes(12,2)).types).toContain('school');
    expect((await readChartTypes(12,3)).schools).toEqual([]);
    await state.db.query('UPDATE client_organization_assignments SET is_active=0 WHERE client_id=12 AND organization_id=5');
    expect((await readChartTypes(12,2)).types).toEqual(['clinical','consulting']);
    const [history]=await state.db.query('SELECT agency_id,changed_by_user_id,revision FROM client_chart_type_history');
    expect(history).toEqual([{agency_id:2,changed_by_user_id:1,revision:1}]);
  });
  it('keeps a legacy School chart clinical in its own agency and recalculates after the school ends',async()=>{
    await state.db.query("INSERT INTO clients(id,agency_id,client_type,date_of_birth,status,client_status_id) VALUES(78,2,'school','1990-01-01','ACTIVE',1)");
    await state.db.query('INSERT INTO client_agency_assignments VALUES(78,3,1)');
    const read=()=>readChartTypes(78,2);
    expect(await read()).toMatchObject({types:['clinical','school'],schools:[],portalSetup:{state:'add_email'}});
    expect((await readChartTypes(78,3)).types).toEqual([]);
    await state.db.query('INSERT INTO client_organization_assignments VALUES(78,5,1)');
    expect(await read()).toMatchObject({types:['clinical','school'],schools:['Pine School'],selected:[]});
    await state.db.query('UPDATE client_organization_assignments SET is_active=0 WHERE client_id=78');
    expect((await read()).types).toEqual([]);
    const saved=await saveChartTypes(admin,78,2,{types:['school'],suppressMinorDefault:false,revision:0});
    expect(saved).toMatchObject({types:['clinical','school'],selected:['school'],schools:[],portalSetup:{portal:'auricwell'}});
    const clinical=await saveChartTypes(admin,78,2,{types:['clinical'],suppressMinorDefault:false,revision:1});
    expect(clinical.types).toEqual(['clinical']);
  });
  it('recalculates a minor’s default from actual account and relationship state',async()=>{
    await state.db.query("INSERT INTO clients(id,agency_id,date_of_birth,status,client_status_id) VALUES(13,2,DATE_SUB(CURDATE(), INTERVAL 12 YEAR),'ACTIVE',1)");
    await state.db.query("INSERT INTO users(id,role,status,is_active,is_archived,password_hash,temporary_password_hash) VALUES(10,'client','ACTIVE',1,0,'fixture','setup'),(11,'client_guardian','ACTIVE',1,0,NULL,NULL)");
    await state.db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,access_enabled) VALUES(13,10,'self',1)");
    const types = async () => (await readChartTypes(13,2)).types;
    expect(await types()).toEqual(['dependent']);
    await state.db.query('UPDATE users SET temporary_password_hash=NULL WHERE id=10');
    expect(await types()).toEqual([]);
    await state.db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,access_enabled) VALUES(13,11,'guardian',1)");
    expect(await types()).toEqual(['dependent']);
    await state.db.query("UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=11");
    expect(await types()).toEqual([]);
  });
  it('starts Auricwell setup for mixed services, moves a shared address to review and reuses an established self account',async()=>{
    const id=60;
    await state.db.query("INSERT INTO clients(id,agency_id,client_type,date_of_birth,status,client_status_id) VALUES(60,2,'learning','1990-01-01','ACTIVE',1),(61,2,'learning','1990-01-01','ACTIVE',1)");
    expect((await readChartTypes(id,2)).portalSetup).toBeNull();
    const profile=await saveChartTypes(admin,id,2,{types:['clinical','learning'],revision:0,suppressMinorDefault:false});
    expect(profile.portalSetup).toEqual({portal:'auricwell',state:'add_email'});
    await state.db.query("UPDATE clients SET email='adult@synthetic.example' WHERE id=60");
    expect((await readChartTypes(id,2)).portalSetup.state).toBe('confirm_ownership');
    await state.db.query("UPDATE clients SET email='adult@synthetic.example' WHERE id=61");
    expect((await readChartTypes(id,2)).portalSetup.state).toBe('shared_email');
    await state.db.query("INSERT INTO users(id,role,email,status,is_active,password_hash) VALUES(65,'client','verified@synthetic.example','ACTIVE',1,'fixture')");
    await state.db.query("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,access_enabled) VALUES(60,65,'self',1)");
    expect((await readChartTypes(id,2)).portalSetup.state).toBe('active');
    await state.db.query("UPDATE users SET status='PENDING_SETUP',password_hash=NULL WHERE id=65");
    expect((await readChartTypes(id,2)).portalSetup.state).toBe('prepared');
    await state.db.query("UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=65");
    await state.db.query("UPDATE clients SET email=NULL WHERE id=61");
    expect((await readChartTypes(id,2)).portalSetup.state).toBe('review_identity');
    const [[{n}]]=await state.db.query('SELECT COUNT(*) n FROM client_guardians WHERE client_id=60');
    expect(n).toBe(1);
  });
  it('retains prior selections in the audit when a chart is removed',async()=>{
    await state.db.query("INSERT INTO clients(id,agency_id,status) VALUES(77,2,'ACTIVE')");
    await saveChartTypes(admin,77,2,{types:['coaching'],suppressMinorDefault:false,revision:0});
    await state.db.query('DELETE FROM clients WHERE id=77');
    expect((await state.db.query('SELECT revision FROM client_chart_type_selections WHERE client_id=77'))[0]).toEqual([]);
    expect((await state.db.query('SELECT revision,changed_by_user_id FROM client_chart_type_history WHERE client_id=77'))[0]).toEqual([{revision:1,changed_by_user_id:1}]);
  });
  it('finds an accountless client before email entry and preserves the selected chart through filing and reopening',async()=>{
    const browse=()=>browseHubPeople({agencyId:2,userId:2,browse:'caseload',q:'Jordan'});
    const [missing]=await browse();
    expect(missing).toMatchObject({personKey:'client:12@2',email:null,schoolName:null});
    const req={user:admin,params:{id:'12'},query:{agencyId:'2'},body:{email:'jordan@example.test',previousEmail:''}};
    const res={status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn()};
    const next=vi.fn();
    await putClientContactEmail(req,res,next);
    expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({clientId:12,agencyId:2,email:'jordan@example.test'});
    await putClientContactEmail({...req,body:{...req.body,email:'other@example.test'}},res,next);
    expect(res.status).toHaveBeenCalledWith(409);
    const [found]=await browse();
    expect(found.email).toBe('jordan@example.test');
    const person=await resolveHubPerson({agencyId:2,userId:2,personKey:found.personKey});
    expect(person).toMatchObject({clientId:12,agencyId:2,email:found.email});
    expect((await state.db.query('SELECT id FROM users WHERE email=?',[found.email]))[0]).toEqual([]);
    const filing=await resolveEmailClientFiling({agencyId:2,userId:2,to:found.email,clientIds:[12]});
    await state.db.query("INSERT INTO communication_conversations VALUES(99,2,'Example correspondence','email',NOW())");
    await state.db.query("INSERT INTO communication_messages VALUES(100,99,0,'sent')");
    await linkConversationClients(99,filing.clientIds);
    expect((await listClientEmailThreads(12,2)).map(t=>t.id)).toEqual([99]);
    expect(await listClientEmailThreads(12,3)).toEqual([]);
  });
  it('shows a guardian the assigned school provider and each current staff member’s effective release',async()=>{
    for (const sql of [
      'ALTER TABLE clients ADD roi_expires_at DATE, ADD service_day VARCHAR(20)',
      'ALTER TABLE agencies ADD phone_number VARCHAR(32)',
      'ALTER TABLE users ADD work_email VARCHAR(100), ADD phone_number VARCHAR(32), ADD title VARCHAR(80)',
      'ALTER TABLE client_organization_assignments ADD is_primary INT',
      'ALTER TABLE client_provider_assignments ADD organization_id INT, ADD service_day VARCHAR(20)',
      'CREATE TABLE soft_schedule_slots(client_id INT,provider_user_id INT,school_organization_id INT,start_time TIME,weekday INT,slot_index INT)',
      'CREATE TABLE school_contacts(id INT,school_organization_id INT,email VARCHAR(80),full_name VARCHAR(80),role_title VARCHAR(80),is_scheduler INT)',
      'CREATE TABLE client_school_roi_signing_links(id INT,client_id INT,school_organization_id INT,recipient_guardian_user_id INT,latest_intake_submission_id INT,status VARCHAR(20),signed_at DATETIME)',
      'CREATE TABLE intake_submission_documents(id INT,client_id INT,intake_submission_id INT,signed_pdf_path TEXT,audit_trail JSON,signed_at DATETIME)',
      'CREATE TABLE intake_submissions(id INT,intake_link_id INT,guardian_user_id INT)',
      'CREATE TABLE intake_links(id INT,organization_id INT)',
      'CREATE TABLE client_school_roi_guardian_decisions(client_id INT,school_organization_id INT,guardian_user_id INT,school_staff_user_id INT,intake_submission_id INT,signed_at DATETIME,expires_at DATETIME,decision VARCHAR(20))',
      readFileSync(new URL('../../../../database/migrations/540_client_school_staff_roi_access.sql',import.meta.url),'utf8'),
      "INSERT INTO users(id,first_name,role,is_active,status) VALUES(211,'Alex','school_staff',1,'ACTIVE'),(212,'Blair','school_staff',1,'ACTIVE'),(213,'Casey','school_staff',1,'ACTIVE'),(214,'Former','school_staff',1,'ACTIVE')",
      "INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(211,5,1),(212,5,1),(213,5,1),(214,5,0)",
      "INSERT INTO clients(id,organization_id,agency_id,roi_expires_at) VALUES(210,4,2,DATE_ADD(CURDATE(),INTERVAL 1 YEAR))",
      'INSERT INTO client_organization_assignments(client_id,organization_id,is_active,is_primary) VALUES(210,5,1,0)',
      "UPDATE users SET first_name='Pat' WHERE id=2",
      "INSERT INTO client_provider_assignments(client_id,organization_id,provider_user_id,is_active,service_day) VALUES(210,5,2,1,'Tuesday')",
      "INSERT INTO client_school_staff_roi_access(client_id,school_organization_id,school_staff_user_id,access_level) VALUES(210,5,211,'roi'),(210,5,212,'roi')",
      "INSERT INTO client_school_roi_guardian_decisions VALUES(210,5,1,212,1,NOW(),DATE_ADD(NOW(),INTERVAL 1 YEAR),'none')"
    ]) await state.db.query(sql);
    const read = async()=> (await attachGuardianSchoolAffiliations([{client_id:210,agency_id:2}],
      {guardianUserId:1,providerClientIds:[210],documentClientIds:[210]}))[0].school_affiliations[0];
    const school=await read();
    expect(school).toMatchObject({name:'Pine School',status:'current',providers:[{name:'Pat',service_day:'Tuesday'}]});
    expect(school.staff.map(staff=>[staff.name,staff.access_state])).toEqual([['Alex','roi'],['Blair','denied'],['Casey','none']]);
    await state.db.query('UPDATE clients SET roi_expires_at=DATE_SUB(CURDATE(),INTERVAL 1 DAY) WHERE id=210');
    expect((await read()).staff[0].access_state).toBe('expired');
  });
});
