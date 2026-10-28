import pool from '../config/database.js';

// Manual adjustments alone do not authorize suppressing new service pay.
// A separate approval must identify this employee, period, and exact amount.
export async function approvedPeriodSalaryOverride({agencyId,payrollPeriodId,userId,manualSalaryAmount},db=pool) {
  if (!(Number(manualSalaryAmount)>0)) return null;
  let rows;
  try {
    [rows]=await db.execute(`SELECT * FROM payroll_period_salary_authorizations
      WHERE agency_id=? AND payroll_period_id=? AND user_id=? AND revoked_at IS NULL`,[agencyId,payrollPeriodId,userId]);
  } catch(error) {
    if(error.code==='ER_NO_SUCH_TABLE')return null;
    throw error;
  }
  const row=rows[0];
  if(!row || !row.approved_by_user_id || !row.approved_at || !row.reason?.trim())return null;
  if(Math.abs(Number(row.salary_amount)-Number(manualSalaryAmount))>0.001)return null;
  return row;
}
