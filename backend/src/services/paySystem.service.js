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
    (rule?.pay_divisor ?? rule?.payDivisor) == null
      ? (defaults.payDivisor ?? 1)
      : (rule.pay_divisor ?? rule.payDivisor)
  );
  const creditValue = Number(
    (rule?.credit_value ?? rule?.creditValue) == null
      ? (defaults.creditValue ?? 0)
      : (rule.credit_value ?? rule.creditValue)
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
  const locationEligible = Number(assignment?.location_bonus_eligible || assignment?.locationBonusEligible || 0) === 1;

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
    locationBonusEligible: locationEligible,
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

  let rate = 0;
  let rateLabel = '';
  let amount = 0;
  let autoIndirectHours = 0;
  let autoIndirectAmount = 0;
  let hcodeFallbackToCredit = false;

  if (payType === 'credit') {
    rate = Number(reduced
      ? (rateProfile?.creditRateProbation ?? rateProfile?.creditRate ?? 0)
      : (rateProfile?.creditRate ?? 0)) || 0;
    rateLabel = reduced ? 'credit_rate_probation' : 'credit_rate';
    amount = qty.hourEquivalent * rate;
  } else if (payType === 'hcode') {
    const hRate = Number(reduced
      ? (rateProfile?.hcodeRateProbation ?? rateProfile?.hcodeRate ?? 0)
      : (rateProfile?.hcodeRate ?? 0)) || 0;

    if (hRate > 0) {
      rate = hRate;
      rateLabel = reduced ? 'hcode_rate_probation' : 'hcode_rate';
      const gross = qty.hourEquivalent * rate;
      amount = round2(gross);
      // H-code pay is the full H rate for face time; auto-indirect minutes are ADDED on top
      // (default 10 min per hour at the indirect rate).
      // Example: $32/hr H + $24/hr indirect → $32 + $4 (10 min) = $36 total.
      const minsPerHour = Number(rateProfile?.autoIndirectMinutesPerHour ?? 10) || 10;
      if (minsPerHour > 0 && qty.hourEquivalent > 1e-9) {
        autoIndirectHours = qty.hourEquivalent * (minsPerHour / 60);
        const indRate = Number(rateProfile?.indirectRate || 0) || 0;
        autoIndirectAmount = round2(autoIndirectHours * indRate);
      }
    } else {
      // No H-code rate on this level: pay FFS/direct for the entered time.
      // Staff log their own indirect separately (no auto-indirect add-on).
      hcodeFallbackToCredit = true;
      rate = Number(reduced
        ? (rateProfile?.creditRateProbation ?? rateProfile?.creditRate ?? 0)
        : (rateProfile?.creditRate ?? 0)) || 0;
      rateLabel = reduced ? 'credit_rate_probation_hcode_fallback' : 'credit_rate_hcode_fallback';
      amount = qty.hourEquivalent * rate;
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
    /** H-code face-time pay before auto-indirect add-on. */
    hcodeDirectAmount: payType === 'hcode' ? round2(amount) : round2(amount),
    hcodeGrossAmount: payType === 'hcode'
      ? round2(amount + autoIndirectAmount)
      : round2(amount),
    totalWithAutoIndirect: round2(amount + autoIndirectAmount),
    splitNote: autoIndirectAmount > 1e-9
      ? `${round2(amount)} H-code + ${round2(autoIndirectAmount)} auto-indirect (${round2(autoIndirectHours)} h @ indirect rate) = ${round2(amount + autoIndirectAmount)}`
      : null,
    hcodeFallbackToCredit
  };
}

/**
 * Compute tier + Spanish + location (Denver) bonuses for productive hour-equivalent.
 * Optional separate FFS vs H-code tier bonuses; each falls back to shared tierBonus.
 * Bonuses apply regardless of probation/MWR (those only affect base rates).
 */
export function computeBonuses({
  rateProfile,
  status,
  totalHourEquivalent,
  ffsHourEquivalent = null,
  hcodeHourEquivalent = null
}) {
  const hours = Number(totalHourEquivalent) || 0;
  const ffsHours = ffsHourEquivalent != null ? Number(ffsHourEquivalent) || 0 : hours;
  const hHours = hcodeHourEquivalent != null ? Number(hcodeHourEquivalent) || 0 : 0;
  const tier = Number(status?.tierLevel || 0);

  const sharedTier = (map) =>
    tier >= 1 ? Number(map?.[tier] ?? map?.[String(tier)] ?? 0) || 0 : 0;

  const ffsTierMap = rateProfile?.tierBonusFfs || rateProfile?.tierBonus;
  const hTierMap = rateProfile?.tierBonusHcode || rateProfile?.tierBonus;

  // When separate FFS/H maps aren't set, use shared tier on total productive hours once.
  const useSplitTier = !!(rateProfile?.tierBonusFfs || rateProfile?.tierBonusHcode);
  const tierBonusPerFfs = sharedTier(ffsTierMap);
  const tierBonusPerH = sharedTier(hTierMap);
  const tierBonusPerShared = sharedTier(rateProfile?.tierBonus);

  const tierBonusAmount = useSplitTier
    ? round2(ffsHours * tierBonusPerFfs + hHours * tierBonusPerH)
    : round2(hours * tierBonusPerShared);

  const spanishPer = (status?.spanishBonusEligible && tier >= 1)
    ? Number(rateProfile?.spanishBonus?.[tier] ?? rateProfile?.spanishBonus?.[String(tier)] ?? 0) || 0
    : 0;
  const locationPer = (status?.locationBonusEligible && tier >= 1)
    ? Number(rateProfile?.locationBonus?.[tier] ?? rateProfile?.locationBonus?.[String(tier)] ?? 0) || 0
    : 0;

  const spanishBonusAmount = round2(hours * spanishPer);
  const locationBonusAmount = round2(hours * locationPer);

  return {
    productiveHourEquivalent: round2(hours),
    ffsHourEquivalent: round2(ffsHours),
    hcodeHourEquivalent: round2(hHours),
    tierLevel: tier,
    tierBonusPerHour: useSplitTier ? null : tierBonusPerShared,
    tierBonusPerFfsHour: useSplitTier ? tierBonusPerFfs : tierBonusPerShared,
    tierBonusPerHcodeHour: useSplitTier ? tierBonusPerH : tierBonusPerShared,
    spanishBonusPerHour: spanishPer,
    locationBonusPerHour: locationPer,
    tierBonusAmount,
    spanishBonusAmount,
    locationBonusAmount,
    totalBonusAmount: round2(tierBonusAmount + spanishBonusAmount + locationBonusAmount)
  };
}

/**
 * Attach display fields used by the payroll calculator (H-code pay + additive auto-indirect).
 */
export function decorateEstimateLine(result, rateProfile, extras = {}) {
  const indRate = Number(rateProfile?.indirectRate || 0) || 0;
  const hasSplit = Number(result?.autoIndirectAmount || 0) > 1e-9;
  const hours = Number(result?.hourEquivalent || 0);
  const payType = String(result?.payType || '');
  const kind = extras.kind || result?.kind || 'service';
  const eventBucket = String(extras.payBucket || result?.payBucket || '').toLowerCase();
  const isEvent = kind === 'event';
  const isIndirectStyle = payType === 'indirect' || payType === 'support_activity'
    || (isEvent && eventBucket !== 'direct');

  if (isIndirectStyle) {
    const isDirectEvent = isEvent && eventBucket === 'direct';
    const bucketLabel = isDirectEvent
      ? 'Direct'
      : (payType === 'support_activity' || eventBucket === 'support' || eventBucket === 'support_activity'
        ? 'Support'
        : (eventBucket === 'supervision_note' ? 'Supervision' : 'Indirect'));
    return {
      ...result,
      ...extras,
      kind,
      timeHours: hours,
      bucketLabel,
      directHours: isDirectEvent ? hours : 0,
      directRate: isDirectEvent ? (Number(result.rate) || 0) : 0,
      directAmount: isDirectEvent ? round2(result.amount) : 0,
      indirectHours: isDirectEvent ? 0 : hours,
      indirectRate: isDirectEvent ? 0 : (Number(result.rate) || 0),
      indirectAmount: isDirectEvent ? 0 : round2(result.amount),
      lineTotal: round2(result.amount)
    };
  }

  const directRate = hasSplit && hours > 1e-9
    ? round2(result.amount / hours)
    : (Number(result.rate) || 0);
  return {
    ...result,
    ...extras,
    kind,
    timeHours: hours,
    bucketLabel: payType === 'hcode' && !result.hcodeFallbackToCredit ? 'H-code' : 'Direct',
    directHours: hours,
    directRate,
    directAmount: round2(result.amount),
    indirectHours: Number(result.autoIndirectHours || 0) || 0,
    indirectRate: hasSplit ? indRate : 0,
    indirectAmount: round2(result.autoIndirectAmount || 0),
    lineTotal: round2(result.totalWithAutoIndirect ?? result.amount)
  };
}

function computeEventLine({ rateProfile, status, line }) {
  const hours = Number(line.hours ?? line.quantity ?? line.units ?? 0) || 0;
  const bucketRaw = String(line.payBucket || line.bucket || 'indirect').toLowerCase();
  const reduced = !!status?.useReducedRates;
  let rate = 0;
  let payType = 'indirect';
  if (bucketRaw === 'direct') {
    payType = 'credit';
    rate = Number(reduced
      ? (rateProfile?.creditRateProbation ?? rateProfile?.creditRate ?? 0)
      : (rateProfile?.creditRate ?? 0)) || 0;
  } else if (bucketRaw === 'support' || bucketRaw === 'support_activity') {
    payType = 'support_activity';
    rate = Number(rateProfile?.supportActivityRate || 0) || 0;
  } else {
    payType = 'indirect';
    rate = Number(rateProfile?.indirectRate || 0) || 0;
  }
  const amount = round2(hours * rate);
  const label = String(line.label || line.eventLabel || 'Event').trim() || 'Event';
  const displayCode = String(line.displayCode || line.activityCode || '').trim();
  return decorateEstimateLine({
    kind: 'event',
    serviceCode: displayCode || label,
    payType,
    quantity: hours,
    hourEquivalent: hours,
    rate,
    rateLabel: payType === 'credit' ? 'credit_rate' : (payType === 'support_activity' ? 'support_activity_rate' : 'indirect_rate'),
    amount,
    autoIndirectHours: 0,
    autoIndirectAmount: 0,
    hcodeGrossAmount: amount,
    totalWithAutoIndirect: amount,
    splitNote: null,
    hcodeFallbackToCredit: false
  }, rateProfile, {
    kind: 'event',
    eventTypeId: Number(line.eventTypeId || line.serviceTypeId || 0) || null,
    label,
    displayCode: displayCode || null,
    payBucket: bucketRaw === 'direct' ? 'direct' : (bucketRaw === 'support' || bucketRaw === 'support_activity' ? 'support' : 'indirect')
  });
}

/**
 * Estimate pay for a set of calculator lines.
 * Service-code lines are totaled by code; event lines stay individual.
 */
export function estimatePay({ rateProfile, status, lines = [], rulesByCode = new Map() }) {
  const computedLines = [];
  let baseAmount = 0;
  let autoIndirectTotal = 0;
  let productiveHours = 0;
  let ffsHours = 0;
  let hcodeHours = 0;
  let totalHourEquivalent = 0;
  let directHoursTotal = 0;
  let directPayTotal = 0;
  let indirectHoursTotal = 0;
  let indirectPayTotal = 0;

  for (const line of lines) {
    const kind = String(line?.kind || '').toLowerCase();
    const hasServiceCode = !!String(line?.serviceCode || line?.code || '').trim();
    let decorated;
    if (kind === 'event' || (!hasServiceCode && (line?.eventTypeId || line?.serviceTypeId))) {
      const hours = Number(line.hours ?? line.quantity ?? 0) || 0;
      if (hours <= 1e-9) continue;
      decorated = computeEventLine({ rateProfile, status, line });
    } else {
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
      decorated = decorateEstimateLine(result, rateProfile, { kind: 'service' });
    }

    computedLines.push(decorated);
    baseAmount += Number(decorated.directAmount || 0);
    autoIndirectTotal += Number(decorated.indirectAmount || 0);
    totalHourEquivalent += Number(decorated.timeHours || 0);
    directHoursTotal += Number(decorated.directHours || 0);
    directPayTotal += Number(decorated.directAmount || 0);
    indirectHoursTotal += Number(decorated.indirectHours || 0);
    indirectPayTotal += Number(decorated.indirectAmount || 0);

    if (decorated.payType === 'credit' || decorated.hcodeFallbackToCredit) {
      productiveHours += Number(decorated.hourEquivalent || 0);
      ffsHours += Number(decorated.hourEquivalent || 0);
    } else if (decorated.payType === 'hcode') {
      productiveHours += Number(decorated.hourEquivalent || 0);
      hcodeHours += Number(decorated.hourEquivalent || 0);
    }
  }

  const bonuses = computeBonuses({
    rateProfile,
    status,
    totalHourEquivalent: productiveHours,
    ffsHourEquivalent: ffsHours,
    hcodeHourEquivalent: hcodeHours
  });

  const grandTotal = round2(directPayTotal + indirectPayTotal + bonuses.totalBonusAmount);

  return {
    lines: computedLines,
    summary: {
      baseAmount: round2(directPayTotal),
      autoIndirectAmount: round2(indirectPayTotal),
      directHours: round2(directHoursTotal),
      directPay: round2(directPayTotal),
      indirectHours: round2(indirectHoursTotal),
      indirectPay: round2(indirectPayTotal),
      credits: round2(ffsHours + hcodeHours),
      tierBonusAmount: bonuses.tierBonusAmount,
      spanishBonusAmount: bonuses.spanishBonusAmount,
      locationBonusAmount: bonuses.locationBonusAmount,
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

  // Deferred activation: rates only apply once the period ends on/after effective start.
  const effectiveStart = parseDateOnly(
    assignment.pay_system_effective_start || assignment.paySystemEffectiveStart
  );
  const periodEndDate = parseDateOnly(periodEnd);
  if (effectiveStart && periodEndDate && periodEndDate < effectiveStart) {
    return {
      enabled: false,
      agencyEnabled: true,
      userEnabled: true,
      assignment,
      notYetEffective: true,
      paySystemEffectiveStart: effectiveStart.toISOString().slice(0, 10)
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
  let ffsHours = 0;
  let hcodeHours = 0;
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
    if (result.splitNote) {
      row.paySystemSplitNote = result.splitNote;
      row.hcodeGrossAmount = result.hcodeGrossAmount;
      row.directAmount = result.amount;
      row.embeddedIndirectAmount = result.autoIndirectAmount;
    }
    servicePay += result.amount;

    if (result.payType === 'credit' || result.hcodeFallbackToCredit) {
      productiveHours += result.hourEquivalent;
      ffsHours += result.hourEquivalent;
    } else if (result.payType === 'hcode') {
      productiveHours += result.hourEquivalent;
      hcodeHours += result.hourEquivalent;
    }
    if (result.autoIndirectAmount > 1e-9) {
      autoIndirectTotal += result.autoIndirectAmount;
      autoIndirectLines.push({
        sourceCode: code,
        hours: result.autoIndirectHours,
        amount: result.autoIndirectAmount,
        rate: Number(rateProfile.indirectRate || 0) || 0,
        directAmount: result.amount,
        grossAmount: result.hcodeGrossAmount
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
    ffsHours += Number(shiftDirectHours) || 0;
  }

  const bonuses = computeBonuses({
    rateProfile,
    status,
    totalHourEquivalent: productiveHours,
    ffsHourEquivalent: ffsHours,
    hcodeHourEquivalent: hcodeHours
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
        amount: round2(autoIndirectTotal),
        label: 'Auto-indirect (added with H-code)',
        note: autoIndirectLines.map((l) =>
          `${l.sourceCode}: ${l.directAmount} H-code + ${l.amount} auto-indirect (${l.hours} h) = ${l.grossAmount}`
        ).join('; ')
      };
    }
    if (bonuses.tierBonusAmount > 1e-9 || bonuses.spanishBonusAmount > 1e-9 || bonuses.locationBonusAmount > 1e-9) {
      breakdown.__paySystemBonuses = {
        tierBonusAmount: bonuses.tierBonusAmount,
        spanishBonusAmount: bonuses.spanishBonusAmount,
        locationBonusAmount: bonuses.locationBonusAmount,
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
