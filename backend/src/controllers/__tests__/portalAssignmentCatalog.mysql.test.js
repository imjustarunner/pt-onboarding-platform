import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from '../../services/__tests__/fixtures/isolatedWorkflowMysql.js';
import {createAssignmentPackage,getClientUpdateCatalog,previewUpdateItem} from '../clientUpdate.controller.js';
import {listDisclosureProviders} from '../../services/smartDisclosure.service.js';

const fixture=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>fixture.db.execute(...args)}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:async()=>({ok:true,client:{id:44,agency_id:3,organization_id:17,roi_expires_at:'2027-04-03'}})}));
vi.mock('../../services/clientUpdate.service.js',()=>({
  assignmentRecipients:async()=>[{id:8,billing:true,forms:false}],
  listUpdateCatalog:async()=>({enabled:true,documents:[],assessments:[],portalSteps:[{key:'authorization'}]})
}));
vi.mock('../../services/familyLedger/policy.js',()=>({requireBillingStaff:async()=>{}}));

describe.skipIf(!recoveryMysqlEnabled)('portal assignments for agency support',()=>{
  let instance;
  const migration=name=>readFile(new URL('../../../../database/migrations/'+name,import.meta.url),'utf8');
  const runSql=async sql=>{
    for(const statement of sql.replace(/^--.*$/gm,'').split(';').map(line=>line.trim()).filter(Boolean))await fixture.db.query(statement);
  };
  beforeAll(async()=>{
    instance=await isolatedWorkflowMysql('portal_assignments');fixture.db=instance.db;
    await runSql(`
      CREATE TABLE chat_messages(id INT PRIMARY KEY);
      INSERT INTO chat_messages VALUES(3);
      CREATE TABLE users(id INT PRIMARY KEY,first_name TEXT,last_name TEXT,is_active BOOL,is_archived BOOL,terminated_at DATETIME,status VARCHAR(50));
      CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOL);
      CREATE TABLE agencies(id INT,name VARCHAR(80),organization_type VARCHAR(30),is_active BOOL,is_archived BOOL,city VARCHAR(80),state VARCHAR(30));
      CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active BOOL,is_primary BOOL);
      CREATE TABLE client_school_roi_signing_links(id INT,client_id INT,school_organization_id INT,recipient_guardian_user_id INT,issued_by_user_id INT,status VARCHAR(30),signed_at DATETIME);
      CREATE TABLE organization_affiliations(organization_id INT,agency_id INT,is_active BOOL);
      CREATE TABLE agency_schools(school_organization_id INT,agency_id INT,is_active BOOL);
      CREATE TABLE document_templates (id INT,name VARCHAR(255),agency_id INT,document_type VARCHAR(30),is_archived BOOL,archived_at DATETIME,archived_by_agency_id INT);
      CREATE TABLE intake_links (is_active BOOL,allowed_document_template_ids JSON,intake_steps JSON);
      CREATE TABLE agency_school_intake_masters(intake_steps JSON);
      CREATE TABLE agency_office_intake_masters(intake_steps JSON);
      CREATE TABLE agency_channel_intake_masters(intake_steps JSON);
      INSERT INTO document_templates VALUES
        (11,'ASHLEY ELEMENTARY SCHOOL ROI ESPAÑOL',3,'authorization',0,NULL,NULL),
        (12,'BROADMOOR ELEMENTARY SCHOOL ROI',3,'authorization',0,NULL,NULL),
        (13,'CHEYENNE MOUNTAIN HIGH SCHOOL ROI',3,'school_roi',0,NULL,NULL),
        (14,'BROWN INTERNATIONAL ACADEMY ROI',3,'authorization',0,NULL,NULL),
        (15,'Current general release',3,'consent',0,NULL,NULL);
      INSERT INTO intake_links VALUES(1,JSON_ARRAY(12),NULL);
      INSERT INTO agency_school_intake_masters VALUES(JSON_ARRAY(JSON_OBJECT('templateId',14)));
      CREATE TABLE family_billing_tasks(id INT,agency_id INT,guardian_user_id INT,client_ids_json JSON,status VARCHAR(30),expires_at DATETIME,completed_at DATETIME);
      CREATE TABLE client_assessment_deliverables(id INT,scores_snapshot_json JSON,client_id INT,agency_id INT,assessment_family VARCHAR(64),assessment_id INT,kind VARCHAR(30));
      INSERT INTO users VALUES(7,'Support','Staff',1,0,NULL,'ACTIVE'),(8,'Test','Guardian',1,0,NULL,'ACTIVE');
      INSERT INTO user_agencies VALUES(7,3,1);
      INSERT INTO agencies VALUES(17,'Test School','school',1,0,'Colorado Springs','CO'),(18,'Other School','school',1,0,'Denver','CO');
      INSERT INTO client_school_roi_signing_links VALUES(31,44,17,8,7,'issued',NULL),(32,44,18,8,7,'issued',NULL);
      INSERT INTO organization_affiliations VALUES(17,3,1);
      INSERT INTO family_billing_tasks VALUES(9,3,8,JSON_ARRAY(44),'pending',DATE_ADD(NOW(),INTERVAL 15 DAY),NULL);
    `);
    await runSql(await migration('1752_client_update_workflows.sql'));
    await runSql(await migration('1857_archive_legacy_school_roi_templates.sql'));
    await runSql("ALTER TABLE client_update_requests ADD COLUMN purpose VARCHAR(30);");
    const setup=await migration('1852_portal_assignment_packages.sql');
    await runSql(setup);
    await runSql('INSERT INTO chat_messages VALUES(4);');
    await runSql(setup);
  });
  afterAll(async()=>{await instance?.close();});
  it('keeps the original new-message boundary when the migration runs again',async()=>{
    const [[row]]=await fixture.db.execute('SELECT last_message_id FROM portal_message_alert_cursors WHERE user_id=0');
    expect(Number(row.last_message_id)).toBe(3);
  });
  it('lists a school release expiration, an assigned payment task and only this agency’s packages',async()=>{
    const req={params:{id:44},user:{id:7,role:'support'},body:{name:'School intake',schoolOnly:true,portalSteps:['authorization']}};
    const res={status:vi.fn().mockReturnThis(),json:vi.fn()}, next=error=>{throw error;};
    await createAssignmentPackage(req,res,next);
    expect(res.status).toHaveBeenCalledWith(201);
    await fixture.db.execute("INSERT INTO portal_assignment_packages(agency_id,name,selection_json,created_by_user_id) VALUES(4,'Elsewhere',JSON_OBJECT(),7)");
    await getClientUpdateCatalog(req,res,next);
    const data=res.json.mock.lastCall[0];
    expect(data.packages.map(p=>p.name)).toEqual(['School intake']);
    expect(data.schoolRoiExpiresAt).toBe('2027-04-03');
    expect(data.schoolName).toBe('Test School');
    expect(data.schoolCity).toBe('Colorado Springs');
    expect(data.items).toMatchObject([
      {id:31,item_type:'school_roi',status:'pending',recipientUserId:8},
      {id:9,item_type:'billing',status:'pending',last_name:'Guardian'}
    ]);
    expect(data.recipients).toMatchObject([{id:8,billing:true,forms:false}]);
  });
  it('archives named static uploads and preserves active references and the canonical smart template',async()=>{
    const [rows]=await fixture.db.execute('SELECT id,is_archived,archived_by_agency_id FROM document_templates ORDER BY id');
    expect(rows.map(row=>[row.id,row.is_archived,row.archived_by_agency_id])).toEqual([
      [11,1,3],[12,0,null],[13,0,null],[14,0,null],[15,0,null]
    ]);
  });
  it('counts completed items in each sent request using the actual assessment state', async () => {
    await fixture.db.execute('CREATE TABLE teen_wellbeing_assessments(id INT PRIMARY KEY, agency_id INT, client_id INT, status VARCHAR(40))');
    await fixture.db.execute("INSERT INTO teen_wellbeing_assessments VALUES(11,3,44,'in_progress')");
    await fixture.db.execute("INSERT INTO client_update_requests(id,agency_id,client_id,guardian_user_id,status) VALUES(100,3,44,8,'sent')");
    await fixture.db.execute(`INSERT INTO client_update_items(request_id,item_type,reference_key,title,status,assessment_id)
      VALUES(100,'assessment','teen_wellbeing','Well-being','pending',11),(100,'information','information','Check details','complete',NULL)`);
    const req = {params:{id:44},user:{id:7,role:'support'}};
    const res = {json:vi.fn()};
    await getClientUpdateCatalog(req,res,e=>{throw e;});
    const items = res.json.mock.lastCall[0].items.filter(i=>i.request_id===100);
    expect(items).toHaveLength(2);
    expect(items.find(i=>i.item_type==='assessment')).toMatchObject({status:'in_progress',requestCompleted:1,requestTotal:2});
  });

  it('limits previews to authorized staff and the selected agency catalog', async () => {
    const res = {set:vi.fn(),sendStatus:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
    const req = {params:{id:44,kind:'document',key:111},user:{id:7,role:'guardian'}};
    await previewUpdateItem(req,res,e=>{throw e;});
    expect(res.status).toHaveBeenCalledWith(403);
    await previewUpdateItem({...req,user:{id:7,role:'support'}},res,e=>{throw e;});
    expect(res.sendStatus).toHaveBeenCalledWith(404);
  });

  it('keeps Colorado Springs and Denver school disclosures separate using active school assignments',async()=>{
    await runSql(`
      UPDATE agencies SET state='CO';
      INSERT INTO agencies VALUES(19,'Another Springs campus','school',1,0,' colorado springs ','Colorado');
      INSERT INTO agencies VALUES(20,'Unaffiliated Springs campus','school',1,0,'Colorado Springs','CO');
      INSERT INTO organization_affiliations VALUES(18,3,1),(19,3,1),(20,4,1);
      ALTER TABLE users ADD COLUMN credential TEXT, ADD COLUMN email TEXT, ADD COLUMN role VARCHAR(40),
        ADD COLUMN title TEXT, ADD COLUMN is_demo BOOL DEFAULT 0, ADD COLUMN has_supervisor_privileges BOOL DEFAULT 0;
      ALTER TABLE user_agencies ADD COLUMN agency_role VARCHAR(40), ADD COLUMN agency_position TEXT, ADD COLUMN include_on_disclosure BOOL;
      CREATE TABLE provider_school_assignments(provider_user_id INT,school_organization_id INT,is_active BOOL);
      INSERT INTO users(id,first_name,last_name,is_active,is_archived,status,role) VALUES
        (41,'Spring','First',1,0,'ACTIVE_EMPLOYEE','provider'),
        (42,'Spring','Second',1,0,'ACTIVE_EMPLOYEE','provider'),
        (43,'Denver','Third',1,0,'ACTIVE_EMPLOYEE','provider'),
        (44,'Office','Fourth',1,0,'ACTIVE_EMPLOYEE','provider'),
        (45,'Other','Fifth',1,0,'ACTIVE_EMPLOYEE','provider');
      INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(41,3,1),(42,3,1),(43,3,1),(44,3,1),(45,3,1);
      INSERT INTO provider_school_assignments VALUES(41,17,1),(42,19,1),(43,18,1),(45,20,1);
    `);
    const roster=async schoolOrganizationId=>(await listDisclosureProviders({agencyId:3,schoolOrganizationId,schoolCityOnly:true})).map(provider=>provider.id);
    expect(await roster(17)).toEqual([41,42]);
    expect(await roster(18)).toEqual([43]);
    await fixture.db.execute("UPDATE agencies SET city=NULL WHERE id=17");
    expect(await roster(17)).toEqual([41]);
  });

});
