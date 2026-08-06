/**
 * New pay system calculation service.
 * Used by both the self-serve Pay Calculator estimator and live payroll recompute.
 *
 * Hour-equivalent: units * credit_value (already encodes 4 units = 1 hour = 1 credit).
 */

import pool from '../config/database.js';
import PayrollPaySystemRate from '../models/PayrollPaySystemRate.model.js';
import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';
import { payrollDefaultsForCode } from './payrollServiceCodeDefaults.js';

const PROBATION_DAYS = 90;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseDateOnly(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Classify a service code into a pay-system rate bucket.
 * @returns {'credit'|'hcode'|'indirect'|'support_activity'|'skip'}
 */
export function classifyPayType(serviceCode, ruleOrDefaults = null) {
  const code = String(serviceCode || '').trim().toUpperCase();
  if (!code) return 'skip';

  const defaults = payrollDefaultsForCode(code) || {};
  // Rule rows use snake_case category; defaults use camelCase category.
  const cat = String(ruleOrDefaults?.category ?? defaults.category ?? 'direct').trim().toLowerCase();

  if (cat === 'mileage' || cat === 'bonus' || cat === 'reimbursement' || cat === 'other_pay') return 'skip';
  if (code === 'SALARY' || code === 'BONUS' || code === 'HOLIDAY BONUS' || code === 'MILEAGE' || code === 'REIMBURSEMENT' || code === 'MEDCANCEL' || code === 'MISSED APPT' || code === 'COMMISSION') {
    return 'skip';
  }
  if (cat === 'meeting' || code === 'MEETING' || code === 'INDIVIDUAL MEETING' || code === 'MENTOR/CPA MEETING') {
    return 'support_activity';
  }
  if (cat === 'indirect' || cat === 'admin' || code === 'INDIRECT TIME' || code === 'INDIRECT HOURS' || code === 'ADMIN TIME') {
    return 'indirect';
  }
  // H-prefixed direct codes → hcode rate
  if (/^H\d/i.test(code)) {
    return 'hcode';
  }
  // Remaining direct / tutoring / other clinical → credit rate
  if (cat === 'direct' || cat === 'tutoring' || cat === 'other' || !cat) {
    return 'credit';
  }
  return 'skip';
}

/**
 * Resolve hour-equivalent and pay-hours for a quantity of a code.
 */
export function resolveQuantities({ serviceCode, quantity, rule = null }) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const defaults = payrollDefaultsForCode(code) || {};
  const payDivisor = Number(
    (rule?.pay_divisor === null || rule?.pay_divisor === undefined)
      ? (defaults.payDivisor ?? 1)
      : rule.pay_divisor
  );
  const creditValue = Number(
    (rule?.credit_value === null || rule?.credit_value === undefined)
      ? (defaults.creditValue ?? 0)
      : rule.credit_value
  );
  const units = Number(quantity) || 0;
  const safeDivisor = (!Number.isFinite(payDivisor) || payDivisor <= 0) ? 1 : payDivisor;
  const safeCredit = Number.isFinite(creditValue) ? creditValue : 0;
  const payHours = units / safeDivisor;
  const hourEquivalent = units * safeCredit;
  // Prefer credit-based hour-equivalent; fall back to payHours when credit_value is 0
  const hours = Math.abs(hourEquivalent) > 1e-9 ? hourEquivalent : payHours;
  return {
    units,
    payDivisor: safeDivisor,
    creditValue: safeCredit,
    payHours,
    hourEquivalent: hours,
    quantityLabel: describeQuantity(units, safeDivisor, safeCredit)
  };
}

function describeQuantity(units, payDivisor, creditValue) {
  const hours = units * (Number.isFinite(creditValue) ? creditValue : 0);
  const payHours = units / (payDivisor > 0 ? payDivisor : 1);
  const h = Math.abs(hours) > 1e-9 ? hours : payHours;
  if (Math.abs(payDivisor - 4) < 1e-9 || Math.abs(creditValue - 0.25) < 1e-9) {
    return `${units} unit${units === 1 ? '' : 's'} = ${round2(h)} hour${Math.abs(h - 1) < 1e-9 ? '' : 's'}`;
  }
  if (Math.abs(payDivisor - 60) < 1e-9 || Math.abs(creditValue - (1 / 60)) < 1e-6) {
    return `${units} minute${units === 1 ? '' : 's'} = ${round2(h)} hour${Math.abs(h - 1) < 1e-9 ? '' : 's'}`;
  }
  if (Math.abs(creditValue - 1) < 1e-9 || Math.abs(payDivisor - 1) < 1e-9) {
    return `${units} credit${units === 1 ? '' : 's'} / hour${units === 1 ? '' : 's'}`;
  }
  return `${units} → ${round2(h)} hour-equivalent`;
}

/**
 * Resolve probation / MWR / tier status for a user in a pay period.
 */
export function resolveUserPaySystemStatus({
  assignment,
  providerStartDate,
  periodEnd,
  benefitTierLevel = 0,
  graceActive = false,
  displayTierLevel = null
}) {
  const waiveProbation = Number(assignment?.waive_probation || assignment?.waiveProbation || 0) === 1;
  const waiveMwr = Number(assignment?.waive_minimum_workload || assignment?.waiveMinimumWorkload || 0) === 1;
  const spanishEligible = Number(assignment?.spanish_bonus_eligible || assignment?.spanishBonusEligible || 0) === 1;

  const overrideStart = parseDateOnly(assignment?.probation_start_override || assignment?.probationStartOverride);
  const start = overrideStart || parseDateOnly(providerStartDate);
  const end = parseDateOnly(periodEnd) || new Date();
  const tenureDays = start ? daysBetween(start, end) : null;
  const inProbationWindow = !waiveProbation && tenureDays != null && tenureDays < PROBATION_DAYS;

  const tierLevel = Number(benefitTierLevel || 0);
  const currentTier = displayTierLevel != null ? Number(displayTierLevel) : tierLevel;
  // MWR: below Tier 1 after grace (benefitTierLevel is already grace-adjusted).
  // If grace is active, benefitTierLevel stays at prior tier — so MWR only when
  // post-grace tier is 0 (Out of Compliance).
  const isMinimumWorkload = !waiveMwr && tierLevel < 1;

  const useReducedRates = inProbationWindow || isMinimumWorkload;

  return {
    inProbation: inProbationWindow,
    isMinimumWorkload,
    useReducedRates,
    waiveProbation,
    waiveMinimumWorkload: waiveMwr,
    spanishBonusEligible: spanishEligible,
    tierLevel,
    currentTierLevel: currentTier,
    graceActive: !!graceActive,
    tenureDays,
    probationDays: PROBATION_DAYS,
    probationStart: start ? start.toISOString().slice(0, 10) : null
  };
}

/**
 * Compute pay for a single service-code line under the new pay system.
 */
export function computeLineAmount({ rateProfile, status, serviceCode, quantity, rule = null }) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const payType = classifyPayType(code, rule || payrollDefaultsForCode(code));
  const qty = resolveQuantities({ serviceCode: code, quantity, rule });
  const reduced = !!status?.useReducedRates;
  const category = Number(rateProfile?.category || 0);

  let rate = 0;
  let rateLabel = '';
  let amount = 0;
  let autoIndirectHours = 0;
  let autoIndirectAmount = 0;

  if (payType === 'credit') {
    rate = Number(reduced
      ? (rateProfile?.creditRateProbation ?? rateProfile?.creditRate ?? 0)
      : (rateProfile?.creditRate ?? 0)) || 0;
    rateLabel = reduced ? 'credit_rate_probation' : 'credit_rate';
    amount = qty.hourEquivalent * rate;
  } else if (payType === 'hcode') {
    rate = Number(reduced
      ? (rateProfile?.hcodeRateProbation ?? rateProfile?.hcodeRate ?? 0)
      : (rateProfile?.hcodeRate ?? 0)) || 0;
    rateLabel = reduced ? 'hcode_rate_probation' : 'hcode_rate';
    amount = qty.hourEquivalent * rate;

    // Auto-indirect for categories 2 and 3 only
    if (category >= 2 && qty.hourEquivalent > 1e-9) {
      const minsPerHour = Number(rateProfile?.autoIndirectMinutesPerHour ?? 10) || 10;
      autoIndirectHours = qty.hourEquivalent * (minsPerHour / 60);
      const indRate = Number(rateProfile?.indirectRate || 0) || 0;
      autoIndirectAmount = autoIndirectHours * indRate;
    }
  } else if (payType === 'indirect') {
    rate = Number(rateProfile?.indirectRate || 0) || 0;
    rateLabel = 'indirect_rate';
    amount = qty.hourEquivalent * rate;
  } else if (payType === 'support_activity') {
    rate = Number(rateProfile?.supportActivityRate || 0) || 0;
    rateLabel = 'support_activity_rate';
    amount = qty.hourEquivalent * rate;
  }

  return {
    serviceCode: code,
    payType,
    ...qty,
    rate,
    rateLabel,
    amount: round2(amount),
    autoIndirectHours: round2(autoIndirectHours),
    autoIndirectAmount: round2(autoIndirectAmount),
    totalWithAutoIndirect: round2(amount + autoIndirectAmount)
  };
}

/**
 * Compute tier + Spanish bonuses for a period's total productive hour-equivalent.
 * Bonuses apply regardless of probation/MWR (those only affect base rates).
 */
export function computeBonuses({ rateProfile, status, totalHourEquivalent }) {
  const hours = Number(totalHourEquivalent) || 0;
  const tier = Number(status?.tierLevel || 0);
  const tierBonusPer = tier >= 1
    ? Number(rateProfile?.tierBonus?.[tier] ?? rateProfile?.tierBonus?.[String(tier)] ?? 0) || 0
    : 0;
  const spanishPer = (status?.spanishBonusEligible && tier >= 1)
    ? Number(rateProfile?.spanishBonus?.[tier] ?? rateProfile?.spanishBonus?.[String(tier)] ?? 0) || 0
    : 0;

  const tierBonusAmount = round2(hours * tierBonusPer);
  const spanishBonusAmount = round2(hours * spanishPer);

  return {
    productiveHourEquivalent: round2(hours),
    tierLevel: tier,
    tierBonusPerHour: tierBonusPer,
    spanishBonusPerHour: spanishPer,
    tierBonusAmount,
    spanishBonusAmount,
    totalBonusAmount: round2(tierBonusAmount + spanishBonusAmount)
  };
}

/**
 * Estimate pay for a set of calculator lines.
 */
export function estimatePay({ rateProfile, status, lines = [], rulesByCode = new Map() }) {
  const computedLines = [];
  let baseAmount = 0;
  let autoIndirectTotal = 0;
  let productiveHours = 0;
  let totalHourEquivalent = 0;

  for (const line of lines) {
    const code = String(line.serviceCode || line.code || '').trim().toUpperCase();
    if (!code) continue;
    const rule = rulesByCode.get(code) || null;
    const result = computeLineAmount({
      rateProfile,
      status,
      serviceCode: code,
      quantity: line.quantity ?? line.units ?? 0,
      rule
    });
    if (result.payType === 'skip') continue;
    computedLines.push(result);
    baseAmount += result.amount;
    autoIndirectTotal += result.autoIndirectAmount;
    totalHourEquivalent += result.hourEquivalent;
    if (result.payType === 'credit' || result.payType === 'hcode') {
      productiveHours += result.hourEquivalent;
    }
  }

  const bonuses = computeBonuses({
    rateProfile,
    status,
    totalHourEquivalent: productiveHours
  });

  const grandTotal = round2(baseAmount + autoIndirectTotal + bonuses.totalBonusAmount);

  return {
    lines: computedLines,
    summary: {
      baseAmount: round2(baseAmount),
      autoIndirectAmount: round2(autoIndirectTotal),
      tierBonusAmount: bonuses.tierBonusAmount,
      spanishBonusAmount: bonuses.spanishBonusAmount,
      totalBonusAmount: bonuses.totalBonusAmount,
      productiveHourEquivalent: bonuses.productiveHourEquivalent,
      totalHourEquivalent: round2(totalHourEquivalent),
      grandTotal
    },
    bonuses,
    status
  };
}

/**
 * Load everything needed to pay a user under the new system.
 */
export async function loadUserPaySystemContext({ agencyId, userId, periodEnd, benefitTierLevel = 0, graceActive = false, displayTierLevel = null }) {
  const agencyEnabled = await PayrollPaySystemRate.isAgencyEnabled(agencyId);
  if (!agencyEnabled) {
    return { enabled: false, agencyEnabled: false, userEnabled: false };
  }

  const assignment = await PayrollCompensationLevel.getForUser(agencyId, userId);
  const userEnabled = Number(assignment?.pay_system_enabled || 0) === 1;
  if (!userEnabled || !assignment?.category || !assignment?.level) {
    return {
      enabled: false,
      agencyEnabled: true,
      userEnabled,
      assignment
    };
  }

  const rateProfile = await PayrollPaySystemRate.get(agencyId, assignment.category, assignment.level);
  if (!rateProfile) {
    return { enabled: false, agencyEnabled: true, userEnabled: true, assignment, rateProfile: null };
  }

  let providerStartDate = null;
  try {
    const [urows] = await pool.execute(
      `SELECT provider_start_date, hired_at, languages_spoken FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    providerStartDate = urows?.[0]?.provider_start_date || urows?.[0]?.hired_at || null;
    // Auto-detect Spanish from languages_spoken if flag not set
    if (!Number(assignment.spanish_bonus_eligible) && urows?.[0]?.languages_spoken) {
      const lang = String(urows[0].languages_spoken).toLowerCase();
      if (/\bspanish\b|\bespañol\b|\bespanol\b/.test(lang)) {
        assignment.spanish_bonus_eligible = 1;
      }
    }
  } catch {
    // ignore
  }

  const status = resolveUserPaySystemStatus({
    assignment,
    providerStartDate,
    periodEnd,
    benefitTierLevel,
    graceActive,
    displayTierLevel
  });

  return {
    enabled: true,
    agencyEnabled: true,
    userEnabled: true,
    assignment,
    rateProfile,
    status,
    providerStartDate
  };
}

/**
 * Re-rate a payroll breakdown's service-code lines under the new pay system.
 * Mutates breakdown in place and returns totals + __paySystem metadata.
 */
export function applyPaySystemToBreakdown({ breakdown, rateProfile, status, shiftDirectHours = 0, shiftIndirectHours = 0 }) {
  let servicePay = 0;
  let autoIndirectTotal = 0;
  let productiveHours = 0;
  const lineResults = [];
  const autoIndirectLines = [];

  for (const [code, row] of Object.entries(breakdown || {})) {
    if (!row || typeof row !== 'object') continue;
    if (String(code).startsWith('__')) continue;
    const units = Number(row.finalizedUnits ?? row.units ?? 0) || 0;
    if (units <= 1e-9) continue;

    const rule = {
      category: row.category,
      pay_divisor: row.payDivisor,
      credit_value: row.creditValue,
      duration_minutes: row.durationMinutes
    };
    const result = computeLineAmount({
      rateProfile,
      status,
      serviceCode: code,
      quantity: units,
      rule
    });
    if (result.payType === 'skip') continue;

    row.amount = result.amount;
    row.rateAmount = result.rate;
    row.rateUnit = 'per_hour_equivalent';
    row.rateSource = 'pay_system';
    row.payType = result.payType;
    row.hourEquivalent = result.hourEquivalent;
    servicePay += result.amount;

    if (result.payType === 'credit' || result.payType === 'hcode') {
      productiveHours += result.hourEquivalent;
    }
    if (result.autoIndirectAmount > 1e-9) {
      autoIndirectTotal += result.autoIndirectAmount;
      autoIndirectLines.push({
        sourceCode: code,
        hours: result.autoIndirectHours,
        amount: result.autoIndirectAmount,
        rate: Number(rateProfile.indirectRate || 0) || 0
      });
    }
    lineResults.push(result);
  }

  // Shift punches: direct → credit/hcode? Treat as credit-hour equivalent at credit rate;
  // indirect at indirect rate. (Shift work is generally hourly direct service.)
  const reduced = !!status.useReducedRates;
  const creditRate = Number(reduced
    ? (rateProfile.creditRateProbation ?? rateProfile.creditRate ?? 0)
    : (rateProfile.creditRate ?? 0)) || 0;
  const indirectRate = Number(rateProfile.indirectRate || 0) || 0;
  const shiftDirectPay = round2((Number(shiftDirectHours) || 0) * creditRate);
  const shiftIndirectPay = round2((Number(shiftIndirectHours) || 0) * indirectRate);
  const shiftHoursPay = round2(shiftDirectPay + shiftIndirectPay);
  if ((Number(shiftDirectHours) || 0) > 1e-9) {
    productiveHours += Number(shiftDirectHours) || 0;
  }

  const bonuses = computeBonuses({
    rateProfile,
    status,
    totalHourEquivalent: productiveHours
  });

  const paySystemBase = round2(servicePay + autoIndirectTotal + shiftHoursPay);
  const paySystemTotal = round2(paySystemBase + bonuses.totalBonusAmount);

  const meta = {
    enabled: true,
    category: rateProfile.category,
    level: rateProfile.level,
    status,
    rates: {
      creditRate: rateProfile.creditRate,
      creditRateProbation: rateProfile.creditRateProbation,
      hcodeRate: rateProfile.hcodeRate,
      hcodeRateProbation: rateProfile.hcodeRateProbation,
      indirectRate: rateProfile.indirectRate,
      supportActivityRate: rateProfile.supportActivityRate,
      autoIndirectMinutesPerHour: rateProfile.autoIndirectMinutesPerHour
    },
    servicePay: round2(servicePay),
    autoIndirectAmount: round2(autoIndirectTotal),
    autoIndirectLines,
    shiftHoursPay,
    shiftDirectPay,
    shiftIndirectPay,
    bonuses,
    paySystemBase,
    paySystemBonusTotal: bonuses.totalBonusAmount,
    paySystemTotal,
    lines: lineResults
  };

  if (breakdown && typeof breakdown === 'object') {
    breakdown.__paySystem = meta;
    if (autoIndirectTotal > 1e-9) {
      breakdown['AUTO INDIRECT'] = {
        units: round2(autoIndirectLines.reduce((s, l) => s + l.hours, 0)),
        finalizedUnits: round2(autoIndirectLines.reduce((s, l) => s + l.hours, 0)),
        category: 'indirect',
        bucket: 'indirect',
        hours: round2(autoIndirectLines.reduce((s, l) => s + l.hours, 0)),
        creditsHours: round2(autoIndirectLines.reduce((s, l) => s + l.hours, 0)),
        payHours: round2(autoIndirectLines.reduce((s, l) => s + l.hours, 0)),
        rateAmount: indirectRate,
        rateUnit: 'per_hour',
        rateSource: 'pay_system_auto_indirect',
        payType: 'indirect',
        amount: round2(autoIndirectTotal)
      };
    }
    if (bonuses.tierBonusAmount > 1e-9 || bonuses.spanishBonusAmount > 1e-9) {
      breakdown.__paySystemBonuses = {
        tierBonusAmount: bonuses.tierBonusAmount,
        spanishBonusAmount: bonuses.spanishBonusAmount,
        totalBonusAmount: bonuses.totalBonusAmount,
        productiveHourEquivalent: bonuses.productiveHourEquivalent,
        tierLevel: bonuses.tierLevel
      };
    }
  }

  return meta;
}

export default {
  classifyPayType,
  resolveQuantities,
  resolveUserPaySystemStatus,
  computeLineAmount,
  computeBonuses,
  estimatePay,
  loadUserPaySystemContext,
  applyPaySystemToBreakdown,
  PROBATION_DAYS
};
