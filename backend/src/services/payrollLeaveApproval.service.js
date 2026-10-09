import pool from '../config/database.js';
import {currentEligibleSickRate} from './sickLeaveRate.service.js';
import {loadUserPaySystemContext} from './paySystem.service.js';
import {LEAVE_BALANCE_COLUMNS,validateLeaveItems,leaveLabel} from '../utils/supplementalLeave.js';
/** Approval, deduction and taxable payroll pay are one transaction. No partial approval on failure. */
export async function approveLeaveAtomically({agencyId,requestId,actorId,targetPayrollPeriodId,overrideBalance=false,policy,defaultPayRate}) {
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  const [[req]]=await db.execute('SELECT * FROM payroll_pto_requests WHERE id=? AND agency_id=? FOR UPDATE',[requestId,agencyId]);
  if(!req||!['submitted','deferred'].includes(req.status))throw Error('Leave request is not pending');
  const bucket=req.request_type,column=LEAVE_BALANCE_COLUMNS[bucket];if(!column)throw Error('Unknown leave bucket');
  const [[acct]]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=? AND user_id=? FOR UPDATE',[agencyId,req.user_id]);
  if(!acct)throw Error('Leave account missing');
  if(bucket==='training'&&(!policy.trainingPtoEnabled||(!policy.sharedLeaveAccrualEnabled&&!acct.training_pto_eligible)))throw Error('Training PTO is not enabled');
  if(bucket==='training'&&(!req.training_description?.trim()||!req.proof_file_path))throw Error('Training description and documentation are required');
  if(bucket==='school_support'&&!policy.schoolSupportEnabled)throw Error('School support leave is not enabled');
  const [rawItems]=await db.execute('SELECT * FROM payroll_pto_request_items WHERE request_id=? ORDER BY request_date,id FOR UPDATE',[requestId]);
  const items=validateLeaveItems(rawItems),total=items.reduce((n,i)=>n+i.hours,0);
  if(!overrideBalance&&total>Number(acct[column])+1e-8)throw Error('Insufficient leave balance');
  const payments=new Map(),rates=[];
  for(const item of items){
   const params=targetPayrollPeriodId?[agencyId,Number(targetPayrollPeriodId)]:[agencyId,item.date];
   const [[period]]=await db.execute(targetPayrollPeriodId?"SELECT id,status FROM payroll_periods WHERE agency_id=? AND id=? FOR UPDATE":"SELECT id,status FROM payroll_periods WHERE agency_id=? AND period_end>=? AND status NOT IN ('posted','finalized') ORDER BY period_end LIMIT 1 FOR UPDATE",params);
   if(!period||['posted','finalized'].includes(period.status))throw Error('Choose an open payroll period before approval');
   let rate;
   if(bucket==='school_support'){
    const ctx=await loadUserPaySystemContext({agencyId,userId:req.user_id,periodEnd:item.date});
    rate=Number(ctx.enabled?ctx.rateProfile?.supportActivityRate:policy.schoolSupportHourlyRate);
   }else rate=await currentEligibleSickRate({agencyId,userId:req.user_id,asOfDate:item.date,fallbackRate:acct.pto_pay_rate??defaultPayRate});
   if(!Number.isFinite(rate)||rate<=0)throw Error('Confirm a positive leave payment rate before approval');
   rates.push({...item,rate,payrollPeriodId:period.id});
   const payment=payments.get(period.id)||{hours:0,amount:0};payment.hours+=item.hours;payment.amount+=item.hours*rate;payments.set(period.id,payment);
  }
  for(const [pid,payment] of [...payments].sort((a,b)=>a[0]-b[0])){
   // Create only missing adjustment rows, preserving every other pay component.
   await db.execute('INSERT INTO payroll_adjustments(payroll_period_id,agency_id,user_id,updated_by_user_id) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',[pid,agencyId,req.user_id,actorId]);
   const [[adjustment]]=await db.execute('SELECT * FROM payroll_adjustments WHERE payroll_period_id=? AND user_id=? FOR UPDATE',[pid,req.user_id]);
   if(bucket==='school_support'){
    await db.execute('UPDATE payroll_adjustments SET other_taxable_amount=COALESCE(other_taxable_amount,0)+?,updated_by_user_id=? WHERE payroll_period_id=? AND user_id=?',[Math.round(payment.amount*100)/100,actorId,pid,req.user_id]);
   }else{
    const oldHours=Number(adjustment.sick_pto_hours||0)+Number(adjustment.training_pto_hours||0),hours=oldHours+payment.hours;
    const rate=(oldHours*Number(adjustment.pto_rate||0)+payment.amount)/hours;
    const payColumn=bucket==='training'?'training_pto_hours':'sick_pto_hours';
    await db.execute(`UPDATE payroll_adjustments SET ${payColumn}=COALESCE(${payColumn},0)+?,pto_hours=?,pto_rate=?,updated_by_user_id=? WHERE payroll_period_id=? AND user_id=?`,[payment.hours,hours,rate,actorId,pid,req.user_id]);
   }
  }
  for(const item of rates)await db.execute("INSERT INTO payroll_pto_ledger(agency_id,user_id,entry_type,pto_bucket,hours_delta,effective_date,payroll_period_id,request_id,note,created_by_user_id) VALUES(?,?,'usage',?,?,?,?,?,?,?)",[agencyId,req.user_id,bucket,-item.hours,item.date,item.payrollPeriodId,requestId,`${leaveLabel(bucket)} approved at $${item.rate.toFixed(2)}/hour`,actorId]);
  await db.execute(`UPDATE payroll_pto_accounts SET ${column}=${column}-?,updated_by_user_id=? WHERE agency_id=? AND user_id=?`,[total,actorId,agencyId,req.user_id]);
  await db.execute("UPDATE payroll_pto_requests SET status='approved',approved_by_user_id=?,approved_at=NOW(),approved_payroll_period_id=?,approved_rates_json=?,rejected_by_user_id=NULL,rejected_at=NULL,rejection_reason=NULL WHERE id=? AND agency_id=?",[actorId,rates[0].payrollPeriodId,JSON.stringify(rates),requestId,agencyId]);
  await db.commit();return {ok:true,affectedPayrollPeriodIds:[...payments.keys()],skippedDates:[],failedPeriods:[]};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
