/** Uses connection-local temporary tables only. Run after migration 1604. */
import assert from 'node:assert/strict';
import pool from '../src/config/database.js';
import {approveLeaveAtomically} from '../src/services/payrollLeaveApproval.service.js';
import Request from '../src/models/PayrollPtoRequest.model.js';
const conn=await pool.getConnection(),realGet=pool.getConnection.bind(pool),realExecute=pool.execute.bind(pool);
try{
 for(const table of ['payroll_pto_requests','payroll_pto_accounts','payroll_pto_request_items','payroll_periods','payroll_adjustments','payroll_pto_ledger']){const [[schema]]=await conn.query(`SHOW CREATE TABLE ${table}`);await conn.query(schema['Create Table'].replace(/^CREATE TABLE/,'CREATE TEMPORARY TABLE').split('\n').filter(line=>!line.trim().startsWith('CONSTRAINT ')).join('\n').replace(/,\n\)/g,'\n)'));}
 const [cols]=await conn.query('SHOW COLUMNS FROM payroll_periods');
 const required=cols.filter(c=>c.Null==='NO'&&c.Default===null&&!c.Extra.includes('auto_increment')).map(c=>c.Field);
 const record={label:'Temporary leave verification',id:900001,agency_id:2,period_start:'2026-10-10',period_end:'2026-10-23',status:'ran',created_by_user_id:1};
 for(const key of required)if(!(key in record))throw Error('Missing period fixture field: '+key);
 await conn.query('INSERT INTO payroll_periods SET ?',record);
 await conn.execute('INSERT INTO payroll_pto_accounts(agency_id,user_id,updated_by_user_id,school_support_balance_hours,training_balance_hours,pto_pay_rate) VALUES(2,999999,1,10,10,44)');
 await conn.execute("INSERT INTO payroll_pto_requests(id,agency_id,user_id,submitted_by_user_id,request_type,total_hours,status,training_description,proof_file_path) VALUES(900001,2,999999,999999,'school_support',2,'submitted','CE course','private/proof')");
 await conn.execute("INSERT INTO payroll_pto_request_items(request_id,agency_id,request_date,hours) VALUES(900001,2,'2026-10-12',2)");
 pool.getConnection=async()=>({execute:conn.execute.bind(conn),beginTransaction:conn.beginTransaction.bind(conn),commit:conn.commit.bind(conn),rollback:conn.rollback.bind(conn),release(){}});
 pool.execute=conn.execute.bind(conn);
 const args={agencyId:2,requestId:900001,actorId:1,targetPayrollPeriodId:900001,policy:{schoolSupportEnabled:true,schoolSupportHourlyRate:18,sharedLeaveAccrualEnabled:true,trainingPtoEnabled:true},defaultPayRate:44};
 await approveLeaveAtomically(args);
 let [[acct]]=await conn.query('SELECT * FROM payroll_pto_accounts');let [[pay]]=await conn.query('SELECT * FROM payroll_adjustments');assert.equal(Number(acct.school_support_balance_hours),8);assert.equal(Number(acct.training_balance_hours),10);assert.equal(Number(pay.other_taxable_amount),36);
 await assert.rejects(approveLeaveAtomically(args),/not pending/);
 await conn.execute("INSERT INTO payroll_pto_requests(id,agency_id,user_id,submitted_by_user_id,request_type,total_hours,status,training_description,proof_file_path) VALUES(900002,2,999999,999999,'training',2,'submitted','CE course','private/proof')");
 await conn.execute("INSERT INTO payroll_pto_request_items(request_id,agency_id,request_date,hours) VALUES(900002,2,'2026-10-12',2)");
 await conn.execute('UPDATE payroll_adjustments SET sick_pto_hours=1,pto_hours=1,pto_rate=40');
 await approveLeaveAtomically({...args,requestId:900002});
 [[acct]]=await conn.query('SELECT * FROM payroll_pto_accounts');[[pay]]=await conn.query('SELECT * FROM payroll_adjustments');assert.equal(Number(acct.training_balance_hours),8);assert.equal(Number(pay.training_pto_hours),2);assert.equal(Math.round(Number(pay.pto_hours)*Number(pay.pto_rate)*100)/100,128);assert.equal(Number(pay.other_taxable_amount),36);
 await assert.rejects(Request.updateStatus({requestId:900001,agencyId:2,status:'rejected'}),/already processed/);
 await assert.rejects(Request.withdrawPending({requestId:900001,agencyId:2,userId:999999}),/Only pending/);
 const created=await Request.create({agencyId:2,userId:999999,requestType:'training',trainingDescription:'CE workshop',trainingCost:125,proof:{filePath:'private/test-proof'},totalHours:1});
 assert.equal(Number(created.training_cost),125);
 console.log('PASS: real MySQL temporary-table approval, separate buckets, duplicate rejection, exact training pay and preserved unrelated pay. No live requests or balances changed.');
}finally{pool.getConnection=realGet;pool.execute=realExecute;for(const table of ['payroll_pto_requests','payroll_pto_accounts','payroll_pto_request_items','payroll_periods','payroll_adjustments','payroll_pto_ledger'])await conn.query(`DROP TEMPORARY TABLE IF EXISTS ${table}`);conn.release();await pool.end();}
