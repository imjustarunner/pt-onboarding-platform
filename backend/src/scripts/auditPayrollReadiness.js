/** Read-only payroll handoff audit. Never runs, posts, enables or changes payroll.
 * node src/scripts/auditPayrollReadiness.js --agency=2 --start=2026-10-10
 * Output contains staff identifiers; store privately, not in source control.
 */
import pool from '../config/database.js';
import { assessPayrollReadiness } from '../services/payrollReadiness.service.js';
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const agencyId = Number(args.agency);
if (!Number.isInteger(agencyId) || agencyId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(args.start || '') ||
    new Date(`${args.start}T12:00:00Z`).toISOString().slice(0, 10) !== args.start) {
  throw Error('Provide --agency=<id> and --start=YYYY-MM-DD');
}
const db = await pool.getConnection();
try {
  await db.query('SET TRANSACTION READ ONLY');
  await db.beginTransaction();
  const [[agency]] = await db.execute('SELECT id,name,new_pay_system_enabled,pto_policy_json FROM agencies WHERE id=?', [agencyId]);
  if (!agency) throw Error('Agency not found');
  const [[period]] = await db.execute('SELECT id,period_start,period_end,status FROM payroll_periods WHERE agency_id=? AND period_start=?', [agencyId, args.start]);
  const [[previousPeriod]] = await db.execute('SELECT id,period_start,period_end,status FROM payroll_periods WHERE agency_id=? AND period_end<? ORDER BY period_end DESC LIMIT 1', [agencyId, args.start]);
  const [staff] = await db.execute(`SELECT u.id,CONCAT(u.first_name,' ',u.last_name) name,u.role,u.is_hourly_worker,
    c.category,c.level,c.pay_system_enabled,c.pay_system_effective_start effective_start,
    c.spanish_bonus_eligible,c.location_bonus_eligible,
    a.user_id leave_account_user_id,a.employment_type,a.pto_pay_rate,a.training_adp_through_date,a.training_adp_confirmed_at
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    LEFT JOIN payroll_user_compensation_levels c ON c.user_id=u.id AND c.agency_id=ua.agency_id
    LEFT JOIN payroll_pto_accounts a ON a.user_id=u.id AND a.agency_id=ua.agency_id
    WHERE COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
    AND COALESCE(u.is_demo,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
    AND u.role IN ('provider','provider_plus','clinical_practice_assistant','admin','super_admin','support','supervisor')
    ORDER BY u.last_name,u.first_name`, [agencyId]);
  const [amendments] = await db.execute(`SELECT g.id,g.candidate_user_id user_id,g.task_id,
    JSON_UNQUOTE(JSON_EXTRACT(g.token_values_json,'$.effectiveDate')) effective_date,
    EXISTS(SELECT 1 FROM signed_documents s WHERE s.task_id=g.task_id AND NULLIF(s.signed_pdf_path,'') IS NOT NULL
      AND JSON_EXTRACT(s.audit_trail,'$.adminCountersign.signedAt') IS NOT NULL) executed
    FROM contract_generations g WHERE g.agency_id=?
    AND JSON_UNQUOTE(JSON_EXTRACT(g.token_values_json,'$.draftKind'))='provider_update_compensation'`, [agencyId]);
  const [salaries] = await db.execute(`SELECT user_id,include_service_pay,effective_start,effective_end
    FROM payroll_salary_positions WHERE agency_id IN (0,?) AND (effective_end IS NULL OR effective_end>=?)
    AND (effective_start IS NULL OR effective_start<=?)`, [agencyId, args.start, period?.period_end || args.start]);
  const report = assessPayrollReadiness({ agency, period, previousPeriod, staff, amendments, salaries });
  await db.rollback();
  console.log(JSON.stringify({ auditedAt: new Date().toISOString(), scope: 'Configuration only; historical service-rate and end-to-end payroll reconciliation are also required.', agency, ...report, staff, amendments, salaries }, null, 2));
  process.exitCode = report.configurationChecksPassed ? 0 : 2;
} finally {
  db.release();
  await pool.end();
}
