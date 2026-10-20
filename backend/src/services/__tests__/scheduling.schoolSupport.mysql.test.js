/** Disposable local MySQL only. Tests actual transactions, lock waits, rollback and migration. */
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {splitSqlStatements} from '../../utils/migrationSql.js';
const m=vi.hoisted(()=>({schema:`codex_support_${process.pid}_${Date.now()}`,context:vi.fn()}));
vi.mock('../../config/database.js',async()=>({default:(await import('mysql2/promise')).default.createPool({host:'127.0.0.1',port:Number(process.env.SCHEDULING_TEST_MYSQL_PORT||1),user:'root',password:'',database:m.schema,timezone:'+00:00',connectionLimit:6})}));
vi.mock('../sickLeaveRate.service.js',()=>({currentEligibleSickRate:vi.fn()}));
vi.mock('../paySystem.service.js',()=>({loadUserPaySystemContext:m.context}));
import pool from '../../config/database.js';
import PayrollPtoRequest from '../../models/PayrollPtoRequest.model.js';
import {createSchoolSupportRequest,schoolSupportAvailability} from '../schoolSupportRequest.service.js';
import {approveLeaveAtomically} from '../payrollLeaveApproval.service.js';
const request=(args={})=>createSchoolSupportRequest({agencyId:2,userId:10,actorId:10,sourceAppointmentId:1,items:[{date:'2026-10-20',hours:1}],...args});
const approve=requestId=>approveLeaveAtomically({agencyId:2,requestId,actorId:30,policy:{schoolSupportEnabled:true,schoolSupportHourlyRate:18}});
describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('school support request and payroll transactions',()=>{
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
 it('reserves pending availability without deducting earned hours, then pays and deducts exactly once',async()=>{
  const {requestId}=await request();
  expect(await schoolSupportAvailability({agencyId:2,userId:10})).toEqual({balanceHours:1,pendingHours:1,availableHours:0});
  expect(await rows('payroll_pto_ledger')).toEqual([]);expect(await rows('payroll_adjustments')).toEqual([]);
  expect(await request()).toEqual({requestId,alreadyRequested:true});
  await approve(requestId);await expect(approve(requestId)).rejects.toThrow('not pending');
  expect(await schoolSupportAvailability({agencyId:2,userId:10})).toEqual({balanceHours:0,pendingHours:0,availableHours:0});
  expect(await rows('payroll_pto_ledger')).toHaveLength(1);
  expect(Number((await rows('payroll_adjustments'))[0].other_taxable_amount)).toBe(18);
 });
 it('only one of two simultaneous cancellations can reserve the final hour',async()=>{
  const result=await Promise.allSettled([request(),request({sourceAppointmentId:2})]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(result.find(r=>r.status==='rejected').reason.message).toContain('Insufficient');
  expect(await rows('payroll_pto_requests')).toHaveLength(1);
 });
 it('a cancellation sees new pending requests even after establishing an older transaction snapshot',async()=>{
  const db=await pool.getConnection();try{
   await db.beginTransaction();await db.query('SELECT * FROM payroll_pto_requests');
   await request({sourceAppointmentId:null}); // My Payroll reserved the hour after our snapshot.
   await expect(request({db})).rejects.toThrow('Insufficient');await db.rollback();
   expect(await rows('payroll_pto_requests')).toHaveLength(1);
  }finally{db.release();}
 });
 it('respects deferred requests; rejected requests release pending availability',async()=>{
  const {requestId}=await request();await pool.query("UPDATE payroll_pto_requests SET status='deferred' WHERE id=?",[requestId]);
  await expect(request({sourceAppointmentId:2})).rejects.toThrow('Insufficient');
  await pool.query("UPDATE payroll_pto_requests SET status='rejected' WHERE id=?",[requestId]);
  await request({sourceAppointmentId:2});expect((await schoolSupportAvailability({agencyId:2,userId:10})).balanceHours).toBe(1);
 });
 it('withdrawal frees the hour while preserving the cancellation request history',async()=>{
  const {requestId}=await request();await PayrollPtoRequest.withdrawPending({requestId,agencyId:2,userId:10});
  expect(await schoolSupportAvailability({agencyId:2,userId:10})).toEqual({balanceHours:1,pendingHours:0,availableHours:1});
  expect((await rows('payroll_pto_requests'))[0]).toMatchObject({id:requestId,status:'withdrawn',source_appointment_id:1});
  expect(await rows('payroll_pto_request_items')).toHaveLength(1);
  await expect(approve(requestId)).rejects.toThrow('not pending');
 });
 it('does not pay or deduct until the signed cancellation is fully completed',async()=>{
  const {requestId}=await request();await pool.query("UPDATE appointment_change_workflows SET status='completing' WHERE appointment_id=1");
  await expect(approve(requestId)).rejects.toThrow('Complete the signed');
  expect((await rows('payroll_pto_requests'))[0].status).toBe('submitted');
  expect((await schoolSupportAvailability({agencyId:2,userId:10})).balanceHours).toBe(1);
  expect(await rows('payroll_adjustments')).toEqual([]);
 });
 it('rolls back all payroll changes when the ledger write fails',async()=>{
  const {requestId}=await request();
  await pool.query("CREATE TRIGGER fail_support_ledger BEFORE INSERT ON payroll_pto_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ledger unavailable'");
  try{await expect(approve(requestId)).rejects.toThrow('Ledger unavailable');}finally{await pool.query('DROP TRIGGER fail_support_ledger');}
  expect((await rows('payroll_pto_requests'))[0].status).toBe('submitted');
  expect((await schoolSupportAvailability({agencyId:2,userId:10})).balanceHours).toBe(1);
  expect(await rows('payroll_adjustments')).toEqual([]);expect(await rows('payroll_pto_ledger')).toEqual([]);
 });
 it('denies a linked benefit with modified hours, a restored session, or an insufficient balance even with override',async()=>{
  const {requestId}=await request();
  await pool.query('UPDATE payroll_pto_requests SET total_hours=2 WHERE id=?',[requestId]);
  await expect(approve(requestId)).rejects.toThrow('exactly one');
  await pool.query('UPDATE payroll_pto_requests SET total_hours=1 WHERE id=?',[requestId]);
  await pool.query("UPDATE appointments SET status='confirmed' WHERE id=1");await expect(approve(requestId)).rejects.toThrow('Complete the signed');
  await pool.query("UPDATE appointments SET status='no_show' WHERE id=1");await pool.query('UPDATE payroll_pto_accounts SET school_support_balance_hours=0');
  await expect(approveLeaveAtomically({agencyId:2,requestId,actorId:30,overrideBalance:true,policy:{schoolSupportEnabled:true}})).rejects.toThrow('Insufficient');
 });
});
