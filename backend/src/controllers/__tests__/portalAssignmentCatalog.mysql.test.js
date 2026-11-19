import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from '../../services/__tests__/fixtures/isolatedWorkflowMysql.js';
import {createAssignmentPackage,getClientUpdateCatalog} from '../clientUpdate.controller.js';

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
      CREATE TABLE agencies(id INT,organization_type VARCHAR(30));
      CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_active BOOL);
      CREATE TABLE organization_affiliations(organization_id INT,agency_id INT,is_active BOOL);
      CREATE TABLE agency_schools(school_organization_id INT,agency_id INT,is_active BOOL);
      CREATE TABLE family_billing_tasks(id INT,agency_id INT,guardian_user_id INT,client_ids_json JSON,status VARCHAR(30),expires_at DATETIME);
      CREATE TABLE client_assessment_deliverables(client_id INT,agency_id INT,assessment_family VARCHAR(64),assessment_id INT,kind VARCHAR(30));
      INSERT INTO users VALUES(7,'Support','Staff',1,0,NULL,'ACTIVE'),(8,'Test','Guardian',1,0,NULL,'ACTIVE');
      INSERT INTO user_agencies VALUES(7,3,1);
      INSERT INTO agencies VALUES(17,'school');
      INSERT INTO organization_affiliations VALUES(17,3,1);
      INSERT INTO family_billing_tasks VALUES(9,3,8,JSON_ARRAY(44),'pending',DATE_ADD(NOW(),INTERVAL 15 DAY));
    `);
    await runSql(await migration('1752_client_update_workflows.sql'));
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
    expect(data.items).toMatchObject([{id:9,item_type:'billing',status:'pending',last_name:'Guardian'}]);
    expect(data.recipients).toMatchObject([{id:8,billing:true,forms:false}]);
  });
});
