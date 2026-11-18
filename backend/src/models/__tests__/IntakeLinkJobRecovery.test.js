import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{getConnection:()=>state.db.getConnection()}}));
import IntakeLink from '../IntakeLink.model.js';
let sql;
beforeEach(()=>{
  sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE hiring_job_descriptions(id INTEGER,agency_id INTEGER,is_active INTEGER);
    INSERT INTO hiring_job_descriptions VALUES(4,463,1),(5,464,1);
    CREATE TABLE plotline_companies(agency_id INTEGER PRIMARY KEY);
    INSERT INTO plotline_companies VALUES(463);
    CREATE TABLE plotline_audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,actor_user_id INTEGER,action TEXT,object_id TEXT,metadata_json TEXT,created_at TEXT);
    CREATE TABLE intake_links(id INTEGER PRIMARY KEY AUTOINCREMENT,public_key TEXT,title TEXT,description TEXT,
    language_code TEXT,linked_es_form_id INTEGER,document_translation_map TEXT,scope_type TEXT,form_type TEXT,
    organization_id INTEGER,program_id INTEGER,learning_class_id INTEGER,company_event_id INTEGER,job_description_id INTEGER,
    is_active INTEGER,create_client INTEGER,create_guardian INTEGER,requires_assignment INTEGER,allowed_document_template_ids TEXT,
    intake_fields TEXT,intake_steps TEXT,retention_policy_json TEXT,custom_messages TEXT,created_by_user_id INTEGER);`);
  const execute=async(query,args=[])=>{
    const statement=sql.prepare(query.replace(' FOR UPDATE',''));
    if(query.startsWith('SELECT'))return [statement.all(...args)];
    const row=statement.run(...args);return [{insertId:Number(row.lastInsertRowid)}];
  };
  let tail=Promise.resolve();
  state.db={async getConnection(){let release;const before=tail;tail=new Promise(resolve=>release=resolve);await before;
    return {execute,beginTransaction:async()=>sql.exec('BEGIN'),commit:async()=>sql.exec('COMMIT'),rollback:async()=>sql.exec('ROLLBACK'),release};}};
});
afterEach(()=>sql.close());
const data=()=>({jobDescriptionId:4,organizationId:463,createdByUserId:1434,publicKey:'synthetic-key',formType:'job_application',createClient:false,intakeSteps:[{label:'Original resume'}]});
it('serializes two same-job requests and returns the same form',async()=>{
  const results=await Promise.all([IntakeLink.ensureJobApplication(data()),IntakeLink.ensureJobApplication(data())]);
  expect(results.map(result=>result.created)).toEqual([true,false]);
  expect(results[0].link.id).toBe(results[1].link.id);
  expect(sql.prepare('SELECT COUNT(*) n FROM intake_links').get().n).toBe(1);
});
it('preserves customized steps and inactive state on retry',async()=>{
  const first=await IntakeLink.ensureJobApplication(data());
  sql.prepare('UPDATE intake_links SET intake_steps=?,is_active=0 WHERE id=?').run('[{"label":"Reviewed questions"}]',first.link.id);
  const retry=await IntakeLink.ensureJobApplication(data());
  expect(retry.created).toBe(false);expect(retry.link.intake_steps).toEqual([{label:'Reviewed questions'}]);expect(retry.link.is_active).toBe(0);
});
it('rolls back a wrong-company job without creating a form',async()=>{
  await expect(IntakeLink.ensureJobApplication({...data(),jobDescriptionId:5})).rejects.toMatchObject({status:404});
  expect(sql.prepare('SELECT COUNT(*) n FROM intake_links').get().n).toBe(0);
});
it('records form creation once in its transaction and retains creator attribution',async()=>{
 const first=await IntakeLink.ensureJobApplication(data());await IntakeLink.ensureJobApplication(data());
 const events=sql.prepare('SELECT * FROM plotline_audit_events').all();expect(events).toHaveLength(1);
 expect(events[0].action).toBe('plotline.job_application_form_created');expect(events[0].object_id).toBe(String(first.link.id));
 expect(JSON.parse(events[0].metadata_json)).toMatchObject({jobId:4,formId:first.link.id,automationActor:{kind:'qa_automation',actorUserId:1434}});
});
it('rolls back form creation when its audit event cannot be recorded',async()=>{
 sql.exec("CREATE TRIGGER audit_down BEFORE INSERT ON plotline_audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 await expect(IntakeLink.ensureJobApplication(data())).rejects.toThrow('audit unavailable');expect(sql.prepare('SELECT COUNT(*) n FROM intake_links').get().n).toBe(0);
});
