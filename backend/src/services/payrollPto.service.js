import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import PayrollPtoAccount from '../models/PayrollPtoAccount.model.js';
import PayrollPtoLedger from '../models/PayrollPtoLedger.model.js';
import PayrollPtoRequest from '../models/PayrollPtoRequest.model.js';
import PayrollAdjustment from '../models/PayrollAdjustment.model.js';
import { computeSubmissionWindow, resolveClaimTimeZone } from '../utils/payrollSubmissionWindow.js';

const DEFAULT_PTO_POLICY = {
  sickAccrualPer30: 1.0,
  trainingAccrualPer30: 0.25,
  trainingPtoEnabled: false,
  sickAnnualRolloverCap: 10,
  sickAnnualMaxAccrual: 65,
  trainingMaxBalance: 20,
  trainingForfeitOnTermination: true,
  ptoConsecutiveUseLimitHours: 15,
  ptoConsecutiveUseNoticeDays: 30,
  ptoEnabled: true
};

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

export async function getAgencyPtoPolicy({ agencyId }) {
  const agency = await Agency.findById(agencyId);
  const policy = { ...DEFAULT_PTO_POLICY, ...(parseJson(agency?.pto_policy_json) || {}) };
  const ptoEnabled =
    agency?.pto_enabled === 0 || agency?.pto_enabled === '0' || String(agency?.pto_enabled || '').toLowerCase() === 'false'
      ? false
      : policy.ptoEnabled !== false;
  const defaultPayRate = Number(agency?.pto_default_pay_rate || 0);
  return { policy: { ...policy, ptoEnabled, trainingPtoEnabled: policy.trainingPtoEnabled === true }, defaultPayRate };
}

export async function upsertAgencyPtoPolicy({ agencyId, policy, defaultPayRate, ptoEnabled }) {
  const nextPolicy = { ...DEFAULT_PTO_POLICY, ...(policy || {}) };
  nextPolicy.trainingPtoEnabled = nextPolicy.trainingPtoEnabled === true;
  await pool.execute(
    `UPDATE agencies
     SET pto_policy_json = ?,
         pto_default_pay_rate = ?,
         pto_enabled = ?
     WHERE id = ?
     LIMIT 1`,
    [
      JSON.stringify(nextPolicy),
      Number(defaultPayRate || 0),
      ptoEnabled === false ? 0 : 1,
      agencyId
    ]
  );
  return getAgencyPtoPolicy({ agencyId });
}

export async function ensurePtoAccount({
  agencyId,
  userId,
  updatedByUserId,
  defaults = {}
}) {
  const existing = await PayrollPtoAccount.findForAgencyUser({ agencyId, userId });
  if (existing) return existing;

  const employmentType = defaults.employmentType || 'hourly';
  const trainingPtoEligible = defaults.trainingPtoEligible ? 1 : 0;
  const emptyYmd = null;
  return PayrollPtoAccount.upsert({
    agencyId,
    userId,
    employmentType,
    trainingPtoEligible,
    sickStartHours: 0,
    sickStartEffectiveDate: emptyYmd,
    trainingStartHours: 0,
    trainingStartEffectiveDate: emptyYmd,
    sickBalanceHours: 0,
    trainingBalanceHours: 0,
    lastAccruedPayrollPeriodId: null,
    lastSickRolloverYear: null,
    trainingForfeitedAt: null,
    updatedByUserId
  });
}

function ymd(d) {
  if (!d) return '';
  // MySQL drivers sometimes return DATE/DATETIME columns as JS Date objects.
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function todayYmd() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function clamp(n, lo, hi) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export function computePtoPolicyWarnings({ policy, requestItems }) {
  const lim = Number(policy?.ptoConsecutiveUseLimitHours ?? DEFAULT_PTO_POLICY.ptoConsecutiveUseLimitHours);
  const noticeDays = Number(policy?.ptoConsecutiveUseNoticeDays ?? DEFAULT_PTO_POLICY.ptoConsecutiveUseNoticeDays);
  const items = Array.isArray(requestItems) ? requestItems : [];
  const total = items.reduce((a, it) => a + Number(it?.hours || 0), 0);
  const dates = items.map((it) => ymd(it?.requestDate)).filter(Boolean).sort();
  const start = dates[0] || null;
  const warnings = [];
  if (total > lim + 1e-9) {
    warnings.push({ code: 'pto_over_limit', message: `This request totals ${total.toFixed(2)} hours. Policy requires 30 days notice + management approval for PTO over ${lim} hours consecutively.` });
    if (start) {
      const now = new Date(todayYmd());
      const dt = new Date(start);
      const diffDays = Math.floor((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (Number.isFinite(diffDays) && diffDays < noticeDays) {
        warnings.push({ code: 'pto_notice_window', message: `Requested dates begin in ${diffDays} days. Policy guidance is ${noticeDays} days notice for PTO over ${lim} hours consecutively.` });
      }
    }
  }
  return warnings;
}

async function getUserTerminationInfo({ userId }) {
  const [rows] = await pool.execute(
    `SELECT terminated_at, status
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  const r = rows?.[0] || null;
  const status = String(r?.status || '').toUpperCase();
  const terminatedAt = r?.terminated_at ? ymd(r.terminated_at) : null;
  const isTerminated = Boolean(terminatedAt) || status.startsWith('TERMINATED');
  return { isTerminated, terminatedAt };
}

export async function getPtoBalances({ agencyId, userId }) {
  const { policy, defaultPayRate } = await getAgencyPtoPolicy({ agencyId });
  const acct = await PayrollPtoAccount.findForAgencyUser({ agencyId, userId });
  if (!acct) {
    return {
      policy,
      defaultPayRate,
      account: null,
      balances: { sickHours: 0, trainingHours: 0 }
    };
  }

  // Enforce training forfeit on termination (one-time).
  const term = await getUserTerminationInfo({ userId });
  if (term.isTerminated && policy.trainingForfeitOnTermination && !acct.training_forfeited_at) {
    const current = Number(acct.training_balance_hours || 0);
    if (current > 1e-9) {
      const eff = term.terminatedAt || todayYmd();
      await PayrollPtoLedger.create({
        agencyId,
        userId,
        entryType: 'forfeit',
        ptoBucket: 'training',
        hoursDelta: -current,
        effectiveDate: eff,
        payrollPeriodId: null,
        requestId: null,
        note: 'Training PTO forfeited on termination',
        createdByUserId: userId
      });
    }
    await PayrollPtoAccount.upsert({
      agencyId,
      userId,
      employmentType: acct.employment_type,
      trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
      sickStartHours: acct.sick_start_hours,
      sickStartEffectiveDate: acct.sick_start_effective_date,
      trainingStartHours: acct.training_start_hours,
      trainingStartEffectiveDate: acct.training_start_effective_date,
      sickBalanceHours: acct.sick_balance_hours,
      trainingBalanceHours: 0,
      lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
      lastSickRolloverYear: acct.last_sick_rollover_year,
      trainingForfeitedAt: new Date(),
      updatedByUserId: userId
    });
    const refreshed = await PayrollPtoAccount.findForAgencyUser({ agencyId, userId });
    return {
      policy,
      defaultPayRate,
      account: refreshed,
      balances: {
        sickHours: Number(refreshed?.sick_balance_hours || 0),
        trainingHours: Number(refreshed?.training_balance_hours || 0)
      }
    };
  }

  return {
    policy,
    defaultPayRate,
    account: acct,
    balances: {
      sickHours: Number(acct.sick_balance_hours || 0),
      trainingHours: policy?.trainingPtoEnabled ? Number(acct.training_balance_hours || 0) : 0
    }
  };
}

export async function applyStartingBalances({
  agencyId,
  userId,
  updatedByUserId,
  sickStartHours,
  sickStartEffectiveDate,
  trainingStartHours,
  trainingStartEffectiveDate
}) {
  const acct = await ensurePtoAccount({ agencyId, userId, updatedByUserId });

  const nextSickStart = clamp(sickStartHours ?? acct.sick_start_hours, 0, 1e9);
  const nextTrainingStart = clamp(trainingStartHours ?? acct.training_start_hours, 0, 1e9);
  const sickEff = sickStartEffectiveDate ? ymd(sickStartEffectiveDate) : (acct.sick_start_effective_date ? ymd(acct.sick_start_effective_date) : null);
  const trainingEff = trainingStartEffectiveDate ? ymd(trainingStartEffectiveDate) : (acct.training_start_effective_date ? ymd(acct.training_start_effective_date) : null);

  // Apply as delta adjustments so ledger stays consistent.
  const sickDelta = nextSickStart - Number(acct.sick_start_hours || 0);
  const trainingDelta = nextTrainingStart - Number(acct.training_start_hours || 0);

  if (Math.abs(sickDelta) > 1e-9) {
    await PayrollPtoLedger.create({
      agencyId,
      userId,
      entryType: 'starting_balance',
      ptoBucket: 'sick',
      hoursDelta: sickDelta,
      effectiveDate: sickEff || todayYmd(),
      payrollPeriodId: null,
      requestId: null,
      note: 'Starting balance set/updated',
      createdByUserId: updatedByUserId
    });
  }
  if (Math.abs(trainingDelta) > 1e-9) {
    await PayrollPtoLedger.create({
      agencyId,
      userId,
      entryType: 'starting_balance',
      ptoBucket: 'training',
      hoursDelta: trainingDelta,
      effectiveDate: trainingEff || todayYmd(),
      payrollPeriodId: null,
      requestId: null,
      note: 'Starting balance set/updated',
      createdByUserId: updatedByUserId
    });
  }

  const nextSickBal = Number(acct.sick_balance_hours || 0) + sickDelta;
  const nextTrainingBal = Number(acct.training_balance_hours || 0) + trainingDelta;

  return PayrollPtoAccount.upsert({
    agencyId,
    userId,
    employmentType: acct.employment_type,
    trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
    sickStartHours: nextSickStart,
    sickStartEffectiveDate: sickEff,
    trainingStartHours: nextTrainingStart,
    trainingStartEffectiveDate: trainingEff,
    sickBalanceHours: nextSickBal,
    trainingBalanceHours: nextTrainingBal,
    lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
    lastSickRolloverYear: acct.last_sick_rollover_year,
    trainingForfeitedAt: acct.training_forfeited_at,
    updatedByUserId
  });
}

async function findPayrollPeriodIdForDate({ agencyId, dateYmd }) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM payroll_periods
     WHERE agency_id = ?
       AND period_start <= ?
       AND period_end >= ?
     ORDER BY period_end ASC
     LIMIT 1`,
    [agencyId, dateYmd, dateYmd]
  );
  return rows?.[0]?.id || null;
}

export async function approvePtoRequestAndPostToPayroll({
  agencyId,
  requestId,
  approvedByUserId,
  overrideDeadline = false,
  overrideBalance = false
}) {
  const req = await PayrollPtoRequest.findById(requestId);
  if (!req || Number(req.agency_id) !== Number(agencyId)) throw new Error('PTO request not found');
  if (String(req.status || '') !== 'submitted' && String(req.status || '') !== 'deferred') {
    throw new Error('PTO request is not pending');
  }

  const items = await PayrollPtoRequest.listItemsForRequest(requestId);
  if (!items.length) throw new Error('PTO request has no items');

  const userId = Number(req.user_id);
  const acct = await ensurePtoAccount({ agencyId, userId, updatedByUserId: approvedByUserId });

  const bucket = String(req.request_type || '').toLowerCase() === 'training' ? 'training' : 'sick';
  const { policy } = await getAgencyPtoPolicy({ agencyId });
  if (bucket === 'training') {
    if (policy?.trainingPtoEnabled !== true) throw new Error('Training PTO is disabled for this organization');
    if (!acct.training_pto_eligible) throw new Error('Training PTO is not enabled for this provider');
  }

  // Group requested hours by payroll period.
  const byPeriod = new Map();
  for (const it of items) {
    const d = ymd(it.request_date);
    const h = Number(it.hours || 0);
    if (!d || !(h > 0)) continue;
    // Enforce the same soft cutoff as other payroll-impacting submissions:
    // if the request was submitted after the Sunday cutoff for that pay period,
    // it will be posted to the next eligible pay period instead of backdating.
    let pid = null;
    if (overrideDeadline) {
      const [pRows] = await pool.execute(
        `SELECT id, status
         FROM payroll_periods
         WHERE agency_id = ?
           AND period_start <= ?
           AND period_end >= ?
         ORDER BY period_end ASC
         LIMIT 1`,
        [agencyId, d, d]
      );
      const p = pRows?.[0] || null;
      if (!p?.id) throw new Error(`No payroll period found for PTO date ${d}. Create/ensure periods, then approve again.`);
      const st = String(p.status || '').toLowerCase();
      if (st === 'posted' || st === 'finalized') {
        throw new Error(`PTO date ${d} falls in a posted/finalized pay period and cannot be approved into it.`);
      }
      pid = Number(p.id);
    } else {
      const win = await computeSubmissionWindow({
        agencyId,
        effectiveDateYmd: d,
        submittedAt: req.created_at,
        timeZone: resolveClaimTimeZone(),
        hardStopPolicy: '60_days'
      });
      if (!win.ok) throw new Error(win.errorMessage || `PTO request item date ${d} is past the submission deadline.`);
      pid = Number(win.suggestedPayrollPeriodId || 0);
      if (!pid) throw new Error(`No payroll period found for PTO date ${d}. Create/ensure periods, then approve again.`);
    }
    byPeriod.set(pid, (byPeriod.get(pid) || 0) + h);
  }

  // Apply ledger usage + update balances.
  let sickBal = Number(acct.sick_balance_hours || 0);
  let trainingBal = Number(acct.training_balance_hours || 0);

  // Balance check (admin overrideable).
  const totalRequestedHours = (items || []).reduce((a, it) => a + Number(it?.hours || 0), 0);
  const starting = bucket === 'training' ? trainingBal : sickBal;
  const projected = starting - totalRequestedHours;
  if (!overrideBalance && projected < -1e-9) {
    throw new Error(
      `Insufficient PTO balance: starting ${starting.toFixed(2)} hours, requested ${totalRequestedHours.toFixed(2)} hours, projected ${projected.toFixed(2)} hours.`
    );
  }

  for (const it of items) {
    const d = ymd(it.request_date);
    const h = Number(it.hours || 0);
    if (!d || !(h > 0)) continue;
    let payrollPeriodId = null;
    if (overrideDeadline) {
      const [pRows] = await pool.execute(
        `SELECT id, status
         FROM payroll_periods
         WHERE agency_id = ?
           AND period_start <= ?
           AND period_end >= ?
         ORDER BY period_end ASC
         LIMIT 1`,
        [agencyId, d, d]
      );
      const p = pRows?.[0] || null;
      if (!p?.id) throw new Error(`No payroll period found for PTO date ${d}. Create/ensure periods, then approve again.`);
      const st = String(p.status || '').toLowerCase();
      if (st === 'posted' || st === 'finalized') {
        throw new Error(`PTO date ${d} falls in a posted/finalized pay period and cannot be approved into it.`);
      }
      payrollPeriodId = Number(p.id) || null;
    } else {
      const win = await computeSubmissionWindow({
        agencyId,
        effectiveDateYmd: d,
        submittedAt: req.created_at,
        timeZone: resolveClaimTimeZone(),
        hardStopPolicy: '60_days'
      });
      if (!win.ok) throw new Error(win.errorMessage || `PTO request item date ${d} is past the submission deadline.`);
      payrollPeriodId = Number(win.suggestedPayrollPeriodId || 0) || null;
    }
    await PayrollPtoLedger.create({
      agencyId,
      userId,
      entryType: 'usage',
      ptoBucket: bucket,
      hoursDelta: -h,
      effectiveDate: d,
      payrollPeriodId,
      requestId,
      note: 'PTO used (approved request)',
      createdByUserId: approvedByUserId
    });
    if (bucket === 'training') trainingBal -= h;
    else sickBal -= h;
  }

  // Post pay into payroll adjustments (per period).
  const { defaultPayRate } = await getAgencyPtoPolicy({ agencyId });
  const rate = Number(defaultPayRate || 0);
  for (const [payrollPeriodId, hours] of byPeriod.entries()) {
    const existing = await PayrollAdjustment.findForPeriodUser(payrollPeriodId, userId);
    const currentSick = Number(existing?.sick_pto_hours ?? 0);
    const currentTraining = Number(existing?.training_pto_hours ?? 0);
    const nextSick = bucket === 'sick' ? currentSick + hours : currentSick;
    const nextTraining = bucket === 'training' ? currentTraining + hours : currentTraining;

    await PayrollAdjustment.upsert({
      payrollPeriodId,
      agencyId,
      userId,
      mileageAmount: Number(existing?.mileage_amount ?? 0),
      medcancelAmount: Number(existing?.medcancel_amount ?? 0),
      otherTaxableAmount: Number(existing?.other_taxable_amount ?? 0),
      bonusAmount: Number(existing?.bonus_amount ?? 0),
      reimbursementAmount: Number(existing?.reimbursement_amount ?? 0),
      salaryAmount: Number(existing?.salary_amount ?? 0),
      ptoHours: nextSick + nextTraining, // legacy aggregate
      sickPtoHours: nextSick,
      trainingPtoHours: nextTraining,
      ptoRate: rate,
      updatedByUserId: approvedByUserId
    });
  }

  await PayrollPtoAccount.upsert({
    agencyId,
    userId,
    employmentType: acct.employment_type,
    trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
    sickStartHours: acct.sick_start_hours,
    sickStartEffectiveDate: acct.sick_start_effective_date,
    trainingStartHours: acct.training_start_hours,
    trainingStartEffectiveDate: acct.training_start_effective_date,
    sickBalanceHours: sickBal,
    trainingBalanceHours: trainingBal,
    lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
    lastSickRolloverYear: acct.last_sick_rollover_year,
    trainingForfeitedAt: acct.training_forfeited_at,
    updatedByUserId: approvedByUserId
  });

  await PayrollPtoRequest.updateStatus({
    requestId,
    agencyId,
    status: 'approved',
    approvedByUserId,
    approvedAt: new Date(),
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionReason: null
  });

  return { ok: true, affectedPayrollPeriodIds: Array.from(byPeriod.keys()) };
}

export async function runPtoAccrualForPostedPeriod({
  agencyId,
  payrollPeriodId,
  postedByUserId
}) {
  const { policy } = await getAgencyPtoPolicy({ agencyId });
  if (policy.ptoEnabled === false) return { ok: true, skipped: 'pto_disabled' };

  const [periodRows] = await pool.execute(
    `SELECT id, period_start, period_end, status
     FROM payroll_periods
     WHERE id = ? AND agency_id = ?
     LIMIT 1`,
    [payrollPeriodId, agencyId]
  );
  const period = periodRows?.[0] || null;
  if (!period) return { ok: false, error: 'pay_period_not_found' };

  const year = Number(String(ymd(period.period_end) || '').slice(0, 4)) || null;

  const accounts = await PayrollPtoAccount.listForAgency({ agencyId });
  let accruedUsers = 0;
  for (const acct of accounts || []) {
    const userId = Number(acct.user_id);
    if (!userId) continue;
    if (Number(acct.last_accrued_payroll_period_id || 0) === Number(payrollPeriodId)) continue;

    // Roll over sick leave once per year.
    let sickBal = Number(acct.sick_balance_hours || 0);
    let trainingBal = Number(acct.training_balance_hours || 0);
    if (year && Number(acct.last_sick_rollover_year || 0) !== year) {
      const rolloverCap = Number(policy.sickAnnualRolloverCap ?? DEFAULT_PTO_POLICY.sickAnnualRolloverCap);
      const rolled = Math.min(sickBal, rolloverCap);
      const delta = rolled - sickBal;
      if (Math.abs(delta) > 1e-9) {
        await PayrollPtoLedger.create({
          agencyId,
          userId,
          entryType: 'manual_adjustment',
          ptoBucket: 'sick',
          hoursDelta: delta,
          effectiveDate: `${year}-01-01`,
          payrollPeriodId: null,
          requestId: null,
          note: `Annual rollover cap applied (${rolloverCap})`,
          createdByUserId: postedByUserId
        });
        sickBal = rolled;
      }
    }

    // Basis from payroll summary for this period.
    const [sumRows] = await pool.execute(
      `SELECT total_hours, tier_credits_final
       FROM payroll_summaries
       WHERE payroll_period_id = ? AND agency_id = ? AND user_id = ?
       LIMIT 1`,
      [payrollPeriodId, agencyId, userId]
    );
    const s = sumRows?.[0] || null;
    const totalHours = Number(s?.total_hours || 0);
    const credits = Number(s?.tier_credits_final || 0);

    const employment = String(acct.employment_type || 'hourly');
    const basis = employment === 'fee_for_service' ? credits : totalHours;

    // Sick accrual (policy default covers hourly + fee-for-service; salaried can be configured by setting employment_type accordingly).
    let sickEarn = 0;
    if (employment === 'hourly' || employment === 'fee_for_service') {
      sickEarn = (basis / 30) * Number(policy.sickAccrualPer30 ?? DEFAULT_PTO_POLICY.sickAccrualPer30);
    }
    // Training accrual (eligible users only).
    let trainingEarn = 0;
    if (policy.trainingPtoEnabled && acct.training_pto_eligible) {
      trainingEarn = (basis / 30) * Number(policy.trainingAccrualPer30 ?? DEFAULT_PTO_POLICY.trainingAccrualPer30);
    }

    // Round to 2 decimals.
    sickEarn = Math.round(sickEarn * 100) / 100;
    trainingEarn = Math.round(trainingEarn * 100) / 100;

    if (sickEarn > 0) {
      await PayrollPtoLedger.create({
        agencyId,
        userId,
        entryType: 'accrual',
        ptoBucket: 'sick',
        hoursDelta: sickEarn,
        effectiveDate: ymd(period.period_end),
        payrollPeriodId,
        requestId: null,
        note: 'Sick leave accrual',
        createdByUserId: postedByUserId
      });
      sickBal += sickEarn;
    }
    if (trainingEarn > 0) {
      await PayrollPtoLedger.create({
        agencyId,
        userId,
        entryType: 'accrual',
        ptoBucket: 'training',
        hoursDelta: trainingEarn,
        effectiveDate: ymd(period.period_end),
        payrollPeriodId,
        requestId: null,
        note: 'Training PTO accrual',
        createdByUserId: postedByUserId
      });
      trainingBal += trainingEarn;
    }

    // Caps
    const sickCap = Number(policy.sickAnnualMaxAccrual ?? DEFAULT_PTO_POLICY.sickAnnualMaxAccrual);
    const trainingCap = Number(policy.trainingMaxBalance ?? DEFAULT_PTO_POLICY.trainingMaxBalance);
    if (Number.isFinite(sickCap) && sickBal > sickCap + 1e-9) sickBal = sickCap;
    if (Number.isFinite(trainingCap) && trainingBal > trainingCap + 1e-9) trainingBal = trainingCap;

    await PayrollPtoAccount.upsert({
      agencyId,
      userId,
      employmentType: employment,
      trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
      sickStartHours: acct.sick_start_hours,
      sickStartEffectiveDate: acct.sick_start_effective_date,
      trainingStartHours: acct.training_start_hours,
      trainingStartEffectiveDate: acct.training_start_effective_date,
      sickBalanceHours: sickBal,
      trainingBalanceHours: trainingBal,
      lastAccruedPayrollPeriodId: payrollPeriodId,
      lastSickRolloverYear: year,
      trainingForfeitedAt: acct.training_forfeited_at,
      updatedByUserId: postedByUserId
    });

    accruedUsers += 1;
  }

  return { ok: true, accruedUsers };
}

