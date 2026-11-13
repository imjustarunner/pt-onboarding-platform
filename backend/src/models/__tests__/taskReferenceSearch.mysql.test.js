import{beforeAll,afterAll,describe,it,expect,vi}from'vitest';import{isolatedWorkflowMysql,recoveryMysqlEnabled}from'../../services/__tests__/fixtures/isolatedWorkflowMysql.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));import Task from'../Task.model.js';
describe.runIf(recoveryMysqlEnabled)('exact numeric task references in isolated SQL',()=>{let fixture,db;
 beforeAll(async()=>{fixture=await isolatedWorkflowMysql('task_reference');db=fixture.db;await db.query('CREATE TABLE tasks(id INT,title VARCHAR(255),description TEXT,metadata JSON,assigned_to_agency_id INT,source_ref_id VARCHAR(80))');await db.query(`INSERT INTO tasks VALUES(2488,'Process paper packet · PerQap #2544','Fictional source',JSON_OBJECT('clientId',2544,'documentId',4396,'schoolName','Cedar QA'),450,'226'),(9000,'Other tenant paper',NULL,JSON_OBJECT('clientId',2544,'documentId',4396),458,'226')`);});
 afterAll(async()=>{await fixture?.close();});
 it.each(['2488','#2488','2544','4396','226'])('finds the real masked-client task by %s while preserving the agency predicate',async q=>{const built=Task._appendHubFilters('SELECT t.id FROM tasks t WHERE t.assigned_to_agency_id=?',[450],{q});const[rows]=await db.execute(built.query,built.params);expect(rows.map(r=>r.id)).toEqual([2488]);});
 it('never broadens a numeric-looking search into SQL syntax',async()=>{const built=Task._appendHubFilters('SELECT t.id FROM tasks t WHERE t.assigned_to_agency_id=?',[450],{q:'2488 OR 1=1'});const[rows]=await db.execute(built.query,built.params);expect(rows).toEqual([]);});
});
