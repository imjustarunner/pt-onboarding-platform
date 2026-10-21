// Disposable CI MySQL only; outgoing email and directory lookups are mocked.
import {describe,it,expect,vi,beforeAll,beforeEach,afterAll} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../../../database/migrationSqlUtils.js';
const m=vi.hoisted(()=>({pool:null,send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.pool.execute(...args),query:(...args)=>m.pool.query(...args),getConnection:()=>m.pool.getConnection()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async id=>({id,first_name:'Test',role:'provider',status:'ACTIVE_EMPLOYEE'}),getAgencies:async()=>[{id:2}]}}));
vi.mock('../../models/OfficeLocationAgency.model.js',()=>({default:{}}));
vi.mock('../storage.service.js',()=>({default:{}}));
vi.mock('../meetingRecipientIdentity.service.js',()=>({resolveMeetingRecipient:async()=>({email:'fixture@example.test'})}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async()=> 'https://app.example.test'}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:m.send}));
vi.mock('../officeApprovalWorkflow.service.js',()=>({findOfficeApproval:vi.fn()}));
import {enqueueOfficeEmail,sendDueOfficeRequestEmails} from '../officeRequestEmails.service.js';
const database='codex_office_request_emails';let admin;
const queue=id=>enqueueOfficeEmail({kind:'decision',agencyId:2,userId:12,key:`booking:${id}`,payload:{key:`booking:${id}`,action:'approve',startDate:'2026-11-02',timezone:'America/Denver',recurrence:'ONCE',frequencyLabel:'One time',slots:[{startHour:17,endHour:18}]}});
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('durable office email batching in MySQL',()=>{
 beforeAll(async()=>{
  const options={host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:'',timezone:'+00:00'};
  admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE ${database}`);
  m.pool=mysql.createPool({...options,database,connectionLimit:8});
  await m.pool.query('CREATE TABLE users (id INT PRIMARY KEY)');await m.pool.query('CREATE TABLE office_locations (id INT PRIMARY KEY)');
  await m.pool.query('CREATE TABLE notification_triggers (trigger_key VARCHAR(100) PRIMARY KEY,name TEXT,description TEXT,default_enabled BOOLEAN,default_channels_json JSON,default_recipients_json JSON)');
  const sql=await readFile(new URL('../../../../database/migrations/1674_office_request_emails.sql',import.meta.url),'utf8');
  for(const statement of splitSqlStatements(sql))await m.pool.query(statement);
 });
 beforeEach(async()=>{await m.pool.query('TRUNCATE office_request_email_queue');m.send.mockReset();m.send.mockImplementation(async()=>{await new Promise(r=>setTimeout(r,20));return {id:'mail-1',communicationId:8};});});
 afterAll(async()=>{if(m.pool)await m.pool.end();if(admin){await admin.query(`DROP DATABASE ${database}`);await admin.end();}});
 it('batches five saved approvals and allows only one concurrent server to deliver them',async()=>{
  await Promise.all([1,2,3,4,5].map(queue));
  await m.pool.query("UPDATE office_request_email_queue SET ready_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)");
  await Promise.all([sendDueOfficeRequestEmails(),sendDueOfficeRequestEmails()]);
  expect(m.send).toHaveBeenCalledOnce();expect(m.send.mock.calls[0][0].subject).toContain('5 requests');
  const [rows]=await m.pool.query('SELECT status,communication_id FROM office_request_email_queue');
  expect(rows).toHaveLength(5);expect(rows.every(r=>r.status==='sent' && Number(r.communication_id)===8)).toBe(true);
 });
 it('keeps a fresh approval in the same quiet-period group and ignores repeated hooks',async()=>{
  await queue(1);await m.pool.query("UPDATE office_request_email_queue SET ready_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)");
  await queue(2);await queue(2);await sendDueOfficeRequestEmails();expect(m.send).not.toHaveBeenCalled();
  const [[row]]=await m.pool.query('SELECT COUNT(*) AS n FROM office_request_email_queue');expect(Number(row.n)).toBe(2);
 });
 it('does not replay delivered requests when a hook or scheduler runs again',async()=>{
  await queue(1);await m.pool.query("UPDATE office_request_email_queue SET ready_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)");
  await sendDueOfficeRequestEmails();await queue(1);await sendDueOfficeRequestEmails();expect(m.send).toHaveBeenCalledOnce();
 });
});
