import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { day } from './recurringPayroll.service.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const round = n => Math.round(n * 100) / 100;
export async function ffsExcessOptions(agencyId, db = pool) {
  const [codes] = await db.execute(`SELECT r.service_code AS code, r.credit_value AS credits,
    e.expected_direct_total AS directMinutes, e.expected_indirect_total AS indirectMinutes
    FROM payroll_service_code_rules r LEFT JOIN payroll_excess_compensation_rules e
    ON e.agency_id=r.agency_id AND e.service_code=r.service_code
    WHERE r.agency_id=? AND r.category='direct' AND r.service_code REGEXP '^9[0-9]{4}$' AND r.credit_value>0
    ORDER BY r.service_code`, [agencyId]);
  const [periods] = await db.execute(`SELECT id, period_start, period_end FROM payroll_periods
    WHERE agency_id=? AND period_start<=CURRENT_DATE() ORDER BY period_start DESC LIMIT 52`, [agencyId]);
  return { codes: [...codes, {code:'UNLINKED',label:'No billed service — standalone required work',directMinutes:null,indirectMinutes:null}], periods: periods.map(p => ({ id: p.id, start: day(p.period_start), end: day(p.period_end) })) };
}

export function calculateFfsExcess(rows, codes) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) fail('Add the clinical services for this pay period.');
  const seen = new Set();
  let direct = 0, indirect = 0, included = 0, includedIndirect = 0, complete = true;
  const services = rows.map(row => {
    const rule = codes.find(c => c.code === row.code);
    if (!rule || seen.has(row.code)) fail('Select each clinical service code once.');
    seen.add(row.code);
    const quantities = [row.count, row.directMinutes, row.indirectMinutes];
    if (quantities.some(v => v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0)) fail('Enter valid service counts and actual minutes.');
    const [count, actualDirect, actualIndirect] = quantities.map(Number);
    if (!Number.isInteger(count) || count < 1 || count > 1000 || actualDirect + actualIndirect > 44640) fail('Check the service count and minutes.');
    const configured = rule.directMinutes != null && rule.indirectMinutes != null
      && Number.isFinite(Number(rule.directMinutes)) && Number.isFinite(Number(rule.indirectMinutes))
      && Number(rule.directMinutes) >= 0 && Number(rule.indirectMinutes) >= 0
      && Number(rule.directMinutes) + Number(rule.indirectMinutes) > 0;
    const allowance = configured ? count * (Number(rule.directMinutes) + Number(rule.indirectMinutes)) : null;
    complete = complete && configured;
    included += allowance || 0;
    includedIndirect += configured ? count * Number(rule.indirectMinutes) : 0;
    direct += actualDirect; indirect += actualIndirect;
    return { code: rule.code, count, directMinutes: actualDirect, indirectMinutes: actualIndirect, includedMinutes: allowance };
  });
  if (direct + indirect > 44640) fail('Actual time exceeds the supported period length.');
  return { services, actualDirectMinutes: round(direct), actualIndirectMinutes: round(indirect),
    includedMinutes: complete ? round(included) : null, includedIndirectMinutes: complete ? round(includedIndirect) : null,
    excessMinutes: complete ? round(Math.min(Math.max(0, indirect - includedIndirect), Math.max(0, direct + indirect - included))) : null,
    allowanceNeedsReview: !complete };
}

export async function validateFfsExcess({ agencyId, userId, claimDate, payload, claimId = null }, db = pool) {
  const x = payload.ffsExcess;
  if (!x) return;
  if (payload.categoryGroup !== 'indirect_service' || payload.excessIndirect || payload.eventWorkType || payload.source) fail('Use the clinical FFS excess-time form for this claim.');
  const { codes, periods } = await ffsExcessOptions(agencyId, db);
  const period = periods.find(p => Number(p.id) === Number(x.periodId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate) || !Number.isFinite(new Date(claimDate+'T12:00:00Z').getTime()) || new Date(claimDate+'T12:00:00Z').toISOString().slice(0,10)!==claimDate) fail('Choose a valid work date.');
  if (!period || claimDate < period.start || claimDate > period.end || claimDate > day(new Date())) fail('Choose a valid work date within the selected pay period.');
  const calc = calculateFfsExcess(x.services, codes);
  const requested = Number(payload.totalMinutes);
  if (!Number.isFinite(requested) || requested <= 0 || requested > calc.actualIndirectMinutes
    || (calc.excessMinutes != null && Math.abs(requested - calc.excessMinutes) > 0.01)) fail('Submit only the calculated extra indirect minutes.');
  if (x.wholePeriod !== true || payload.attestation !== true || payload.excludesAutomaticIndirect !== true) fail('Confirm that the period totals are complete and exclude previously paid or submitted work.');
  for (const [key, label] of [['workDescription','Describe the work'], ['reason','Explain why the work took longer']]) {
    if (typeof x[key] !== 'string' || x[key].trim().length < 5 || x[key].length > 2000) fail(label + ' (5–2,000 characters).');
  }
  if (!['progress_notes','treatment_planning','chart_review','care_coordination','mixed','other'].includes(x.activity)) fail('Select the work you performed.');
  if (!['yes','partly','no','unavailable','not_applicable'].includes(x.workspaceUse)) fail('Indicate whether you used Documentation Hub.');
  if (x.workspaceUse !== 'yes' && (typeof x.workspaceReason !== 'string' || x.workspaceReason.trim().length < 5 || x.workspaceReason.length > 2000)) fail('Explain the workflow you used or why Documentation Hub was not appropriate or available.');
  if (calc.allowanceNeedsReview && (typeof x.allowanceExplanation !== 'string' || x.allowanceExplanation.trim().length < 5 || x.allowanceExplanation.length > 2000)) fail('Explain how you estimated the extra minutes so payroll can verify the allowance.');
  await assertNoOtherFfsClaim({ agencyId, userId, periodId: period.id, claimId }, db);
  payload.ffsExcess = { version: 1, periodId: period.id, periodStart: period.start, periodEnd: period.end,
    ...calc, requestedMinutes: round(requested), activity: x.activity, workDescription: x.workDescription.trim(),
    reason: x.reason.trim(), workspaceUse: x.workspaceUse, workspaceReason: x.workspaceUse === 'yes' ? '' : x.workspaceReason.trim(),
    allowanceExplanation: calc.allowanceNeedsReview ? x.allowanceExplanation.trim() : '', wholePeriod: true };
  payload.description = x.workDescription.trim();
  payload.noteAidUsedDuringSession = ['yes','partly'].includes(x.workspaceUse);
  delete payload.amount; delete payload.amountExplicit; delete payload.payRateAmountOverride;
}

async function assertNoOtherFfsClaim({ agencyId, userId, periodId, claimId }, db) {
  const [existing] = await db.execute(`SELECT id FROM payroll_time_claims WHERE agency_id=? AND user_id=?
    AND claim_type='indirect_time' AND status NOT IN ('rejected','cancelled')
    AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.ffsExcess.periodId'))=? AND id<>? LIMIT 1`,
    [agencyId, userId, String(periodId), Number(claimId) || 0]);
  if (existing.length) fail('An excess-time request already exists for this period. Edit that request in My time records, or contact payroll if it has been approved.', 409);
}

// Serialize same-user submissions so retries cannot create a second period claim.
export async function persistFfsExcessClaim(args) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [args.userId]);
    await assertNoOtherFfsClaim({ ...args, periodId: args.payload.ffsExcess.periodId }, db);
    const claim = await PayrollTimeClaim.create({ ...args, db });
    await db.commit(); return claim;
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
