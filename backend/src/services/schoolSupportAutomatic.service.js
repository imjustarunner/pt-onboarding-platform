import pool from '../config/database.js';
import { validateLeaveItems } from '../utils/supplementalLeave.js';
import { createSchoolSupportRequest } from './schoolSupportRequest.service.js';
import { approveLeaveAtomically } from './payrollLeaveApproval.service.js';
import { hasSchoolAssignment } from './supplementalLeave.service.js';

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const canonicalItems = items => JSON.stringify(validateLeaveItems(items).sort((a, b) => a.date.localeCompare(b.date) || a.hours - b.hours));

/** Temporary self-service: reservation, pay, deduction and audit record commit together. */
export async function submitSchoolSupportAutomatically({ agencyId, userId, actorId, items, submissionKey, policy, defaultPayRate }) {
  if (!policy.schoolSupportEnabled || policy.ptoEnabled === false) fail('School Support Hours are not enabled.', 403);
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(String(submissionKey || ''))) fail('Refresh the School Support Hours form and submit again.', 400);
  const normalized = validateLeaveItems(items);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[account]] = await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=? AND user_id=? FOR UPDATE', [agencyId, userId]);
    if (!account) fail('Your earned-hours account is unavailable. Please try again.');
    const [[existing]] = await db.execute('SELECT id,status,approved_rates_json FROM payroll_pto_requests WHERE agency_id=? AND user_id=? AND submission_key=? FOR UPDATE', [agencyId, userId, submissionKey]);
    if (existing) {
      const [savedItems] = await db.execute('SELECT request_date,hours FROM payroll_pto_request_items WHERE request_id=? ORDER BY request_date,id', [existing.id]);
      if (canonicalItems(savedItems) !== canonicalItems(normalized)) fail('This submission was already used for different dates or hours. Start a new form.');
      if (existing.status !== 'approved') fail('This submission is already recorded. Refresh your payroll history.');
      const rates = typeof existing.approved_rates_json === 'string' ? JSON.parse(existing.approved_rates_json) : existing.approved_rates_json;
      await db.commit();
      return { requestId: existing.id, alreadySubmitted: true, rates, affectedPayrollPeriodIds: [...new Set(rates.map(r => r.payrollPeriodId))] };
    }
    // Former school staff retain access to an earned balance; other staff cannot use this bank.
    if (!(Number(account.school_support_balance_hours) > 0) && !await hasSchoolAssignment({ agencyId, userId, db })) fail('School Support Hours are available to school-assigned employees or employees with an earned balance.', 403);
    const { requestId } = await createSchoolSupportRequest({ agencyId, userId, actorId, items: normalized, notes: 'School Support Hours — Temporary self-service', db });
    await db.execute('UPDATE payroll_pto_requests SET submission_key=? WHERE id=? AND agency_id=?', [submissionKey, requestId, agencyId]);
    const result = await approveLeaveAtomically({ agencyId, requestId, actorId, policy, defaultPayRate, db, automatic: true });
    await db.commit();
    return { ...result, requestId, alreadySubmitted: false };
  } catch (error) {
    await db.rollback();
    if (!error.status && !error.code) error.status = 409;
    throw error;
  } finally {
    db.release();
  }
}
