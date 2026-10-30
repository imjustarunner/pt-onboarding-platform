import pool from '../config/database.js';
import { sharedLeaveBasis, supplementalEarn } from '../utils/supplementalLeave.js';
import { computeSchoolClientLeaveBasis } from './schoolClientLeaveBasis.service.js';

const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const hours = value => value == null ? null : Math.round(value * 1e6) / 1e6;
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10) || null;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const time = value => value instanceof Date ? value.getTime() : Date.parse(String(value || '').replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(value || '')) ? '' : 'Z'));
const near = (a, b) => Math.abs(a - b) < 0.00001;
const reason = code => ({ code });
const safeCode = value => /^[a-z][a-z0-9_]{0,95}$/.test(String(value || '')) ? String(value) : 'school_evidence_review_required';
const summarizeReasons = rows => [...(rows || []).reduce((map, row) => {
  const code = safeCode(row?.code); map.set(code, (map.get(code) || 0) + 1); return map;
}, new Map())].map(([code, count]) => ({ code, count }));
const emptyCoverage = importId => ({ importId, reportRows: importId ? 0 : null, payableRows: importId ? 0 : null, schoolRows: importId ? 0 : null, excludedRows: importId ? 0 : null, nonpayableRows: importId ? 0 : null, reviewRows: importId ? 0 : null });
const cleanCoverage = (value, importId) => Object.fromEntries(Object.entries(emptyCoverage(importId)).map(([key, fallback]) => [key, key === 'importId' ? importId : number(value?.[key]) ?? fallback]));
const fail = (message, status) => { throw Object.assign(new Error(message), { status }); };

// For an already-booked period, compare against the same historical cap capacity.
// A missing or inconsistent ledger is a review condition, never a guessed refund.
function comparisonOpeningBalance(employee, posting, ledger) {
  if (!posting) return { balance: employee.currentSchoolSupportHours, source: 'current_earned_balance', complete: true };
  const entries = ledger.filter(row => Number(row.user_id) === employee.userId).sort((a, b) => Number(a.id) - Number(b.id));
  if (!near(entries.reduce((sum, row) => sum + Number(row.hours_delta || 0), 0), employee.currentSchoolSupportHours)) return { complete: false };
  const accruals = entries.filter(row => Number(row.payroll_period_id) === Number(posting.payroll_period_id) && row.entry_type === 'accrual');
  if (!near(accruals.reduce((sum, row) => sum + Number(row.hours_delta || 0), 0), Number(posting.earned_hours || 0))) return { complete: false };
  const first = accruals[0];
  if (!first && !Number.isFinite(time(posting.created_at))) return { complete: false };
  const before = entries.filter(row => first ? Number(row.id) < Number(first.id) : time(row.created_at) < time(posting.created_at));
  const balance = before.reduce((sum, row) => sum + Number(row.hours_delta || 0), 0);
  return { balance: hours(balance), source: 'ledger_before_booked_accrual', complete: balance >= 0 };
}

/** Payroll-only review data. This function performs SELECTs only and never posts accrual. */
export async function buildSchoolSupportAccrualReview({ agencyId, payrollPeriodId, db = pool }) {
  const aid = Number(agencyId), pid = Number(payrollPeriodId);
  if (!Number.isInteger(aid) || aid <= 0 || !Number.isInteger(pid) || pid <= 0) fail('Valid agencyId and payrollPeriodId are required.', 400);
  const [[savedPeriod]] = await db.execute(`SELECT p.id,p.agency_id,p.status,
    DATE_FORMAT(p.period_start,'%Y-%m-%d') period_start,DATE_FORMAT(p.period_end,'%Y-%m-%d') period_end,a.pto_policy_json
    FROM payroll_periods p JOIN agencies a ON a.id=p.agency_id WHERE p.id=? AND p.agency_id=?`, [pid, aid]);
  if (!savedPeriod) fail('Payroll period not found in this organization.', 404);
  const policy = parse(savedPeriod.pto_policy_json);
  const period = { id: pid, agencyId: aid, start: date(savedPeriod.period_start), end: date(savedPeriod.period_end), status: savedPeriod.status };
  const [[latestImport]] = await db.execute('SELECT id,slot_number,created_at FROM payroll_imports WHERE agency_id=? AND payroll_period_id=? ORDER BY created_at DESC,id DESC LIMIT 1', [aid, pid]);
  const [roster, summaries, postings, importRows] = await Promise.all([
    db.execute(`SELECT u.id user_id,u.first_name,u.last_name,u.role,pa.employment_type,
      pa.school_support_balance_hours,
      EXISTS(SELECT 1 FROM provider_school_assignments psa JOIN agencies school ON school.id=psa.school_organization_id
        WHERE psa.provider_user_id=u.id AND psa.is_active=1 AND (school.id=? OR EXISTS(
          SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=school.id AND oa.agency_id=?))) school_assigned
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      LEFT JOIN payroll_pto_accounts pa ON pa.user_id=u.id AND pa.agency_id=ua.agency_id
      WHERE u.id<>1 AND u.status='ACTIVE_EMPLOYEE' AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
        AND u.terminated_at IS NULL AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_demo,0)=0
        AND COALESCE(u.created_via_dev_fill,0)=0
        AND LOWER(COALESCE(u.role,'')) NOT IN ('guardian','client_guardian','client','school_staff','school_support','applicant')
        AND TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))<>''
      ORDER BY u.last_name,u.first_name,u.id`, [aid, aid, aid]),
    db.execute('SELECT * FROM payroll_summaries WHERE agency_id=? AND payroll_period_id=?', [aid, pid]),
    db.execute("SELECT user_id,payroll_period_id,basis_hours,earned_hours,created_at FROM payroll_leave_basis_postings WHERE agency_id=? AND payroll_period_id=? AND pto_bucket='school_support'", [aid, pid]),
    latestImport ? db.execute(`SELECT user_id,COUNT(*) report_rows,
      SUM(note_status='FINALIZED' OR (note_status='DRAFT' AND COALESCE(draft_payable,1)=1)) payable_rows,
      SUM(service_date IS NULL) undated_rows,
      SUM(service_date IS NULL AND (note_status='FINALIZED' OR (note_status='DRAFT' AND COALESCE(draft_payable,1)=1))) undated_payable_rows,
      MIN(service_date) first_service_date,MAX(service_date) last_service_date
      FROM payroll_import_rows WHERE agency_id=? AND payroll_period_id=? AND payroll_import_id=? GROUP BY user_id`, [aid, pid, latestImport.id]) : Promise.resolve([[]])
  ]);
  const staff = roster[0], summaryByUser = new Map(summaries[0].map(row => [Number(row.user_id), row]));
  const postingByUser = new Map(postings[0].map(row => [Number(row.user_id), row]));
  const rowsByUser = new Map(importRows[0].map(row => [Number(row.user_id), row]));
  let ledger = [];
  if (postings[0].length) [ledger] = await db.execute("SELECT id,user_id,entry_type,hours_delta,payroll_period_id,created_at FROM payroll_pto_ledger WHERE agency_id=? AND pto_bucket='school_support' ORDER BY id", [aid]);
  const sourceRows = importRows[0];
  const availableDates = field => sourceRows.map(row => date(row[field])).filter(Boolean).sort();
  const unassigned = rowsByUser.get(0);
  const importCoverage = { present: !!latestImport, importId: latestImport?.id || null, slot: latestImport?.slot_number || null, uploadedAt: latestImport?.created_at || null,
    reportRows: latestImport ? sourceRows.reduce((sum, row) => sum + Number(row.report_rows || 0), 0) : null,
    payableRows: latestImport ? sourceRows.reduce((sum, row) => sum + Number(row.payable_rows || 0), 0) : null,
    firstServiceDate: availableDates('first_service_date')[0] || null, lastServiceDate: availableDates('last_service_date').at(-1) || null,
    unassignedPayableRows: latestImport ? Number(unassigned?.payable_rows || 0) : null };
  const employees = staff.map(row => {
    const userId = Number(row.user_id), posting = postingByUser.get(userId);
    return { userId, firstName: row.first_name || '', lastName: row.last_name || '', name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      schoolAssigned: Number(row.school_assigned) === 1, currentSchoolSupportHours: number(row.school_support_balance_hours), protectedEarnedBalanceHours: number(row.school_support_balance_hours),
      bookedAccrual: posting ? { payrollPeriodId: pid, basisHours: number(posting.basis_hours), earnedHours: number(posting.earned_hours), bookedAt: posting.created_at } : null,
      summaryAvailable: summaryByUser.has(userId), comparisonStartingBalanceHours: null, comparisonStartingBalanceSource: null,
      allWork: { basisHours: null, estimatedEarnedHours: null }, schoolOnly: { basisHours: null, estimatedEarnedHours: null, coverage: emptyCoverage(latestImport?.id || null), reviewReasons: [] },
      difference: { basisHours: null, earnedHours: null }, complete: false, status: 'awaiting_billing_import', reviewReasons: [], employmentType: row.employment_type || null };
  });
  let next = 0;
  async function reviewEmployee(employee) {
    const pending = (status, code) => { employee.status = status; employee.reviewReasons.push(reason(code)); };
    if (!latestImport) return pending('awaiting_billing_import', 'billing_import_missing');
    const summary = summaryByUser.get(employee.userId), posting = postingByUser.get(employee.userId), source = rowsByUser.get(employee.userId);
    const completeZero = status => {
      employee.allWork = { basisHours: 0, estimatedEarnedHours: 0 };
      employee.schoolOnly.basisHours = 0; employee.schoolOnly.estimatedEarnedHours = 0;
      employee.difference = { basisHours: 0, earnedHours: 0 };
      employee.complete = true; employee.status = status;
    };
    // Eligibility alone establishes zero new school-bank earning for office-only
    // staff, even when their separate payroll summary has not been calculated.
    if (!employee.schoolAssigned) return completeZero('not_school_assigned');
    if (!summary) {
      const calculated = ['ran', 'posted', 'finalized'].includes(String(period.status || '').toLowerCase());
      const noPayableRows = !source || number(source.payable_rows) === 0;
      if (calculated && noPayableRows && !posting && importCoverage.unassignedPayableRows === 0) return completeZero('not_in_payroll');
      return pending('awaiting_payroll_summary', 'payroll_summary_missing');
    }
    if (Number.isFinite(time(summary.computed_at)) && Number.isFinite(time(latestImport.created_at)) && time(summary.computed_at) < time(latestImport.created_at)) return pending('awaiting_payroll_summary', 'payroll_summary_predates_latest_import');
    if (employee.currentSchoolSupportHours == null || employee.currentSchoolSupportHours < 0 || !['hourly','fee_for_service','salaried'].includes(employee.employmentType)) return pending('awaiting_account_review', 'school_support_account_incomplete');
    if (!policy.schoolSupportEnabled || !policy.sharedLeaveAccrualEnabled) return pending('school_support_disabled', 'school_support_policy_disabled');
    const through = date(policy.schoolSupportAccrualAfter);
    if (!through || period.start <= through) return pending('awaiting_policy_review', 'period_school_support_start_requires_review');
    if (Number(source?.undated_payable_rows || 0) > 0) return pending('awaiting_school_evidence', 'payable_service_date_missing');
    const opening = comparisonOpeningBalance(employee, posting, ledger);
    if (!opening.complete) return pending('awaiting_account_review', 'booked_accrual_opening_balance_unavailable');
    employee.comparisonStartingBalanceHours = opening.balance; employee.comparisonStartingBalanceSource = opening.source;
    let allWorkBasis;
    try { allWorkBasis = sharedLeaveBasis({ summaryRow: summary, policy, employmentType: employee.employmentType }); }
    catch { return pending('awaiting_payroll_summary', 'saved_leave_basis_incomplete'); }
    if (!Number.isFinite(allWorkBasis) || allWorkBasis < 0) return pending('awaiting_payroll_summary', 'saved_leave_basis_invalid');
    // The old all-work rule still required a school assignment; office-only employees did not earn this bank.
    if (!employee.schoolAssigned) allWorkBasis = 0;
    const allWorkEarn = employee.schoolAssigned ? supplementalEarn({ basisHours: allWorkBasis, bucket: 'school_support', balance: opening.balance }) : 0;
    if (posting && (!near(allWorkBasis, Number(posting.basis_hours)) || !near(allWorkEarn, Number(posting.earned_hours)))) return pending('awaiting_account_review', 'booked_accrual_differs_from_current_summary');
    let schoolBasis = 0;
    if (employee.schoolAssigned) {
      const evidence = await computeSchoolClientLeaveBasis({ agencyId: aid, userId: employee.userId, payrollPeriodId: pid, periodStart: period.start, periodEnd: period.end, db });
      employee.schoolOnly.coverage = cleanCoverage(evidence.coverage, latestImport.id);
      employee.schoolOnly.reviewReasons = summarizeReasons(evidence.reviewReasons);
      if (!evidence.complete || !Number.isFinite(Number(evidence.basisHours)) || Number(evidence.basisHours) < 0) return pending('awaiting_school_evidence', 'school_client_evidence_incomplete');
      if (Number(evidence.coverage?.importId) !== Number(latestImport.id)) return pending('awaiting_billing_import', 'billing_import_changed_during_review');
      schoolBasis = Number(evidence.basisHours);
    }
    const schoolEarn = employee.schoolAssigned ? supplementalEarn({ basisHours: schoolBasis, bucket: 'school_support', balance: opening.balance }) : 0;
    employee.allWork = { basisHours: hours(allWorkBasis), estimatedEarnedHours: allWorkEarn };
    employee.schoolOnly.basisHours = hours(schoolBasis); employee.schoolOnly.estimatedEarnedHours = schoolEarn;
    employee.difference = { basisHours: hours(schoolBasis - allWorkBasis), earnedHours: hours(schoolEarn - allWorkEarn) };
    employee.complete = true; employee.status = employee.schoolAssigned ? 'complete' : 'not_school_assigned';
  }
  // Keep dated compensation lookups bounded when a report is available.
  await Promise.all(Array.from({ length: Math.min(4, employees.length) }, async () => { while (next < employees.length) await reviewEmployee(employees[next++]); }));
  const compared = employees.filter(row => row.complete), balancesComplete = employees.every(row => row.currentSchoolSupportHours != null);
  const complete = !!latestImport && importCoverage.unassignedPayableRows === 0 && compared.length === employees.length;
  const sum = (rows, select) => hours(rows.reduce((total, row) => total + Number(select(row) || 0), 0));
  const totals = { activeEmployees: employees.length, comparedEmployees: compared.length, pendingEmployees: employees.length - compared.length,
    balancesComplete, currentSchoolSupportHours: balancesComplete ? sum(employees, row => row.currentSchoolSupportHours) : null,
    knownCurrentSchoolSupportHours: sum(employees, row => row.currentSchoolSupportHours),
    allWorkBasisHours: complete ? sum(employees, row => row.allWork.basisHours) : null, schoolOnlyBasisHours: complete ? sum(employees, row => row.schoolOnly.basisHours) : null,
    allWorkEarnedHours: complete ? sum(employees, row => row.allWork.estimatedEarnedHours) : null, schoolOnlyEarnedHours: complete ? sum(employees, row => row.schoolOnly.estimatedEarnedHours) : null,
    earnedDifferenceHours: complete ? sum(employees, row => row.difference.earnedHours) : null };
  return { asOf: new Date().toISOString(), period, importCoverage,
    status: !latestImport ? 'awaiting_billing_import' : importCoverage.unassignedPayableRows > 0 ? 'awaiting_provider_matching' : complete ? 'complete' : 'awaiting_review', complete,
    policy: { schoolSupportEnabled: !!policy.schoolSupportEnabled, configuredSchoolClientOnlyEffectiveOn: date(policy.schoolSupportSchoolClientOnlyEffectiveOn), proposedSchoolClientOnlyEffectiveOn: date(policy.schoolSupportSchoolClientOnlyProposedOn), reviewPeriodId: number(policy.schoolSupportSchoolClientOnlyReviewPeriodId), reviewStatus: policy.schoolSupportSchoolClientOnlyReviewStatus || null },
    protection: { readOnly: true, existingEarnedBalancesPreserved: true, bookedAccrualsPreserved: true, requiresReviewBeforeActivation: true, balanceChangesApplied: false },
    totals, employees };
}
