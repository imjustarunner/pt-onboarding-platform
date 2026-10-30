/** Disposable local MySQL only. Tests actual transactions, lock waits, rollback and migration. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({schema:`codex_support_auto_${process.pid}_${Date.now()}`,context:vi.fn()}));
vi.mock('../../config/database.js',async()=>({default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT||1),user:'root',password:'',database:m.schema,timezone:'+00:00',connectionLimit:6})}));
vi.mock('../sickLeaveRate.service.js',()=>({currentEligibleSickRate:vi.fn()}));
vi.mock('../paySystem.service.js',()=>({loadUserPaySystemContext:m.context}));
import pool from '../../config/database.js';
import PayrollPtoRequest from '../../models/PayrollPtoRequest.model.js';
import {createSchoolSupportRequest,schoolSupportAvailability} from '../schoolSupportRequest.service.js';
import {approveLeaveAtomically} from '../payrollLeaveApproval.service.js';
import {submitSchoolSupportAutomatically} from '../schoolSupportAutomatic.service.js';
const request=(args={})=>createSchoolSupportRequest({agencyId:2,userId:10,actorId:10,sourceAppointmentId:1,items:[{date:'2026-10-20',hours:1}],...args});
const approve=requestId=>approveLeaveAtomically({agencyId:2,requestId,actorId:30,policy:{schoolSupportEnabled:true,schoolSupportHourlyRate:18}});
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('temporary school support self-service transactions',()=>{
 let admin,created=false;
 beforeAll(async()=>{
  admin=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT),user:'root',password:''});
  await admin.query(`CREATE DATABASE ${m.schema}`);created=true;
  for(const sql of [
   'CREATE TABLE payroll_pto_accounts(agency_id INT,user_id INT,school_support_balance_hours DECIMAL(12,6),updated_by_user_id INT,PRIMARY KEY(agency_id,user_id))',
   "CREATE TABLE payroll_pto_requests(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,submitted_by_user_id INT,status VARCHAR(32),request_type VARCHAR(32),notes TEXT,total_hours DECIMAL(12,2),approved_by_user_id INT,approved_at DATETIME,approved_payroll_period_id INT,approved_rates_json JSON,rejected_by_user_id INT,rejected_at DATETIME,rejection_reason TEXT,INDEX account_requests(agency_id,user_id))",
   'CREATE TABLE payroll_pto_request_items(id INT AUTO_INCREMENT PRIMARY KEY,request_id INT,agency_id INT,request_date DATE,hours DECIMAL(12,2))',
   'CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,status VARCHAR(40))',
   'CREATE TABLE appointment_change_workflows(appointment_id INT PRIMARY KEY,agency_id INT,status VARCHAR(32))',
   'CREATE TABLE payroll_periods(id INT PRIMARY KEY,agency_id INT,status VARCHAR(32),period_end DATE)',
   'CREATE TABLE payroll_adjustments(payroll_period_id INT,agency_id INT,user_id INT,updated_by_user_id INT,other_taxable_amount DECIMAL(12,2) DEFAULT 0,PRIMARY KEY(payroll_period_id,user_id))',
   'CREATE TABLE payroll_pto_ledger(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,entry_type VARCHAR(32),pto_bucket VARCHAR(32),hours_delta DECIMAL(12,2),effective_date DATE,payroll_period_id INT,request_id INT,note TEXT,created_by_user_id INT)'
  ])await pool.query(sql);
  const migration=await readFile(new URL('../../../../database/migrations/1667_cancellation_school_support_requests.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(migration))await pool.query(sql);
  const automaticMigration=await readFile(new URL('../../../../database/migrations/1714_school_support_submission_keys.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(automaticMigration))await pool.query(sql);
  await pool.query('CREATE TABLE provider_school_assignments(id INT,provider_user_id INT,school_organization_id INT,is_active INT)');
  await pool.query('CREATE TABLE agencies(id INT PRIMARY KEY)');
  await pool.query('CREATE TABLE organization_affiliations(agency_id INT,organization_id INT)');
  await pool.query('INSERT INTO agencies VALUES (2)');
  await pool.query('INSERT INTO provider_school_assignments VALUES (1,10,2,1)');
 });
 beforeEach(async()=>{
  m.context.mockReset().mockResolvedValue({enabled:false});
  for(const table of ['payroll_pto_ledger','payroll_adjustments','payroll_periods','appointment_change_workflows','appointments','payroll_pto_request_items','payroll_pto_requests','payroll_pto_accounts'])await pool.query(`DELETE FROM ${table}`);
  await pool.query('INSERT INTO payroll_pto_accounts VALUES (2,10,1,NULL)');
  await pool.query("INSERT INTO appointments VALUES (1,2,10,'canceled_by_client'),(2,2,10,'no_show')");
  await pool.query("INSERT INTO appointment_change_workflows VALUES (1,2,'completed'),(2,2,'completed')");
  await pool.query("INSERT INTO payroll_periods VALUES (5,2,'draft','2026-10-30')");
 });
 afterAll(async()=>{await pool.end();if(created)await admin.query(`DROP DATABASE ${m.schema}`);await admin?.end();});
 const rows=async table=>(await pool.query(`SELECT * FROM ${table}`))[0];
 const automatic=(args={})=>submitSchoolSupportAutomatically({agencyId:2,userId:10,actorId:10,items:[{date:'2026-10-20',hours:1}],submissionKey:'school_support_submission_1',policy:{schoolSupportEnabled:true,schoolSupportHourlyRate:18},...args});
 it('adds pay and deducts earned hours together without an appointment or payroll approval',async()=>{
  const result=await automatic();
  const requests=await rows('payroll_pto_requests');expect(requests).toHaveLength(1);expect(requests[0].status).toBe('approved');expect(requests[0].source_appointment_id).toBeNull();
  expect(Number((await rows('payroll_pto_accounts'))[0].school_support_balance_hours)).toBe(0);
  expect(Number((await rows('payroll_adjustments'))[0].other_taxable_amount)).toBe(18);
  expect((await rows('payroll_pto_ledger'))[0].note).toContain('automatically applied (temporary self-service)');
  expect(result.affectedPayrollPeriodIds).toEqual([5]);
 });
 it('applies concurrent retries exactly once, including after the balance reaches zero',async()=>{
  const results=await Promise.all([automatic(),automatic()]);expect(results.map(x=>x.alreadySubmitted).sort()).toEqual([false,true]);
  expect(await rows('payroll_pto_requests')).toHaveLength(1);expect(await rows('payroll_pto_ledger')).toHaveLength(1);
  expect(Number((await rows('payroll_adjustments'))[0].other_taxable_amount)).toBe(18);
  expect((await automatic()).alreadySubmitted).toBe(true);
 });
 it('prevents two different submissions from spending the same final hour',async()=>{
  const result=await Promise.allSettled([automatic(),automatic({submissionKey:'school_support_submission_2'})]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(result.find(r=>r.status==='rejected').reason.message).toContain('Insufficient');
  expect(await rows('payroll_pto_requests')).toHaveLength(1);
 });
 it('respects hours already reserved by earlier pending requests',async()=>{
  await request();await expect(automatic()).rejects.toThrow('Insufficient');
  expect(await rows('payroll_pto_requests')).toHaveLength(1);expect(await rows('payroll_pto_ledger')).toHaveLength(0);
 });
 it('rolls back the request, reservation, pay and balance when the applicable rate is missing',async()=>{
  await expect(automatic({policy:{schoolSupportEnabled:true,schoolSupportHourlyRate:0}})).rejects.toThrow('positive leave payment rate');
  expect(await rows('payroll_pto_requests')).toHaveLength(0);expect(await rows('payroll_pto_ledger')).toHaveLength(0);expect(await rows('payroll_adjustments')).toHaveLength(0);
  expect(Number((await rows('payroll_pto_accounts'))[0].school_support_balance_hours)).toBe(1);
 });
 it('does not add payment to a posted period or deduct hours without an open period',async()=>{
  await pool.query("UPDATE payroll_periods SET status='posted'");await expect(automatic()).rejects.toThrow('open payroll period');
  expect(await rows('payroll_pto_requests')).toHaveLength(0);expect(Number((await rows('payroll_pto_accounts'))[0].school_support_balance_hours)).toBe(1);
 });
 it('uses the next open period for an earlier use date and preserves other taxable pay',async()=>{
  await pool.query("INSERT INTO payroll_periods VALUES (4,2,'posted','2026-10-16')");
  await pool.query('INSERT INTO payroll_adjustments VALUES (5,2,10,30,7)');
  const result=await automatic({items:[{date:'2026-10-10',hours:1}]});expect(result.affectedPayrollPeriodIds).toEqual([5]);
  expect(Number((await rows('payroll_adjustments'))[0].other_taxable_amount)).toBe(25);
 });
 it('uses the same applicable reduced support rate as the balance display',async()=>{
  m.context.mockResolvedValue({enabled:true,status:{useReducedRates:true},rateProfile:{supportActivityRate:25,supportActivityRateProbation:19}});
  await automatic();expect(Number((await rows('payroll_adjustments'))[0].other_taxable_amount)).toBe(19);
 });
 it('rejects reused keys with different hours and company scopes',async()=>{
  await automatic();await expect(automatic({items:[{date:'2026-10-20',hours:.5}]})).rejects.toThrow('different dates or hours');
  await expect(automatic({agencyId:6})).rejects.toThrow('account is unavailable');expect(await rows('payroll_pto_requests')).toHaveLength(1);
 });
 it('rejects disabled policies, missing retry keys and impossible dates before writes',async()=>{
  await expect(automatic({policy:{schoolSupportEnabled:false}})).rejects.toMatchObject({status:403});
  await expect(automatic({submissionKey:''})).rejects.toMatchObject({status:400});
  await expect(automatic({items:[{date:'2026-02-30',hours:1}]})).rejects.toThrow('valid use date');
  expect(await rows('payroll_pto_requests')).toHaveLength(0);
 });
});
