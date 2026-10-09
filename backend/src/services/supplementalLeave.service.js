import pool from '../config/database.js';
import {sharedLeaveBasis,supplementalEarn} from '../utils/supplementalLeave.js';
const date=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
export async function hasSchoolAssignment({agencyId,userId,db=pool}){
 const [rows]=await db.execute(`SELECT psa.id FROM provider_school_assignments psa JOIN agencies a ON a.id=psa.school_organization_id WHERE psa.provider_user_id=? AND psa.is_active=1 AND (a.id=? OR EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=a.id AND oa.agency_id=?)) LIMIT 1`,[userId,agencyId,agencyId]);return !!rows.length;
}
/** Atomic per-bucket posting: retries cannot accrue twice; training waits for the ADP handoff. */
export async function postSupplementalLeave({agencyId,userId,payrollPeriodId,period,summaryRow,employmentType,policy,actorId}){
 if(!policy.sharedLeaveAccrualEnabled)return [];
 if(!['posted','finalized'].includes(period.status))throw Error('Leave accrual requires a posted payroll period');
 const basis=sharedLeaveBasis({summaryRow,policy,employmentType});const warnings=[];
 const db=await pool.getConnection();
 try{await db.beginTransaction();
 const [[acct]]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=? AND user_id=? FOR UPDATE',[agencyId,userId]);
 if(!acct)throw Error('Leave account missing');
 const school=policy.schoolSupportEnabled&&await hasSchoolAssignment({agencyId,userId,db});
 for(const bucket of ['training','school_support']){
  if(bucket==='school_support'&&!school)continue;
  if(bucket==='training'&&!policy.trainingPtoEnabled)continue;
  const through=bucket==='training'?date(acct.training_adp_through_date):String(policy.schoolSupportAccrualAfter||'');
  if(!through||(bucket==='training'&&!acct.training_adp_confirmed_at)){warnings.push({userId,bucket,message:'Confirm the opening balance and last included pay-period date before accrual.'});continue;}
  if(date(period.period_end)<=through)continue;
  if(date(period.period_start)<=through){warnings.push({userId,bucket,message:'Opening-balance date falls inside this pay period; reconcile the partial period before accrual.'});continue;}
  const [existing]=await db.execute('SELECT 1 FROM payroll_leave_basis_postings WHERE agency_id=? AND user_id=? AND payroll_period_id=? AND pto_bucket=?',[agencyId,userId,payrollPeriodId,bucket]);if(existing.length)continue;
  const column=bucket==='training'?'training_balance_hours':'school_support_balance_hours';
  const earn=supplementalEarn({basisHours:basis,bucket,balance:acct[column],trainingCap:policy.trainingMaxBalance??20});
  await db.execute('INSERT INTO payroll_leave_basis_postings(agency_id,user_id,payroll_period_id,pto_bucket,basis_hours,earned_hours) VALUES(?,?,?,?,?,?)',[agencyId,userId,payrollPeriodId,bucket,basis,earn]);
  if(earn>0){
   await db.execute(`INSERT INTO payroll_pto_ledger(agency_id,user_id,entry_type,pto_bucket,hours_delta,effective_date,payroll_period_id,note,created_by_user_id) VALUES(?,?,'accrual',?,?,?,?,?,?)`,[agencyId,userId,bucket,earn,date(period.period_end),payrollPeriodId,`Shared sick-leave basis: ${basis.toFixed(6)} qualifying hours`,actorId]);
   await db.execute(`UPDATE payroll_pto_accounts SET ${column}=${column}+?,updated_by_user_id=? WHERE agency_id=? AND user_id=?`,[earn,actorId,agencyId,userId]);
  }
 }
 await db.commit();return warnings;
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function validateTrainingHandoff({agencyId,userId,throughDate,db=pool}) {
 const d=date(throughDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Choose the last pay-period date included in the ADP balance');
 const [[period]]=await db.execute("SELECT id FROM payroll_periods WHERE agency_id=? AND period_end=? AND status IN ('posted','finalized') LIMIT 1",[agencyId,d]);
 if(!period)throw Error('Choose the end date of a posted or finalized payroll period included in ADP');
 const [[acct]]=await db.execute('SELECT training_adp_through_date FROM payroll_pto_accounts WHERE agency_id=? AND user_id=?',[agencyId,userId]);
 const [[used]]=await db.execute("SELECT 1 FROM payroll_leave_basis_postings WHERE agency_id=? AND user_id=? AND pto_bucket='training' LIMIT 1",[agencyId,userId]);
 if(used&&date(acct?.training_adp_through_date)!==d)throw Error('Accrual has started; use an audited balance correction instead of changing the handoff date');
 return d;
}
/** A confirmed ADP balance is the balance THROUGH a completed pay period, not a new accrual. */
export async function confirmTrainingHandoff({agencyId,userId,throughDate,actorId}){
 const d=date(throughDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Choose the last pay-period date included in the ADP balance');
 const db=await pool.getConnection();try{await db.beginTransaction();
 const [[period]]=await db.execute("SELECT id FROM payroll_periods WHERE agency_id=? AND period_end=? AND status IN ('posted','finalized') LIMIT 1",[agencyId,d]);if(!period)throw Error('Choose the end date of a posted or finalized payroll period included in ADP');
 const [[acct]]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=? AND user_id=? FOR UPDATE',[agencyId,userId]);if(!acct)throw Error('Save the training balance first');
 const [[used]]=await db.execute("SELECT 1 FROM payroll_leave_basis_postings WHERE agency_id=? AND user_id=? AND pto_bucket='training' LIMIT 1",[agencyId,userId]);
 if(used&&date(acct.training_adp_through_date)!==d)throw Error('Accrual has started; use an audited balance correction instead of changing the handoff date');
 await db.execute('UPDATE payroll_pto_accounts SET training_adp_through_date=?,training_adp_confirmed_at=NOW(),training_pto_eligible=1,updated_by_user_id=? WHERE agency_id=? AND user_id=?',[d,actorId,agencyId,userId]);await db.commit();
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}

export async function catchUpTrainingAfterHandoff({agencyId,userId,actorId}) {
 const {getAgencyPtoPolicy,resolvePtoEmploymentType}=await import('./payrollPto.service.js');
 const {policy}=await getAgencyPtoPolicy({agencyId});if(!policy.sharedLeaveAccrualEnabled)return [];
 const [rows]=await pool.execute(`SELECT s.*,a.employment_type AS leave_employment_type,p.period_start,p.period_end,p.status AS payroll_period_status,p.id AS period_id FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id JOIN payroll_pto_accounts a ON a.agency_id=s.agency_id AND a.user_id=s.user_id WHERE s.agency_id=? AND s.user_id=? AND p.status IN ('posted','finalized') AND p.period_end>a.training_adp_through_date ORDER BY p.period_end`,[agencyId,userId]);
 const warnings=[];for(const row of rows){const employmentType=await resolvePtoEmploymentType({agencyId,userId,asOfDate:date(row.period_end),existingType:row.leave_employment_type});warnings.push(...await postSupplementalLeave({agencyId,userId,payrollPeriodId:row.period_id,period:{...row,status:row.payroll_period_status},summaryRow:row,employmentType,policy,actorId}));}return warnings;
}
