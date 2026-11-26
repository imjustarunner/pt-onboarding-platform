import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { transferProcedure } from './ptoTransferProcedure.mjs';

const env = dotenv.parse(fs.readFileSync(process.env.PTO_TRANSFER_ENV || '/Users/mendez/PTOnboardingApp/backend/.env','utf8').split('\n').filter(l=>/^DB_(USER|PASSWORD|NAME)=/.test(l)).join('\n'));
const db = await mysql.createConnection({host:'127.0.0.1',port:3308,user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME});
const tables = ['users','user_agencies','payroll_pto_accounts','payroll_pto_requests','payroll_pto_request_items','payroll_periods','payroll_adjustments','payroll_pto_ledger','payroll_manual_pay_lines','payroll_summaries','user_activity_log'];
const procedure = `codex_pto_transfer_test_${crypto.randomBytes(6).toString('hex')}`;
const plan = {agencyId:999002,employeeId:999486,requestId:999094,sourcePeriodId:999149,targetPeriodId:999151,hours:10,rate:28,sourceHours:27.5,items:[{date:'2026-12-17',hours:8},{date:'2026-12-18',hours:2}],authorization:'Synthetic test only'};
let built, passed=0;
async function seed() {
  for (const table of tables) {
    const [[schema]] = await db.query(`SHOW CREATE TABLE \`${table}\``);
    assert.match(Object.values(schema)[1],/CREATE TEMPORARY TABLE/);
    await db.query(`DELETE FROM \`${table}\``);
  }
  await db.query("INSERT INTO users(id,first_name,last_name,role,status,is_assistant_account,is_active,is_archived,password_hash) VALUES(999999,'Synthetic','Automation','assistant','ARCHIVED',1,0,1,NULL),(999486,'Synthetic','Employee','provider','ACTIVE_EMPLOYEE',0,1,0,NULL)");
  await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(999486,999002)');
  await db.query("INSERT INTO payroll_periods(id,agency_id,label,period_start,period_end,status,created_by_user_id) VALUES(999149,999002,'Source','2026-11-07','2026-11-20','ran',888),(999151,999002,'Target','2026-11-21','2026-12-04','draft',888)");
  await db.query('INSERT INTO payroll_pto_accounts(agency_id,user_id,sick_balance_hours,updated_by_user_id) VALUES(999002,999486,50,888)');
  for (const [id,hours] of [[999094,10],[999095,15],[999090,2.5]]) await db.execute("INSERT INTO payroll_pto_requests(id,agency_id,user_id,request_type,status,total_hours,approved_by_user_id,approved_at,approved_payroll_period_id,approved_rates_json) VALUES(?,999002,999486,'sick','approved',?,888,'2026-11-20 12:00:00',999149,?)",[id,hours,JSON.stringify(plan.items.map(i=>({date:i.date,rate:28,hours:i.hours,payrollPeriodId:999149})))]);
  for (const item of plan.items) {
    await db.execute('INSERT INTO payroll_pto_request_items(request_id,agency_id,request_date,hours) VALUES(999094,999002,?,?)',[item.date,item.hours]);
    await db.execute("INSERT INTO payroll_pto_ledger(agency_id,user_id,entry_type,pto_bucket,hours_delta,effective_date,payroll_period_id,request_id,created_by_user_id) VALUES(999002,999486,'usage','sick',?,? ,999149,999094,888)",[-item.hours,item.date]);
  }
  await db.query('INSERT INTO payroll_adjustments(payroll_period_id,agency_id,user_id,sick_pto_hours,training_pto_hours,pto_hours,pto_rate,other_taxable_amount,updated_by_user_id) VALUES(999149,999002,999486,27.5,0,27.5,28,17,888)');
  await db.query('INSERT INTO payroll_summaries(payroll_period_id,agency_id,user_id,total_amount) VALUES(999149,999002,999486,1000),(999148,999002,999486,600)');
}
const call = (apply,hash=built.hash) => db.query(`CALL \`${procedure}\`(?,?)`,[hash,apply]);
const check = async (name,fn) => {await seed();await fn();console.log(`PASS ${name}`);passed++;};
try {
  for (const table of tables) {
    const [[schema]] = await db.query(`SHOW CREATE TABLE \`${table}\``);
    const sql = Object.values(schema)[1].replace(/^CREATE TABLE /,'CREATE TEMPORARY TABLE ')
      .split('\n').filter(line=>!line.includes('FOREIGN KEY')).join('\n').replace(/,\n\)/g,'\n)');
    await db.query(sql);
  }
  await seed();
  const [[{name}]] = await db.query("SELECT SUBSTRING_INDEX(USER(),'@',1) name");
  const [[{hash}]] = await db.query('SELECT SHA2(CAST(approved_rates_json AS CHAR),256) hash FROM payroll_pto_requests WHERE id=999094');
  built = transferProcedure({procedure,databaseUser:name,actorId:999999,plan:{...plan,ratesHash:hash},cloudOperator:'synthetic test'});
  await db.query(built.sql);
  await check('dry run and wrong hash leave financial data unchanged',async()=>{
    const [[ready]]=await call(false);assert.equal(ready[0].execution_status,'ready');
    await assert.rejects(call(true,'0'.repeat(64)),e=>e.sqlState==='45000');
    const [[a]]=await db.query('SELECT sick_pto_hours FROM payroll_adjustments WHERE payroll_period_id=999149');assert.equal(Number(a.sick_pto_hours),27.5);
    const [[l]]=await db.query('SELECT COUNT(*) n FROM payroll_pto_ledger');assert.equal(l.n,2);
  });
  await check('moves only selected pay, keeps balance and original approval, preserves old usage and appends automation audit',async()=>{
    const [[result]]=await call(true);assert.equal(result[0].execution_status,'applied');
    const [adjustments]=await db.query('SELECT payroll_period_id,sick_pto_hours,pto_rate,other_taxable_amount,updated_by_user_id FROM payroll_adjustments ORDER BY payroll_period_id');
    assert.deepEqual(adjustments.map(a=>[a.payroll_period_id,Number(a.sick_pto_hours),Number(a.pto_rate)]),[[999149,17.5,28],[999151,10,28]]);assert.equal(Number(adjustments[0].other_taxable_amount),17);assert.ok(adjustments.every(a=>a.updated_by_user_id===999999));
    const [[r]]=await db.query('SELECT approved_payroll_period_id,approved_by_user_id,total_hours,approved_rates_json FROM payroll_pto_requests WHERE id=999094');assert.equal(r.approved_payroll_period_id,999151);assert.equal(r.approved_by_user_id,888);assert.equal(Number(r.total_hours),10);assert.ok((typeof r.approved_rates_json==='string'?JSON.parse(r.approved_rates_json):r.approved_rates_json).every(i=>i.payrollPeriodId===999151&&i.rate===28));
    const [[others]]=await db.query('SELECT SUM(total_hours) hours FROM payroll_pto_requests WHERE approved_payroll_period_id=999149');assert.equal(Number(others.hours),17.5);
    const [[balance]]=await db.query('SELECT sick_balance_hours FROM payroll_pto_accounts');assert.equal(Number(balance.sick_balance_hours),50);
    const [ledger]=await db.query('SELECT * FROM payroll_pto_ledger ORDER BY id');assert.equal(ledger.length,6);assert.equal(ledger.filter(l=>l.created_by_user_id===888).length,2);assert.equal(ledger.reduce((s,l)=>s+Number(l.hours_delta),0),-10);
    const [[audit]]=await db.query("SELECT user_id,JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.actor_type')) actor FROM user_activity_log");assert.equal(audit.user_id,999999);assert.equal(audit.actor,'automation');
    const [[old]]=await db.query('SELECT total_amount FROM payroll_summaries WHERE payroll_period_id=999148');assert.equal(Number(old.total_amount),600);
    const [[again]]=await call(true);assert.equal(again[0].execution_status,'already_applied');const [[count]]=await db.query('SELECT COUNT(*) n FROM payroll_pto_ledger');assert.equal(count.n,6);
  });
  for (const [name,change] of [
    ['posted source',"UPDATE payroll_periods SET posted_at=NOW() WHERE id=999149"],
    ['posted target',"UPDATE payroll_periods SET status='posted' WHERE id=999151"],
    ['manual current reduction','UPDATE payroll_adjustments SET sick_pto_hours=17.5 WHERE payroll_period_id=999149'],
    ['existing target adjustment','INSERT INTO payroll_adjustments(payroll_period_id,agency_id,user_id,sick_pto_hours,pto_hours,pto_rate,updated_by_user_id) VALUES(999151,999002,999486,5,5,29,888)'],
    ['changed saved rate',"UPDATE payroll_pto_requests SET approved_rates_json=JSON_SET(approved_rates_json,'$[0].rate',29) WHERE id=999094"],
    ['changed request date',"UPDATE payroll_pto_request_items SET request_date='2026-12-19' WHERE request_date='2026-12-18'"],
    ['duplicated item hours',"UPDATE payroll_pto_request_items SET request_date='2026-12-17',hours=8 WHERE hours=2"],
    ['changed usage date',"UPDATE payroll_pto_ledger SET effective_date='2026-12-19' WHERE hours_delta=-2"],
    ['actor with tenant access','INSERT INTO user_agencies(user_id,agency_id) VALUES(999999,999002)']
  ]) await check(`rejects ${name}`,async()=>{await db.query(change);await assert.rejects(call(true),e=>e.sqlState==='45000');const [[r]]=await db.query('SELECT approved_payroll_period_id FROM payroll_pto_requests WHERE id=999094');assert.equal(r.approved_payroll_period_id,999149);});
  await check('rolls back pay changes on a later ledger failure',async()=>{
    await db.query('ALTER TABLE payroll_pto_ledger MODIFY note VARCHAR(1)');
    try {await assert.rejects(call(true));const [[a]]=await db.query('SELECT sick_pto_hours FROM payroll_adjustments WHERE payroll_period_id=999149');assert.equal(Number(a.sick_pto_hours),27.5);const [[t]]=await db.query('SELECT COUNT(*) n FROM payroll_adjustments WHERE payroll_period_id=999151');assert.equal(t.n,0);}
    finally {await db.query('ALTER TABLE payroll_pto_ledger MODIFY note VARCHAR(255)');}
  });
  console.log(JSON.stringify({passed,scope:'Synthetic connection-local temporary tables only; no permanent payroll data changed'}));
} finally {await db.query(`DROP PROCEDURE IF EXISTS \`${procedure}\``);await db.end();}
