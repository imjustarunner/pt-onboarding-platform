import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import PayrollPtoAccount from '../models/PayrollPtoAccount.model.js';
import PayrollPtoLedger from '../models/PayrollPtoLedger.model.js';
import PayrollPtoRequest from '../models/PayrollPtoRequest.model.js';
import PayrollAdjustment from '../models/PayrollAdjustment.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import { computeSubmissionWindow, resolveClaimTimeZone } from '../utils/payrollSubmissionWindow.js';
import { computeAccrualFromBasisHours } from '../utils/payrollPtoAccrual.util.js';

export { computeAccrualFromBasisHours } from '../utils/payrollPtoAccrual.util.js';

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
  const effectivePtoPayRate = (acct?.pto_pay_rate !== null && acct?.pto_pay_rate !== undefined)
    ? Number(acct.pto_pay_rate)
    : Number(defaultPayRate || 0);
  if (!acct) {
    return {
      policy,
      defaultPayRate,
      effectivePtoPayRate: Number(defaultPayRate || 0),
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
    const refreshedRate = (refreshed?.pto_pay_rate !== null && refreshed?.pto_pay_rate !== undefined)
      ? Number(refreshed.pto_pay_rate) : Number(defaultPayRate || 0);
    return {
      policy,
      defaultPayRate,
      effectivePtoPayRate: refreshedRate,
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
    effectivePtoPayRate,
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

/**
 * Directly set a user's current PTO balances and/or PTO pay rate.
 * Each changed bucket writes a `manual_adjustment` ledger entry for the audit trail.
 * ptoPayRate: undefined = don't touch; null = clear to NULL; number = override.
 * Returns { account, previousSickHours, previousTrainingHours, sickChanged, trainingChanged }.
 */
export async function setCurrentBalances({
  agencyId,
  userId,
  sickBalanceHours,
  trainingBalanceHours,
  ptoPayRate,
  updatedByUserId,
  note = 'Balance set by admin'
}) {
  const acct = await ensurePtoAccount({ agencyId, userId, updatedByUserId });
  const today = todayYmd();
  const ledgerNote = String(note || 'Balance set by admin').slice(0, 255);

  const hasSick = sickBalanceHours !== undefined && sickBalanceHours !== null;
  const hasTraining = trainingBalanceHours !== undefined && trainingBalanceHours !== null;

  const previousSickHours = Number(acct.sick_balance_hours || 0);
  const previousTrainingHours = Number(acct.training_balance_hours || 0);
  let nextSick = previousSickHours;
  let nextTraining = previousTrainingHours;
  let sickChanged = false;
  let trainingChanged = false;

  if (hasSick) {
    const newSick = Math.max(0, Number(sickBalanceHours));
    const delta = Math.round((newSick - nextSick) * 100) / 100;
    if (Math.abs(delta) > 1e-9) {
      sickChanged = true;
      await PayrollPtoLedger.create({
        agencyId,
        userId,
        entryType: 'manual_adjustment',
        ptoBucket: 'sick',
        hoursDelta: delta,
        effectiveDate: today,
        payrollPeriodId: null,
        requestId: null,
        note: ledgerNote,
        createdByUserId: updatedByUserId
      });
    }
    nextSick = newSick;
  }

  if (hasTraining) {
    const newTraining = Math.max(0, Number(trainingBalanceHours));
    const delta = Math.round((newTraining - nextTraining) * 100) / 100;
    if (Math.abs(delta) > 1e-9) {
      trainingChanged = true;
      await PayrollPtoLedger.create({
        agencyId,
        userId,
        entryType: 'manual_adjustment',
        ptoBucket: 'training',
        hoursDelta: delta,
        effectiveDate: today,
        payrollPeriodId: null,
        requestId: null,
        note: ledgerNote,
        createdByUserId: updatedByUserId
      });
    }
    nextTraining = newTraining;
  }

  const account = await PayrollPtoAccount.upsert({
    agencyId,
    userId,
    employmentType: acct.employment_type,
    trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
    sickStartHours: acct.sick_start_hours,
    sickStartEffectiveDate: acct.sick_start_effective_date,
    trainingStartHours: acct.training_start_hours,
    trainingStartEffectiveDate: acct.training_start_effective_date,
    sickBalanceHours: nextSick,
    trainingBalanceHours: nextTraining,
    lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
    lastSickRolloverYear: acct.last_sick_rollover_year,
    trainingForfeitedAt: acct.training_forfeited_at,
    ptoPayRate,
    updatedByUserId
  });

  return {
    account,
    previousSickHours,
    previousTrainingHours,
    sickChanged,
    trainingChanged,
    nextSickHours: nextSick,
    nextTrainingHours: nextTraining
  };
}

const NON_EMPLOYEE_ROLES = new Set([
  'guardian',
  'client_guardian',
  'client',
  'school_staff',
  'school_support',
  'applicant',
  'super_admin'
]);

const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'gmx.com',
  'ymail.com'
]);

const PREHIRE_STATUSES = new Set([
  'pending',
  'ready_for_review',
  'prospective',
  'pending_setup',
  'prehire_open',
  'prehire_review'
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function emailDomain(email) {
  const e = normalizeEmail(email);
  if (!e.includes('@')) return '';
  return e.split('@').pop().replace(/^\.+|\.+$/g, '');
}

function isFreemailAddress(email) {
  const domain = emailDomain(email);
  return !!domain && FREEMAIL_DOMAINS.has(domain);
}

/**
 * Prefer a company-facing address for display.
 * Many employees still have a personal/gmail login while work_email is set (or vice versa).
 */
export function resolvePtoSheetDisplayEmail({ workEmail, personalEmail, email } = {}) {
  const work = normalizeEmail(workEmail);
  const personal = normalizeEmail(personalEmail);
  const login = normalizeEmail(email);

  if (work && work !== personal && !isFreemailAddress(work)) return work;
  if (login && login !== personal && !isFreemailAddress(login)) return login;
  if (work) return work;
  if (login && login !== personal) return login;
  return work || login || null;
}

function isPtoSheetEmployeeRow(row) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (NON_EMPLOYEE_ROLES.has(role)) return false;
  const status = String(row?.status || '').trim().toLowerCase();
  if (PREHIRE_STATUSES.has(status)) return false;
  if (row?.is_archived === true || row?.is_archived === 1 || row?.is_archived === '1') return false;
  // Must have a work email on file (may still be provisional / personal for some staff).
  return !!normalizeEmail(row?.work_email);
}

/**
 * Agency-wide PTO sheet: agency employees with a work email on file.
 * Excludes school staff / guardians / applicants / prehire. Does not freemail-filter
 * work_email (personal addresses are often attached; display prefers company email).
 */
export async function listAgencyPtoSheet({ agencyId }) {
  const [rows] = await pool.execute(
    `SELECT
       u.id AS user_id,
       u.first_name,
       u.last_name,
       u.work_email,
       u.personal_email,
       u.email,
       u.role,
       u.status,
       u.is_archived,
       a.employment_type,
       a.training_pto_eligible,
       COALESCE(a.sick_balance_hours, 0) AS sick_balance_hours,
       COALESCE(a.training_balance_hours, 0) AS training_balance_hours,
       a.pto_pay_rate,
       a.updated_at AS account_updated_at,
       CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END AS has_account
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     LEFT JOIN payroll_pto_accounts a ON a.user_id = u.id AND a.agency_id = ?
     WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND u.work_email IS NOT NULL
       AND TRIM(u.work_email) <> ''
     ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
    [agencyId, agencyId]
  );

  return (rows || []).filter((r) => isPtoSheetEmployeeRow(r));
}

/** True when a user may be edited on the agency PTO sheet. */
export async function isPtoSheetEligibleUser({ agencyId, userId }) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.role, u.status, u.work_email, u.personal_email, u.email, u.is_archived
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.id = ?
     LIMIT 1`,
    [agencyId, userId]
  );
  return isPtoSheetEmployeeRow(rows?.[0] || null);
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
  targetPayrollPeriodId = null,
  overrideDeadline = true,
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
  const { policy, defaultPayRate } = await getAgencyPtoPolicy({ agencyId });
  if (bucket === 'training') {
    if (policy?.trainingPtoEnabled !== true) throw new Error('Training PTO is disabled for this organization');
    if (!acct.training_pto_eligible) throw new Error('Training PTO is not enabled for this provider');
  }

  // Balance check (admin overrideable) — done before any DB writes.
  let sickBal = Number(acct.sick_balance_hours || 0);
  let trainingBal = Number(acct.training_balance_hours || 0);
  const totalRequestedHours = (items || []).reduce((a, it) => a + Number(it?.hours || 0), 0);
  const starting = bucket === 'training' ? trainingBal : sickBal;
  const projected = starting - totalRequestedHours;
  if (!overrideBalance && projected < -1e-9) {
    throw new Error(
      `Insufficient PTO balance: starting ${starting.toFixed(2)} hours, requested ${totalRequestedHours.toFixed(2)} hours, projected ${projected.toFixed(2)} hours.`
    );
  }

  // ── Phase 1: Deduct balance + mark approved (atomic via connection transaction) ──
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const it of items) {
      const d = ymd(it.request_date);
      const h = Number(it.hours || 0);
      if (!d || !(h > 0)) continue;
      await conn.execute(
        `INSERT INTO payroll_pto_ledger
           (agency_id, user_id, entry_type, pto_bucket, hours_delta, effective_date, payroll_period_id, request_id, note, created_by_user_id)
         VALUES (?, ?, 'usage', ?, ?, ?, NULL, ?, 'PTO used (approved request)', ?)`,
        [agencyId, userId, bucket, -h, d, requestId, approvedByUserId]
      );
      if (bucket === 'training') trainingBal -= h;
      else sickBal -= h;
    }

    await conn.execute(
      `INSERT INTO payroll_pto_accounts
         (agency_id, user_id, employment_type, training_pto_eligible,
          sick_start_hours, sick_start_effective_date,
          training_start_hours, training_start_effective_date,
          sick_balance_hours, training_balance_hours,
          last_accrued_payroll_period_id, last_sick_rollover_year, training_forfeited_at,
          updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         sick_balance_hours = VALUES(sick_balance_hours),
         training_balance_hours = VALUES(training_balance_hours),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId, userId,
        acct.employment_type, acct.training_pto_eligible ? 1 : 0,
        acct.sick_start_hours, acct.sick_start_effective_date,
        acct.training_start_hours, acct.training_start_effective_date,
        sickBal, trainingBal,
        acct.last_accrued_payroll_period_id, acct.last_sick_rollover_year, acct.training_forfeited_at,
        approvedByUserId
      ]
    );

    await conn.execute(
      `UPDATE payroll_pto_requests
       SET status = 'approved',
           approved_by_user_id = ?,
           approved_at = NOW(),
           rejected_by_user_id = NULL,
           rejected_at = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [approvedByUserId, requestId, agencyId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // ── Phase 2: Post pay into payroll adjustments (best-effort per period) ──
  // Balance is already deducted. Pay-line failures are logged but do not roll back the approval.
  const rate = (acct?.pto_pay_rate !== null && acct?.pto_pay_rate !== undefined)
    ? Number(acct.pto_pay_rate)
    : Number(defaultPayRate || 0);

  let explicitTargetPeriod = null;
  if (Number.isFinite(Number(targetPayrollPeriodId)) && Number(targetPayrollPeriodId) > 0) {
    explicitTargetPeriod = await PayrollPeriod.findById(Number(targetPayrollPeriodId));
    if (explicitTargetPeriod) {
      const st = String(explicitTargetPeriod.status || '').toLowerCase();
      if (st === 'posted' || st === 'finalized') explicitTargetPeriod = null;
    }
  }

  const byPeriod = new Map();
  const skippedDates = [];
  for (const it of items) {
    const d = ymd(it.request_date);
    const h = Number(it.hours || 0);
    if (!d || !(h > 0)) continue;
    let pid = null;
    try {
      if (explicitTargetPeriod) {
        pid = Number(explicitTargetPeriod.id);
      } else if (overrideDeadline) {
        const [pRows] = await pool.execute(
          `SELECT id, status FROM payroll_periods
           WHERE agency_id = ? AND period_start <= ? AND period_end >= ?
           ORDER BY period_end ASC LIMIT 1`,
          [agencyId, d, d]
        );
        const p = pRows?.[0] || null;
        const st = p ? String(p.status || '').toLowerCase() : null;
        if (p?.id && st !== 'posted' && st !== 'finalized') pid = Number(p.id);
      } else {
        const win = await computeSubmissionWindow({
          agencyId, effectiveDateYmd: d, submittedAt: req.created_at,
          timeZone: resolveClaimTimeZone(), hardStopPolicy: '60_days'
        });
        if (win.ok && win.suggestedPayrollPeriodId) pid = Number(win.suggestedPayrollPeriodId);
      }
    } catch {
      // Period lookup failure: skip pay posting for this date, balance already deducted.
    }
    if (pid) byPeriod.set(pid, (byPeriod.get(pid) || 0) + h);
    else skippedDates.push(d);
  }

  const failedPeriods = [];
  for (const [payrollPeriodId, hours] of byPeriod.entries()) {
    try {
      const existing = await PayrollAdjustment.findForPeriodUser(payrollPeriodId, userId);
      const currentSick = Number(existing?.sick_pto_hours ?? 0);
      const currentTraining = Number(existing?.training_pto_hours ?? 0);
      const nextSick = bucket === 'sick' ? currentSick + hours : currentSick;
      const nextTraining = bucket === 'training' ? currentTraining + hours : currentTraining;
      await PayrollAdjustment.upsert({
        payrollPeriodId, agencyId, userId,
        mileageAmount: Number(existing?.mileage_amount ?? 0),
        medcancelAmount: Number(existing?.medcancel_amount ?? 0),
        otherTaxableAmount: Number(existing?.other_taxable_amount ?? 0),
        bonusAmount: Number(existing?.bonus_amount ?? 0),
        reimbursementAmount: Number(existing?.reimbursement_amount ?? 0),
        salaryAmount: Number(existing?.salary_amount ?? 0),
        ptoHours: nextSick + nextTraining,
        sickPtoHours: nextSick,
        trainingPtoHours: nextTraining,
        ptoRate: rate,
        updatedByUserId: approvedByUserId
      });
    } catch {
      failedPeriods.push(payrollPeriodId);
    }
  }

  // Store the primary period on the request for display purposes (first resolved period).
  const primaryPeriodId = Array.from(byPeriod.keys())[0] || null;
  if (primaryPeriodId) {
    try {
      await pool.execute(
        `UPDATE payroll_pto_requests SET approved_payroll_period_id = ? WHERE id = ? LIMIT 1`,
        [primaryPeriodId, requestId]
      );
    } catch { /* best-effort */ }
  }

  return {
    ok: true,
    affectedPayrollPeriodIds: Array.from(byPeriod.keys()),
    skippedDates,
    failedPeriods
  };
}

/**
 * Reverse balances and delete any ledger rows tied to a manual pay line
 * (PTO adjustment lines or direct-pay accrual credits).
 */
export async function clearPtoLedgerForManualPayLine({
  agencyId,
  userId,
  manualPayLineId,
  updatedByUserId
}) {
  if (!agencyId || !userId || !manualPayLineId) return { ok: false };

  const [bucketRows] = await pool.execute(
    `SELECT pto_bucket, COALESCE(SUM(hours_delta), 0) AS hours
     FROM payroll_pto_ledger
     WHERE agency_id = ? AND manual_pay_line_id = ?
     GROUP BY pto_bucket`,
    [agencyId, manualPayLineId]
  );

  if ((bucketRows || []).length) {
    const acct = await PayrollPtoAccount.findForAgencyUser({ agencyId, userId });
    if (acct) {
      let sickBal = Number(acct.sick_balance_hours || 0);
      let trainingBal = Number(acct.training_balance_hours || 0);
      for (const r of bucketRows || []) {
        const bucket = String(r?.pto_bucket || '').toLowerCase() === 'training' ? 'training' : 'sick';
        const hours = Number(r?.hours || 0);
        if (Math.abs(hours) < 1e-9) continue;
        if (bucket === 'training') trainingBal -= hours;
        else sickBal -= hours;
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
        updatedByUserId
      });
    }
  }

  await PayrollPtoLedger.deleteForManualPayLine({ agencyId, manualPayLineId });
  return { ok: true };
}

/**
 * When a manual pay line is Direct, credit PTO using the same basis/30 formula as
 * payroll posting. Indirect / PTO-adjustment lines are no-ops here (PTO adjustments
 * are handled separately). Re-running replaces prior ledger rows for this line id
 * so edits do not double-credit.
 */
export async function syncPtoAccrualForManualDirectPayLine({
  agencyId,
  userId,
  manualPayLineId,
  lineType = 'pay',
  category = 'indirect',
  creditsHours = null,
  label = null,
  payrollPeriodId = null,
  effectiveDate = null,
  createdByUserId
}) {
  if (!agencyId || !userId || !manualPayLineId) return { ok: false };

  // Always clear prior linked ledger first (covers edit / category change / hour change).
  await clearPtoLedgerForManualPayLine({
    agencyId,
    userId,
    manualPayLineId,
    updatedByUserId: createdByUserId
  });

  const lt = String(lineType || 'pay').trim().toLowerCase();
  const cat = String(category || '').trim().toLowerCase();
  const hrs = Number(creditsHours);
  if (lt !== 'pay' || cat !== 'direct' || !Number.isFinite(hrs) || hrs <= 1e-9) {
    return { ok: true, skipped: true, sickEarn: 0, trainingEarn: 0 };
  }

  const { policy } = await getAgencyPtoPolicy({ agencyId });
  if (policy.ptoEnabled === false) return { ok: true, skipped: 'pto_disabled', sickEarn: 0, trainingEarn: 0 };

  const acct = await ensurePtoAccount({ agencyId, userId, updatedByUserId: createdByUserId });
  const { sickEarn, trainingEarn } = computeAccrualFromBasisHours({
    basisHours: hrs,
    policy,
    employmentType: acct.employment_type,
    trainingPtoEligible: Boolean(acct.training_pto_eligible)
  });

  if (sickEarn <= 1e-9 && trainingEarn <= 1e-9) {
    return { ok: true, skipped: 'no_earn', sickEarn: 0, trainingEarn: 0 };
  }

  const eff =
    String(effectiveDate || '').slice(0, 10) ||
    String(acct.sick_start_effective_date || '').slice(0, 10) ||
    todayYmd();
  const noteLabel = String(label || 'Manual').trim().slice(0, 80) || 'Manual';

  let sickBal = Number(acct.sick_balance_hours || 0);
  let trainingBal = Number(acct.training_balance_hours || 0);

  if (sickEarn > 1e-9) {
    await PayrollPtoLedger.create({
      agencyId,
      userId,
      entryType: 'manual_adjustment',
      ptoBucket: 'sick',
      hoursDelta: sickEarn,
      effectiveDate: eff,
      payrollPeriodId,
      requestId: null,
      manualPayLineId,
      note: `PTO accrual from manual direct pay (${noteLabel})`,
      createdByUserId
    });
    sickBal += sickEarn;
  }
  if (trainingEarn > 1e-9) {
    await PayrollPtoLedger.create({
      agencyId,
      userId,
      entryType: 'manual_adjustment',
      ptoBucket: 'training',
      hoursDelta: trainingEarn,
      effectiveDate: eff,
      payrollPeriodId,
      requestId: null,
      manualPayLineId,
      note: `Training PTO accrual from manual direct pay (${noteLabel})`,
      createdByUserId
    });
    trainingBal += trainingEarn;
  }

  const sickCap = Number(policy.sickAnnualMaxAccrual ?? DEFAULT_PTO_POLICY.sickAnnualMaxAccrual);
  const trainingCap = Number(policy.trainingMaxBalance ?? DEFAULT_PTO_POLICY.trainingMaxBalance);
  if (Number.isFinite(sickCap) && sickBal > sickCap + 1e-9) sickBal = sickCap;
  if (Number.isFinite(trainingCap) && trainingBal > trainingCap + 1e-9) trainingBal = trainingCap;

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
    updatedByUserId: createdByUserId
  });

  return { ok: true, sickEarn, trainingEarn };
}

async function sumManualDirectBasisAlreadyCredited({ agencyId, payrollPeriodId, userId }) {
  // Hours on direct manual pay lines that already received ledger PTO credits
  // (so posting-time accrual does not double-count them).
  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(mpl.credits_hours), 0) AS hrs
       FROM payroll_manual_pay_lines mpl
       WHERE mpl.agency_id = ?
         AND mpl.payroll_period_id = ?
         AND mpl.user_id = ?
         AND LOWER(COALESCE(mpl.category, '')) = 'direct'
         AND LOWER(COALESCE(mpl.line_type, 'pay')) = 'pay'
         AND mpl.credits_hours IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM payroll_pto_ledger l
           WHERE l.agency_id = mpl.agency_id
             AND l.manual_pay_line_id = mpl.id
         )`,
      [agencyId, payrollPeriodId, userId]
    );
    const hrs = Number(rows?.[0]?.hrs || 0);
    return Number.isFinite(hrs) && hrs > 0 ? hrs : 0;
  } catch {
    return 0;
  }
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
    // Hourly: direct_hours + indirect_hours only (excludes mileage/bonus/reimbursement/other flat buckets).
    // Fee-for-service: direct_hours + indirect_hours as well (credit-based, all billable work).
    // Salaried: no accrual on hours basis — skip.
    const [sumRows] = await pool.execute(
      `SELECT direct_hours, indirect_hours, breakdown
       FROM payroll_summaries
       WHERE payroll_period_id = ? AND agency_id = ? AND user_id = ?
       LIMIT 1`,
      [payrollPeriodId, agencyId, userId]
    );
    const s = sumRows?.[0] || null;
    const directHours = Number(s?.direct_hours || 0);
    const indirectHours = Number(s?.indirect_hours || 0);

    const employment = String(acct.employment_type || 'hourly');
    // Both hourly and fee_for_service accrue on direct + indirect hours/credits.
    // Exclude manual-direct hours already credited at line-create time to avoid double accrual.
    const alreadyCreditedManualDirect = await sumManualDirectBasisAlreadyCredited({
      agencyId,
      payrollPeriodId,
      userId
    });
    const rawBasis = directHours + indirectHours - alreadyCreditedManualDirect;
    const basis = (employment === 'hourly' || employment === 'fee_for_service')
      ? Math.max(0, rawBasis)
      : 0;

    const earned = computeAccrualFromBasisHours({
      basisHours: basis,
      policy,
      employmentType: employment,
      trainingPtoEligible: Boolean(acct.training_pto_eligible)
    });
    let sickEarn = earned.sickEarn;
    let trainingEarn = earned.trainingEarn;

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

