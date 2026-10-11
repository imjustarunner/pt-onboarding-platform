import pool from '../config/database.js';
import { effectiveCompensationAgreement } from './employmentAgreementPolicy.service.js';

const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const review = message => Object.assign(new Error(message), {code:'AMENDMENT_PAYROLL_REVIEW_REQUIRED',statusCode:409});

/** Validate the entire selection, then activate it in one transaction. Never posts payroll. */
export async function activatePayrollAssignments(agencyId, {
  effectiveStart, waiveProbation=false, enrollExistingWithoutPending=true, appliedByUserId=null
} = {}) {
  const start=day(effectiveStart);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || new Date(`${start}T12:00:00Z`).toISOString().slice(0,10)!==start) throw Error('effectiveStart must be a valid YYYY-MM-DD date');
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]]=await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[agencyId]);
    if(!agency)throw review('Agency not found.');
    const [[period]]=await db.execute('SELECT id,period_end,status FROM payroll_periods WHERE agency_id=? AND period_start=? FOR UPDATE',[agencyId,start]);
    if(!period || !['draft','raw_imported','staged','ran'].includes(period.status))throw review('Choose the start of an open service pay period. Posted payroll cannot be activated again.');
    const [existing]=await db.execute('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=? FOR UPDATE',[agencyId]);
    const [pending]=await db.execute('SELECT * FROM payroll_user_compensation_level_pending WHERE agency_id=? FOR UPDATE',[agencyId]);
    const [active]=await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1
      AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0 AND u.status='ACTIVE_EMPLOYEE'
      AND u.role IN ('provider','provider_plus','clinical_practice_assistant','admin','super_admin','support','supervisor')`,[agencyId]);
    const activeIds=new Set(active.map(row=>Number(row.id)));
    const oldById=new Map(existing.map(row=>[Number(row.user_id),row]));
    const selected=new Map();
    if(enrollExistingWithoutPending)for(const row of existing){
      if(activeIds.has(Number(row.user_id)) && !Number(row.pay_system_enabled))selected.set(Number(row.user_id),{...row,pay_system_enabled:1});
    }
    for(const row of pending){
      if(!activeIds.has(Number(row.user_id)))throw review(`Staged employee ${row.user_id} is not active in this agency. Remove their staged change before activation.`);
      selected.set(Number(row.user_id),{...oldById.get(Number(row.user_id)),...row,staged:true});
    }
    if(!selected.size)throw review('No eligible employees selected for activation. Stage the employees to enroll.');
    // Complete every check before writing any employee or agency activation flags.
    for(const [userId,row] of selected){
      row.start=[start,day(oldById.get(userId)?.pay_system_effective_start)||start].sort().at(-1);
      if(!Number(row.pay_system_enabled))continue;
      const old=oldById.get(userId);
      if(Number(old?.pay_system_enabled) && day(old.pay_system_effective_start)!==row.start)throw review(`Employee ${userId} is already enrolled. Keep their original activation date to protect earlier payroll.`);
      if(Number(old?.pay_system_enabled) && (Number(old.category)!==Number(row.category)||Number(old.level)!==Number(row.level)))throw review(`Employee ${userId} is already enrolled. A level change needs a dated rate review; it cannot overwrite historical terms.`);
      if(![1,2,3].includes(Number(row.category))||![1,2,3,4,5].includes(Number(row.level)))throw review(`Employee ${userId} needs a valid category and level.`);
      const [[rate]]=await db.execute('SELECT id FROM payroll_pay_system_rates WHERE agency_id=? AND category=? AND level=?',[agencyId,row.category,row.level]);
      if(!rate)throw review(`Employee ${userId}'s rate profile has not been configured.`);
      const agreement=await effectiveCompensationAgreement({agencyId,userId,asOfDate:day(period.period_end)},db);
      if(!agreement || Number(agreement.data.schedule?.category)!==Number(row.category)||Number(agreement.data.schedule?.level)!==Number(row.level))throw review(`Employee ${userId} needs an executed, countersigned agreement matching the assigned category and level.`);
      const [salary]=await db.execute(`SELECT id FROM payroll_salary_positions WHERE agency_id IN (0,?) AND user_id=?
        AND include_service_pay=0 AND (effective_start IS NULL OR effective_start<=?) AND (effective_end IS NULL OR effective_end>=?)`,[agencyId,userId,day(period.period_end),row.start]);
      if(salary.length)throw review(`Employee ${userId} has a salary that excludes service pay during the new-pay dates. Resolve that overlap before activation.`);
    }
    let appliedPending=0,enrolledExisting=0;
    for(const [userId,row] of selected){
      await db.execute(`INSERT INTO payroll_user_compensation_levels
        (agency_id,user_id,category,level,bypass,pay_system_enabled,pay_system_effective_start,waive_probation,assigned_by_user_id)
        VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE category=VALUES(category),level=VALUES(level),bypass=VALUES(bypass),
        pay_system_enabled=VALUES(pay_system_enabled),pay_system_effective_start=VALUES(pay_system_effective_start),
        waive_probation=IF(VALUES(waive_probation)=1,1,waive_probation),updated_at=CURRENT_TIMESTAMP`,
        [agencyId,userId,row.category,row.level??null,Number(row.bypass)||0,Number(row.pay_system_enabled)?1:0,row.start,waiveProbation||Number(row.waive_probation)?1:0,appliedByUserId||row.assigned_by_user_id||row.created_by_user_id||null]);
      if(row.staged){await db.execute('DELETE FROM payroll_user_compensation_level_pending WHERE agency_id=? AND user_id=?',[agencyId,userId]);appliedPending++;}
      else enrolledExisting++;
    }
    await db.execute('UPDATE agencies SET new_pay_system_enabled=1 WHERE id=?',[agencyId]);
    await db.commit();
    return {appliedPending,enrolledExisting,effectiveStart:start};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
