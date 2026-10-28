import pool from '../config/database.js';
import {isServiceCreditPolicy} from '../utils/serviceCreditPolicy.js';

const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);

export function authorizedCompensationSchedule(row) {
  const data = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
  if (row.revoked_at || !row.approved_by_user_id || !row.approved_at || !row.reason?.trim()) return null;
  if (!isServiceCreditPolicy(data?.compensationPolicyVersion) || !data.schedule) return null;
  const effectiveOn = day(row.effective_start);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) || new Date(`${effectiveOn}T12:00:00Z`).toISOString().slice(0,10)!==effectiveOn) return null;
  return {id:Number(row.contract_generation_id), data, agreementDate:day(data.effectiveDate),
    effectiveOn, completedOn:null, executed:false, payrollAuthorized:true,
    payrollAuthorizationId:Number(row.id), approvedByUserId:Number(row.approved_by_user_id)};
}

export async function authorizedCompensationSchedules({agencyId,userId}, db=pool) {
  try {
    const [rows] = await db.execute(`SELECT * FROM payroll_compensation_authorizations
      WHERE agency_id=? AND user_id=? AND revoked_at IS NULL ORDER BY effective_start DESC,id DESC`,[agencyId,userId]);
    return rows.map(authorizedCompensationSchedule).filter(Boolean);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}
