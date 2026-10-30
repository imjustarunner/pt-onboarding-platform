import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import { effectiveCompensationAgreement } from './employmentAgreementPolicy.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';
import { MISSED_FEE_POLICY_VERSION, missedFeeProjection, assertMissedFeeEligibility, validatePackageFeeReview } from '../utils/missedSessionFeePolicy.js';
import { billingError, positiveId, auditBilling } from './familyBillingPolicy.service.js';
import { dateOnly, today, cents, transaction } from './familyLedger/policy.js';
import { createReceivable, findReceivable, sourcePayload } from './familyLedger/receivables.js';

export const MISSED_FEE_CLAIM_TYPE = 'missed_session_fee';
const parse = raw => typeof raw === 'string' ? JSON.parse(raw) : raw || {};
const instant = value => value instanceof Date ? value : new Date(String(value).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? '' : 'Z'));
const protectedClaim = claim => ['approved', 'paid'].includes(claim.status) || ['posted', 'finalized'].includes(claim.period_status)
  || claim.period_posted_at || claim.period_finalized_at || claim.period_posted_by || claim.period_finalized_by;
const domainFor = row => ['learning', 'tutoring'].includes(row.business_type) ? 'tutoring'
  : ['coaching', 'consulting', 'mentorship'].includes(row.business_type) ? row.business_type : 'mental_health';
const eventDate = row => new Intl.DateTimeFormat('en-CA', { timeZone: row.source_timezone || 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(row.start_at instanceof Date ? row.start_at : new Date(String(row.start_at).replace(' ', 'T') + 'Z'));

export async function missedFeePolicy(agencyId, db = pool) {
  const [[row]] = await db.execute('SELECT enabled,effective_on AS effectiveOn,policy_version AS policyVersion FROM payroll_missed_fee_policies WHERE agency_id=?', [agencyId]);
  return row ? { ...row, enabled: Number(row.enabled) === 1, effectiveOn: dateOnly(row.effectiveOn) } : { enabled: false, effectiveOn: null, policyVersion: MISSED_FEE_POLICY_VERSION };
}
export async function saveMissedFeePolicy({ agencyId, enabled, effectiveOn, actorUserId }) {
  const effective = dateOnly(effectiveOn);
  return transaction(async db => {
    const [[old]] = await db.execute('SELECT * FROM payroll_missed_fee_policies WHERE agency_id=? FOR UPDATE', [agencyId]);
    // Activation is prospective and the first effective date cannot subsequently be backdated.
    if ((!old || dateOnly(old.effective_on) !== effective) && effective <= today()) throw billingError(400, 'Choose a future effective date after staff notice. Existing fees and payroll will not be backfilled.');
    if (old && dateOnly(old.effective_on) !== effective) throw billingError(409, 'The saved effective date is fixed. Disable new accruals or create a later policy revision through compensation review.');
    await db.execute(`INSERT INTO payroll_missed_fee_policies (agency_id,enabled,effective_on,policy_version,updated_by_user_id)
      VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),updated_by_user_id=VALUES(updated_by_user_id)`, [agencyId, enabled === true ? 1 : 0, effective, MISSED_FEE_POLICY_VERSION, actorUserId]);
    await auditBilling({ agencyId, userId: actorUserId, action: 'missed_fee_policy_updated', objectId: agencyId }, db);
    return missedFeePolicy(agencyId, db);
  });
}

async function appointmentForFee(agencyId, appointmentId, clientId, db) {
  const [[appointment]] = await db.execute(`SELECT a.*,COALESCE(a.package_entitlement_id,b.package_entitlement_id) AS fee_package_entitlement_id FROM appointments a
    LEFT JOIN appointment_billing b ON b.appointment_id=a.id
    WHERE a.id=? AND a.agency_id=? AND EXISTS(SELECT 1 FROM appointment_participants p
      JOIN clients c ON c.id=p.client_id AND c.agency_id=a.agency_id WHERE p.appointment_id=a.id AND p.client_id=?) FOR UPDATE`, [appointmentId, agencyId, clientId]);
  if (!appointment?.provider_user_id) throw billingError(404, 'An assigned appointment for this client and organization is required.');
  return appointment;
}
async function reviewPackageFee({ row, agencyId, clientId, amountCents, review, actorUserId }, db) {
  const entitlementId = row.fee_package_entitlement_id;
  if (!entitlementId) return null;
  const [[entitlement]] = await db.execute('SELECT id,payment_status FROM booking_package_entitlements WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE', [entitlementId, agencyId, clientId]);
  if (!entitlement || entitlement.payment_status !== 'PAID') throw billingError(409, 'Verify the client’s paid package entitlement before reviewing a separate missed-session fee.');
  const [history] = await db.execute('SELECT id,direction,reason_code FROM booking_package_ledger WHERE entitlement_id=? AND agency_id=? AND client_id=? AND appointment_id=? ORDER BY id', [entitlementId, agencyId, clientId, row.id]);
  try { return { ...validatePackageFeeReview({ review, entitlementId, amountCents, eventDate: eventDate(row), history }), reviewedByUserId: actorUserId, reviewedAt: new Date().toISOString() }; }
  catch (error) { throw billingError(409, error.message); }
}
async function categoryAtEvent({ agencyId, providerId, date, at }, db) {
  const [membership] = await db.execute('SELECT user_id FROM user_agencies WHERE agency_id=? AND user_id=?', [agencyId, providerId]);
  if (!membership.length) throw billingError(409, 'The assigned provider does not belong to this organization.');
  const agreement = await effectiveCompensationAgreement({ agencyId, userId: providerId, asOfDate: date }, db);
  if ([1, 2, 3].includes(Number(agreement?.data?.schedule?.category))) return { category: Number(agreement.data.schedule.category), agreementId: agreement.id, effectiveOn: agreement.effectiveOn };
  const [[assignment]] = await db.execute('SELECT category,assigned_at,updated_at FROM payroll_user_compensation_levels WHERE agency_id=? AND user_id=? FOR UPDATE', [agencyId, providerId]);
  if (!assignment || ![1, 2, 3].includes(Number(assignment.category)) || !(instant(assignment.updated_at).getTime() <= instant(at).getTime())) throw billingError(409, 'Historical category needs compensation review. A current category cannot be assumed for this appointment.');
  return { category: Number(assignment.category), source: 'unchanged_assignment', assignedAt: assignment.assigned_at, updatedAt: assignment.updated_at };
}

export async function createMissedSessionFee({ agencyId, appointmentId, clientId, amountCents, agreementConfirmed, agreementReference, packageFeeReview, actorUserId }) {
  const aid = positiveId(agencyId), appointment = positiveId(appointmentId), client = positiveId(clientId), amount = cents(amountCents);
  return transaction(async db => {
    const row = await appointmentForFee(aid, appointment, client, db), date = eventDate(row), policy = await missedFeePolicy(aid, db);
    const packageReview = await reviewPackageFee({ row, agencyId: aid, clientId: client, amountCents: amount, review: packageFeeReview, actorUserId }, db);
    try { assertMissedFeeEligibility({ status: row.status, medicaid: hasMedicaidCoverage(await readClientInsurance(client, aid, db)),
      packageEntitlementId: row.fee_package_entitlement_id, packageFeeReviewed: !!packageReview, agreementConfirmed, evidence: agreementReference, eventDate: date, effectiveOn: policy.effectiveOn, enabled: policy.enabled }); }
    catch (error) { throw billingError(409, error.message); }
    const categoryEvidence = await categoryAtEvent({ agencyId: aid, providerId: row.provider_user_id, date, at: row.start_at }, db);
    const feeKind = row.status === 'no_show' ? 'no_show' : 'late_cancel';
    const receivable = await createReceivable({ agencyId: aid, clientId: client, sourceType: 'missed_session_fee', sourceKey: `${appointment}:${client}`,
      serviceDomain: domainFor(row), serviceLabel: feeKind === 'no_show' ? 'Missed appointment fee' : 'Late cancellation fee', serviceDate: date,
      amountCents: amount, actorUserId, reviewRequired: true, payload: { appointmentId: appointment, providerUserId: row.provider_user_id, feeKind, responsibilityType: 'missed_session_fee',
        agreementReference: String(agreementReference).trim().slice(0, 2000), agreementConfirmed: true, effectiveOn: policy.effectiveOn, policyVersion: policy.policyVersion,
        compensationBasis: 'actually_collected_fee', creditsAreNotCollections: true, packageFeeReview: packageReview } }, db);
    const [[existing]] = await db.execute('SELECT * FROM payroll_missed_session_fees WHERE agency_id=? AND receivable_id=? FOR UPDATE', [aid, receivable.id]);
    if (!existing) await db.execute(`INSERT INTO payroll_missed_session_fees
      (agency_id,receivable_id,appointment_id,client_id,provider_user_id,event_date,fee_kind,category_snapshot,share_basis_points,policy_version,category_evidence_json,created_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [aid, receivable.id, appointment, client, row.provider_user_id, date, feeKind, categoryEvidence.category,
      missedFeeProjection({ category: categoryEvidence.category, collectedCents: 0 }).basisPoints, policy.policyVersion, JSON.stringify(categoryEvidence), actorUserId]);
    return { receivableId: receivable.id, status: receivable.status, category: existing?.category_snapshot || categoryEvidence.category, payrollStatus: 'awaiting_collection' };
  });
}

export async function assertMissedFeeCollectible(receivable, db = pool) {
  const payload = sourcePayload(receivable), row = await appointmentForFee(receivable.agency_id, positiveId(payload.appointmentId), receivable.client_id, db);
  if (Number(payload.packageFeeReview?.entitlementId || 0) !== Number(row.fee_package_entitlement_id || 0)) throw billingError(409, 'The package entitlement changed. Reconcile the fee and agreement before collection.');
  const packageReview = await reviewPackageFee({ row, agencyId: receivable.agency_id, clientId: receivable.client_id, amountCents: Number(receivable.amount_cents), review: payload.packageFeeReview, actorUserId: payload.packageFeeReview?.reviewedByUserId }, db);
  try { assertMissedFeeEligibility({ status: row.status, medicaid: hasMedicaidCoverage(await readClientInsurance(receivable.client_id, receivable.agency_id, db)),
    packageEntitlementId: row.fee_package_entitlement_id, packageFeeReviewed: !!packageReview, agreementConfirmed: payload.agreementConfirmed, evidence: payload.agreementReference,
    eventDate: eventDate(row), effectiveOn: payload.effectiveOn, enabled: true }); }
  catch (error) { throw billingError(409, error.message); }
  if (Number(row.provider_user_id) !== Number(payload.providerUserId)) throw billingError(409, 'The assigned provider changed. Reconcile the fee before collecting it.');
}

// Caller holds the receivable lock. This projection runs in the payment/refund transaction.
export async function reconcileMissedFeePayroll(receivable, db = pool) {
  if (receivable.source_type !== 'missed_session_fee') return null;
  const [[fee]] = await db.execute('SELECT * FROM payroll_missed_session_fees WHERE agency_id=? AND receivable_id=? FOR UPDATE', [receivable.agency_id, receivable.id]);
  if (!fee) throw billingError(409, 'The fee compensation source needs reconciliation.');
  const [[money]] = await db.execute(`SELECT COALESCE(SUM(p.amount_cents),0) AS collected,
    COALESCE(SUM((SELECT COALESCE(SUM(r.amount_cents),0) FROM family_payment_refunds r WHERE r.payment_id=p.id AND r.agency_id=p.agency_id AND r.status='succeeded')),0) AS refunded,
    MAX(p.received_at) AS received_at FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id AND a.agency_id=p.agency_id
    WHERE a.receivable_id=? AND p.agency_id=? AND p.status='succeeded' AND p.processor IN ('STRIPE','CASH')`, [receivable.id, fee.agency_id]);
  const [claims] = await db.execute(`SELECT c.*,p.status AS period_status,p.posted_at AS period_posted_at,p.finalized_at AS period_finalized_at,
    p.posted_by_user_id AS period_posted_by,p.finalized_by_user_id AS period_finalized_by
    FROM payroll_missed_fee_claims f JOIN payroll_time_claims c ON c.id=f.claim_id
    LEFT JOIN payroll_periods p ON p.id=c.target_payroll_period_id AND p.agency_id=c.agency_id
    WHERE f.fee_id=? AND c.agency_id=? AND c.user_id=? ORDER BY c.id FOR UPDATE`, [fee.id, fee.agency_id, fee.provider_user_id]);
  const approvedCents = claims.filter(protectedClaim).reduce((sum, c) => sum + Math.round(Number(c.applied_amount || 0) * 100), 0);
  const projection = missedFeeProjection({ category: fee.category_snapshot, collectedCents: Number(money.collected), refundedCents: Number(money.refunded), approvedCents });
  const pending = claims.filter(c => !protectedClaim(c));
  if (pending.length > 1) throw billingError(409, 'Multiple fee drafts need payroll reconciliation.');
  const draft = pending[0], payload = { source: 'collected_missed_session_fee', feeId: fee.id, receivableId: fee.receivable_id,
    appointmentId: fee.appointment_id, eventDate: dateOnly(fee.event_date), category: Number(fee.category_snapshot), percent: Number(fee.share_basis_points) / 100,
    netCollectedCents: projection.netCollectedCents, previouslyApprovedCents: approvedCents, amount: projection.pendingCents / 100,
    totalMinutes: 0, bucket: 'direct', amountExplicit: true, policyVersion: fee.policy_version, regularRateReviewRequired: true,
    notes: 'Collected missed-session fee share. Separate from work and required waiting time; no service hours or insurance claim.' };
  if (draft) await db.execute(`UPDATE payroll_time_claims SET status=?,payload_json=?,claim_date=?,credits_hours=0 WHERE id=? AND agency_id=? AND status NOT IN ('approved','paid')`,
    [projection.pendingCents > 0 ? 'submitted' : 'withdrawn', JSON.stringify(payload), money.received_at ? dateOnly(money.received_at) : today(), draft.id, fee.agency_id]);
  else if (projection.pendingCents > 0) {
    const claim = await PayrollTimeClaim.create({ agencyId: fee.agency_id, userId: fee.provider_user_id, submittedByUserId: fee.created_by_user_id,
      claimType: MISSED_FEE_CLAIM_TYPE, claimDate: dateOnly(money.received_at), payload, db });
    await db.execute('INSERT INTO payroll_missed_fee_claims (fee_id,claim_id) VALUES (?,?)', [fee.id, claim.id]);
  }
  await db.execute('UPDATE payroll_missed_session_fees SET net_collected_cents=?,entitlement_cents=?,review_reason=? WHERE id=?',
    [projection.netCollectedCents, projection.entitlementCents, projection.reviewRequired ? 'Refund after payroll approval: review required; no automatic wage deduction.' : null, fee.id]);
  return projection;
}

export async function approveMissedFeeClaim({ agencyId, claimId, targetPayrollPeriodId, actorUserId, expectedAmount }) {
  return transaction(async db => {
    const [[lookup]] = await db.execute(`SELECT f.receivable_id FROM payroll_missed_fee_claims l JOIN payroll_missed_session_fees f ON f.id=l.fee_id
      JOIN payroll_time_claims c ON c.id=l.claim_id AND c.agency_id=f.agency_id AND c.user_id=f.provider_user_id
      WHERE l.claim_id=? AND f.agency_id=?`, [claimId, agencyId]);
    if (!lookup) throw billingError(404, 'Fee claim not found in this organization.');
    const receivable = await findReceivable(agencyId, lookup.receivable_id, db, true);
    await reconcileMissedFeePayroll(receivable, db);
    const [[claim]] = await db.execute('SELECT * FROM payroll_time_claims WHERE id=? AND agency_id=? FOR UPDATE', [claimId, agencyId]);
    if (['approved', 'paid'].includes(claim.status)) {
      if (Number(claim.target_payroll_period_id) !== Number(targetPayrollPeriodId)) throw billingError(409, 'This fee share is already approved in another period.');
      return PayrollTimeClaim.findById(claimId, db);
    }
    const payload = parse(claim.payload_json), amount = Number(payload.amount);
    if (claim.target_payroll_period_id) {
      const [[assigned]] = await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE', [claim.target_payroll_period_id, agencyId]);
      if (assigned && (['posted', 'finalized'].includes(assigned.status) || assigned.posted_at || assigned.finalized_at || assigned.posted_by_user_id || assigned.finalized_by_user_id)) throw billingError(409, 'This fee claim belongs to a locked payroll period. Reconcile it without changing earned wages.');
    }
    if (claim.status !== 'submitted' || !(amount > 0)) throw billingError(409, 'No unpaid collected fee share remains to approve.');
    if (expectedAmount != null && Math.round(Number(expectedAmount) * 100) !== Math.round(amount * 100)) throw billingError(409, 'Collections changed. Refresh and review the current fee share.');
    const [[period]] = await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE', [positiveId(targetPayrollPeriodId), agencyId]);
    if (!period || !['draft', 'open', 'raw_imported', 'staged', 'ran'].includes(period.status) || period.posted_at || period.finalized_at || period.posted_by_user_id || period.finalized_by_user_id) throw billingError(409, 'Select an editable payroll period in this organization.');
    await db.execute(`UPDATE payroll_time_claims SET status='approved',target_payroll_period_id=?,bucket='direct',credits_hours=0,applied_amount=?,approved_by_user_id=?,approved_at=NOW()
      WHERE id=? AND agency_id=? AND status='submitted'`, [targetPayrollPeriodId, amount, actorUserId, claimId, agencyId]);
    await auditBilling({ agencyId, clientId: receivable.client_id, userId: actorUserId, action: 'missed_fee_share_approved', objectId: claimId }, db);
    return PayrollTimeClaim.findById(claimId, db);
  });
}

export async function listMissedFeePayroll(agencyId, db = pool) {
  const [fees] = await db.execute(`SELECT f.id,f.receivable_id AS receivableId,f.appointment_id AS appointmentId,f.event_date AS eventDate,
    f.provider_user_id AS providerUserId,f.category_snapshot AS category,f.share_basis_points/100 AS percent,
    f.net_collected_cents AS netCollectedCents,f.entitlement_cents AS entitlementCents,f.review_reason AS reviewReason,
    (SELECT COALESCE(SUM(c.applied_amount),0)*100 FROM payroll_missed_fee_claims l JOIN payroll_time_claims c ON c.id=l.claim_id WHERE l.fee_id=f.id AND c.status IN ('approved','paid')) AS approvedCents
    FROM payroll_missed_session_fees f WHERE f.agency_id=? ORDER BY f.id DESC LIMIT 100`, [agencyId]);
  return { policy: await missedFeePolicy(agencyId, db), fees };
}
