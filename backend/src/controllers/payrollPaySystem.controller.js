import pool from '../config/database.js';
import PayrollPaySystemRate from '../models/PayrollPaySystemRate.model.js';
import PayrollCompensationLevel, {
  COMPENSATION_CATEGORIES,
  CATEGORY_IDS,
  LEVEL_IDS
} from '../models/PayrollCompensationLevel.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';
import PayrollIndirectServiceType from '../models/PayrollIndirectServiceType.model.js';
import {
  classifyPayType,
  estimatePay,
  resolveUserPaySystemStatus,
  loadUserPaySystemContext
} from '../services/paySystem.service.js';
import { payrollDefaultsForCode } from '../services/payrollServiceCodeDefaults.js';

const requireAgencyId = (req, res) => {
  const id = parseInt(req.query.agencyId || req.body?.agencyId || '', 10);
  if (!id) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return null;
  }
  return id;
};

function enrichRuleWithPayType(rule) {
  const code = String(rule?.service_code || rule?.serviceCode || '').trim().toUpperCase();
  const defaults = payrollDefaultsForCode(code);
  const payType = classifyPayType(code, rule || defaults);
  return { ...rule, payType };
}

function mapServiceCodeForCalculator(r) {
  return {
    serviceCode: String(r.service_code || r.serviceCode || '').trim().toUpperCase(),
    category: r.category,
    payType: r.payType,
    payDivisor: r.pay_divisor ?? r.payDivisor,
    creditValue: r.credit_value ?? r.creditValue,
    durationMinutes: r.duration_minutes ?? r.durationMinutes,
    payRateUnit: r.pay_rate_unit ?? r.payRateUnit,
    showInRateSheet: r.show_in_rate_sheet ?? r.showInRateSheet
  };
}

function mapEventTypeForCalculator(t) {
  return {
    id: Number(t.id),
    typeKey: t.typeKey,
    label: t.label,
    displayCode: t.displayCode || '',
    payBucket: t.payBucket || 'indirect',
    description: t.description || ''
  };
}

async function loadCalculatorCatalog(agencyId) {
  const [rules, eventTypes, rates] = await Promise.all([
    PayrollServiceCodeRule.listForAgency(agencyId),
    PayrollIndirectServiceType.listForAgency({ agencyId, activeOnly: true }),
    PayrollPaySystemRate.listForAgency(agencyId)
  ]);
  const enriched = (rules || []).map((r) => enrichRuleWithPayType(r));
  const serviceCodes = enriched
    .filter((r) => r.payType && r.payType !== 'skip')
    .map(mapServiceCodeForCalculator);
  return {
    serviceCodes,
    eventTypes: (eventTypes || []).map(mapEventTypeForCalculator),
    rates: rates || []
  };
}

function normalizeEstimateLines(rawLines, eventTypes = []) {
  const byId = new Map((eventTypes || []).map((t) => [Number(t.id), t]));
  return (Array.isArray(rawLines) ? rawLines : []).map((l) => {
    const kind = String(l?.kind || '').toLowerCase();
    if (kind === 'event' || l?.eventTypeId || l?.serviceTypeId) {
      const id = Number(l.eventTypeId || l.serviceTypeId || 0);
      const ev = byId.get(id) || null;
      return {
        kind: 'event',
        eventTypeId: id || null,
        hours: Number(l.hours ?? l.quantity ?? l.units ?? 0) || 0,
        quantity: Number(l.hours ?? l.quantity ?? l.units ?? 0) || 0,
        label: l.label || ev?.label,
        displayCode: l.displayCode || ev?.displayCode,
        payBucket: l.payBucket || ev?.payBucket || 'indirect'
      };
    }
    return {
      kind: 'service',
      serviceCode: String(l.serviceCode || l.code || '').trim().toUpperCase(),
      quantity: l.quantity ?? l.units ?? 0
    };
  });
}

/** GET /payroll/pay-system/rates?agencyId= */
export const listPaySystemRates = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const [rates, enabled] = await Promise.all([
      PayrollPaySystemRate.listForAgency(agencyId),
      PayrollPaySystemRate.isAgencyEnabled(agencyId)
    ]);
    res.json({
      rates,
      enabled,
      categories: COMPENSATION_CATEGORIES
    });
  } catch (e) { next(e); }
};

/**
 * PUT /payroll/pay-system/rates
 * body: { agencyId, rates: [{ category, level, creditRate, ... }] }
 */
export const savePaySystemRates = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const { rates } = req.body || {};
    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: { message: 'rates array is required' } });
    }
    for (const row of rates) {
      const cat = parseInt(row.category, 10);
      const lvl = parseInt(row.level, 10);
      if (!CATEGORY_IDS.includes(cat) || !LEVEL_IDS.includes(lvl)) continue;
      await PayrollPaySystemRate.upsert(agencyId, cat, lvl, {
        creditRate: row.creditRate,
        creditRateProbation: row.creditRateProbation,
        hcodeRate: row.hcodeRate,
        hcodeRateProbation: row.hcodeRateProbation,
        indirectRate: row.indirectRate,
        supportActivityRate: row.supportActivityRate,
        autoIndirectMinutesPerHour: row.autoIndirectMinutesPerHour,
        tierBonus: row.tierBonus,
        ...(row.tierBonusFfs !== undefined ? { tierBonusFfs: row.tierBonusFfs } : {}),
        ...(row.tierBonusHcode !== undefined ? { tierBonusHcode: row.tierBonusHcode } : {}),
        spanishBonus: row.spanishBonus,
        locationBonus: row.locationBonus
      });
    }
    const [saved, enabled] = await Promise.all([
      PayrollPaySystemRate.listForAgency(agencyId),
      PayrollPaySystemRate.isAgencyEnabled(agencyId)
    ]);
    res.json({ rates: saved, enabled });
  } catch (e) { next(e); }
};

/**
 * POST /payroll/pay-system/transition
 * body: { agencyId }
 * Turns the agency flag ON so rates can be configured. Does NOT enroll staff —
 * use POST /pay-system/go with an effective start date to activate payroll rates.
 */
export const transitionToPaySystem = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;

    await PayrollPaySystemRate.setAgencyEnabled(agencyId, true);

    res.json({
      ok: true,
      enabled: true,
      usersEnrolled: 0,
      message: 'Agency pay system flag is ON. Stage pay-level updates below, then click Go and enter the start date to activate rates for payroll.'
    });
  } catch (e) { next(e); }
};

/**
 * GET /payroll/pay-system/assignments?agencyId=
 * Live compensation-level assignments + pending staged changes for rollout UI.
 */
export const listPaySystemAssignments = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const [assignments, pending, enabled] = await Promise.all([
      PayrollCompensationLevel.listAssignmentsForAgency(agencyId),
      PayrollCompensationLevel.listPendingForAgency(agencyId),
      PayrollPaySystemRate.isAgencyEnabled(agencyId)
    ]);
    res.json({ assignments, pending, enabled });
  } catch (e) { next(e); }
};

/**
 * PUT /payroll/pay-system/pending
 * body: { agencyId, changes: [{ userId, category, level, bypass? }], batchId?, notes? }
 * Stages pay-level changes. Does not affect live payroll until Go.
 */
export const savePaySystemPending = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const { changes, batchId, notes } = req.body || {};
    if (!Array.isArray(changes) || !changes.length) {
      return res.status(400).json({ error: { message: 'changes array is required' } });
    }
    for (const row of changes) {
      const userId = parseInt(row.userId, 10);
      const cat = parseInt(row.category, 10);
      const levelRaw = row.level != null ? parseInt(row.level, 10) : null;
      const level = LEVEL_IDS.includes(levelRaw) ? levelRaw : null;
      if (!userId || !CATEGORY_IDS.includes(cat)) continue;
      await PayrollCompensationLevel.upsertPending(agencyId, userId, {
        category: cat,
        level,
        bypass: row.bypass === true || row.bypass === 1 || level == null,
        paySystemEnabled: row.paySystemEnabled !== false,
        batchId: batchId || null,
        notes: notes || row.notes || null,
        createdByUserId: req.user?.id || null
      });
    }
    const pending = await PayrollCompensationLevel.listPendingForAgency(agencyId);
    res.json({ pending, staged: changes.length });
  } catch (e) { next(e); }
};

/**
 * DELETE /payroll/pay-system/pending?agencyId=&userId=
 * Clear one pending row or all for the agency.
 */
export const clearPaySystemPending = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    await PayrollCompensationLevel.clearPending(agencyId, userId || null);
    const pending = await PayrollCompensationLevel.listPendingForAgency(agencyId);
    res.json({ pending, ok: true });
  } catch (e) { next(e); }
};

/**
 * POST /payroll/pay-system/go
 * body: { agencyId, effectiveStart: 'YYYY-MM-DD', waiveProbation?, enrollExistingWithoutPending? }
 * Applies pending level changes and activates new pay-system rates from the start date
 * (overrides compensation tables for periods ending on/after that date).
 */
export const goPaySystem = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const effectiveStart = String(req.body?.effectiveStart || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart)) {
      return res.status(400).json({ error: { message: 'effectiveStart (YYYY-MM-DD) is required' } });
    }

    await PayrollPaySystemRate.setAgencyEnabled(agencyId, true);
    const result = await PayrollCompensationLevel.applyGo(agencyId, {
      effectiveStart,
      waiveProbation: req.body?.waiveProbation !== false,
      enrollExistingWithoutPending: req.body?.enrollExistingWithoutPending !== false,
      appliedByUserId: req.user?.id || null
    });

    const [assignments, pending] = await Promise.all([
      PayrollCompensationLevel.listAssignmentsForAgency(agencyId),
      PayrollCompensationLevel.listPendingForAgency(agencyId)
    ]);

    res.json({
      ok: true,
      enabled: true,
      ...result,
      assignments,
      pending,
      message: `Pay system live from ${result.effectiveStart}. Applied ${result.appliedPending} staged level change(s); enrolled/updated ${result.enrolledExisting} assignment(s).`
    });
  } catch (e) {
    if (e?.message?.includes('effectiveStart')) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/** GET /payroll/pay-system/status?agencyId= */
export const getPaySystemStatus = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const enabled = await PayrollPaySystemRate.isAgencyEnabled(agencyId);
    res.json({ enabled, categories: COMPENSATION_CATEGORIES });
  } catch (e) { next(e); }
};

/**
 * PATCH /payroll/users/:userId/pay-system-flags
 * body: { agencyId, paySystemEnabled?, waiveProbation?, waiveMinimumWorkload?,
 *         probationStartOverride?, spanishBonusEligible?, locationBonusEligible? }
 */
export const updateUserPaySystemFlags = async (req, res, next) => {
  try {
    const agencyId = requireAgencyId(req, res);
    if (!agencyId) return;
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const existing = await PayrollCompensationLevel.getForUser(agencyId, userId);
    if (!existing) {
      return res.status(400).json({
        error: { message: 'Assign a compensation category/level before setting pay-system flags.' }
      });
    }

    const body = req.body || {};
    await PayrollCompensationLevel.updatePaySystemFlags(agencyId, userId, {
      paySystemEnabled: body.paySystemEnabled !== undefined ? !!body.paySystemEnabled : undefined,
      waiveProbation: body.waiveProbation !== undefined ? !!body.waiveProbation : undefined,
      waiveMinimumWorkload: body.waiveMinimumWorkload !== undefined ? !!body.waiveMinimumWorkload : undefined,
      probationStartOverride: body.probationStartOverride !== undefined
        ? (body.probationStartOverride || null)
        : undefined,
      probationEndedOn: body.probationEndedOn !== undefined
        ? (body.probationEndedOn || null)
        : (body.waiveProbation === true
          ? (existing.probation_ended_on
            ? String(existing.probation_ended_on).slice(0, 10)
            : (Number(existing.waive_probation) === 1
              ? undefined
              : new Date().toISOString().slice(0, 10)))
          : (body.waiveProbation === false ? null : undefined)),
      spanishBonusEligible: body.spanishBonusEligible !== undefined ? !!body.spanishBonusEligible : undefined,
      locationBonusEligible: body.locationBonusEligible !== undefined ? !!body.locationBonusEligible : undefined,
      paySystemEffectiveStart: body.paySystemEffectiveStart !== undefined
        ? (body.paySystemEffectiveStart || null)
        : undefined
    });

    const assignment = await PayrollCompensationLevel.getForUser(agencyId, userId);
    res.json({ assignment });
  } catch (e) { next(e); }
};

/** GET /payroll/pay-system/my-rates — self-serve calculator context */
export const getMyPaySystemRates = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    // Resolve agency from query or user's primary agency
    let agencyId = parseInt(req.query.agencyId || '', 10) || null;
    if (!agencyId) {
      const [rows] = await pool.execute(
        `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY agency_id ASC LIMIT 1`,
        [userId]
      );
      agencyId = rows?.[0]?.agency_id ? Number(rows[0].agency_id) : null;
    }
    if (!agencyId) {
      return res.json({ enabled: false, reason: 'no_agency' });
    }

    const agencyEnabled = await PayrollPaySystemRate.isAgencyEnabled(agencyId);
    const assignment = await PayrollCompensationLevel.getForUser(agencyId, userId);

    // Tier thresholds for calculator UI
    let thresholds = { tier1MinWeekly: 6, tier2MinWeekly: 13, tier3MinWeekly: 25 };
    try {
      const [arows] = await pool.execute(
        `SELECT tier_thresholds_json FROM agencies WHERE id = ? LIMIT 1`,
        [agencyId]
      );
      const raw = arows?.[0]?.tier_thresholds_json;
      if (raw) {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (obj && typeof obj === 'object') {
          thresholds = {
            tier1MinWeekly: Number(obj.tier1MinWeekly ?? 6),
            tier2MinWeekly: Number(obj.tier2MinWeekly ?? 13),
            tier3MinWeekly: Number(obj.tier3MinWeekly ?? 25)
          };
        }
      }
    } catch { /* keep defaults */ }

    // Biweekly thresholds (weekly * 2) for the calculator's period view
    const biweeklyThresholds = {
      tier1Min: thresholds.tier1MinWeekly * 2,
      tier2Min: thresholds.tier2MinWeekly * 2,
      tier3Min: thresholds.tier3MinWeekly * 2
    };

    // Calculator is available whenever agency rates exist, even before enrollment.
    // Staff without a category/level can still use the what-if calculator.
    const catalog = await loadCalculatorCatalog(agencyId);
    const hasAnyRates = (catalog.rates || []).some((r) =>
      Number(r.creditRate || 0) > 0 || Number(r.hcodeRate || 0) > 0 || Number(r.indirectRate || 0) > 0
    );

    if (!assignment?.category || !assignment?.level) {
      return res.json({
        enabled: false,
        agencyEnabled,
        userEnabled: Number(assignment?.pay_system_enabled || 0) === 1,
        assignment: assignment || null,
        rateProfile: null,
        thresholds,
        biweeklyThresholds,
        categories: COMPENSATION_CATEGORIES,
        calculatorAvailable: hasAnyRates,
        reason: 'no_assignment',
        ...catalog
      });
    }

    const rateProfile = await PayrollPaySystemRate.get(agencyId, assignment.category, assignment.level);
    let providerStartDate = null;
    try {
      const [urows] = await pool.execute(
        `SELECT provider_start_date, hired_at, languages_spoken FROM users WHERE id = ? LIMIT 1`,
        [userId]
      );
      providerStartDate = urows?.[0]?.provider_start_date || urows?.[0]?.hired_at || null;
      if (!Number(assignment.spanish_bonus_eligible) && urows?.[0]?.languages_spoken) {
        const lang = String(urows[0].languages_spoken).toLowerCase();
        if (/\bspanish\b|\bespañol\b|\bespanol\b/.test(lang)) {
          assignment.spanish_bonus_eligible = 1;
        }
      }
    } catch { /* ignore */ }

    // For the calculator, use "today" as period end and assume proposed tier (client overrides).
    const today = new Date().toISOString().slice(0, 10);
    const status = resolveUserPaySystemStatus({
      assignment,
      providerStartDate,
      periodEnd: today,
      benefitTierLevel: 0,
      graceActive: false
    });

    res.json({
      // UI calculator available when rates exist; live pay still gated by enrollment flags.
      calculatorAvailable: !!rateProfile || hasAnyRates,
      enabled: agencyEnabled && Number(assignment.pay_system_enabled || 0) === 1 && !!rateProfile,
      agencyEnabled,
      userEnabled: Number(assignment.pay_system_enabled || 0) === 1,
      assignment,
      rateProfile,
      status,
      thresholds,
      biweeklyThresholds,
      categories: COMPENSATION_CATEGORIES,
      ...catalog
    });
  } catch (e) { next(e); }
};

/**
 * POST /payroll/pay-system/estimate
 * body: { agencyId?, tier, lines: [{ code|serviceCode, quantity }], assumeSpanish? }
 */
export const estimatePaySystem = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    let agencyId = parseInt(req.body?.agencyId || req.query.agencyId || '', 10) || null;
    if (!agencyId) {
      const [rows] = await pool.execute(
        `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY agency_id ASC LIMIT 1`,
        [userId]
      );
      agencyId = rows?.[0]?.agency_id ? Number(rows[0].agency_id) : null;
    }
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const proposedTier = Math.max(0, Math.min(3, parseInt(req.body?.tier, 10) || 0));
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    const ctx = await loadUserPaySystemContext({
      agencyId,
      userId,
      periodEnd: new Date().toISOString().slice(0, 10),
      benefitTierLevel: proposedTier,
      graceActive: false,
      displayTierLevel: proposedTier
    });

    // Calculator can still estimate if rates exist even before enrollment,
    // as long as the user has a category/level and rates are configured.
    let rateProfile = ctx.rateProfile || null;
    let assignment = ctx.assignment || null;
    if (!rateProfile) {
      assignment = assignment || await PayrollCompensationLevel.getForUser(agencyId, userId);
      if (assignment?.category && assignment?.level) {
        rateProfile = await PayrollPaySystemRate.get(agencyId, assignment.category, assignment.level);
      }
    }
    if (!rateProfile) {
      return res.status(400).json({
        error: { message: 'No pay-system rates found for your category/level. Use the full calculator to pick a category and level.' }
      });
    }

    // Override status tier with the proposed calculator tier; keep probation from real status.
    const status = {
      ...(ctx.status || resolveUserPaySystemStatus({
        assignment,
        providerStartDate: ctx.providerStartDate,
        periodEnd: new Date().toISOString().slice(0, 10),
        benefitTierLevel: proposedTier
      })),
      tierLevel: proposedTier,
      currentTierLevel: proposedTier,
      // Calculator: MWR only if they propose below Tier 1 and aren't waived
      isMinimumWorkload: !(assignment && Number(assignment.waive_minimum_workload) === 1) && proposedTier < 1,
      useReducedRates: false
    };
    // Recompute useReducedRates with proposed tier
    status.useReducedRates = !!(status.inProbation || status.isMinimumWorkload);

    if (req.body?.assumeSpanish === true || req.body?.spanishBonusEligible === true) {
      status.spanishBonusEligible = true;
    } else if (req.body?.assumeSpanish === false || req.body?.spanishBonusEligible === false) {
      status.spanishBonusEligible = false;
    }
    if (req.body?.assumeDenver === true || req.body?.locationBonusEligible === true) {
      status.locationBonusEligible = true;
    } else if (req.body?.assumeDenver === false || req.body?.locationBonusEligible === false) {
      status.locationBonusEligible = false;
    }

    const catalog = await loadCalculatorCatalog(agencyId);
    const rulesByCode = new Map(
      (catalog.serviceCodes || []).map((r) => [String(r.serviceCode || '').trim().toUpperCase(), r])
    );

    const result = estimatePay({
      rateProfile,
      status,
      lines: normalizeEstimateLines(lines, catalog.eventTypes),
      rulesByCode
    });

    res.json({
      ok: true,
      proposedTier,
      mode: 'personal',
      rateProfile: {
        category: rateProfile.category,
        level: rateProfile.level,
        creditRate: rateProfile.creditRate,
        creditRateProbation: rateProfile.creditRateProbation,
        hcodeRate: rateProfile.hcodeRate,
        hcodeRateProbation: rateProfile.hcodeRateProbation,
        indirectRate: rateProfile.indirectRate,
        supportActivityRate: rateProfile.supportActivityRate,
        autoIndirectMinutesPerHour: rateProfile.autoIndirectMinutesPerHour,
        tierBonus: rateProfile.tierBonus,
        spanishBonus: rateProfile.spanishBonus,
        locationBonus: rateProfile.locationBonus
      },
      ...result
    });
  } catch (e) { next(e); }
};

/**
 * POST /payroll/pay-system/estimate-scenario
 * What-if calculator: pick category, level, tier, Denver, Spanish.
 * Staff and admins can use published rates. Optional rateProfile overlay is for admins
 * previewing unsaved Pay System Rates edits.
 */
export const estimatePaySystemScenario = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const agencyId = parseInt(req.body?.agencyId || req.query.agencyId || '', 10) || null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const category = parseInt(req.body?.category, 10);
    const level = parseInt(req.body?.level, 10);
    if (!CATEGORY_IDS.includes(category) || !LEVEL_IDS.includes(level)) {
      return res.status(400).json({ error: { message: 'category and level are required' } });
    }

    const proposedTier = Math.max(0, Math.min(3, parseInt(req.body?.tier, 10) || 0));
    const catalog = await loadCalculatorCatalog(agencyId);
    let rateProfile = (catalog.rates || []).find((r) => Number(r.category) === category && Number(r.level) === level)
      || await PayrollPaySystemRate.get(agencyId, category, level);

    const overlay = req.body?.rateProfile;
    if (overlay && typeof overlay === 'object') {
      rateProfile = {
        ...(rateProfile || {}),
        category,
        level,
        creditRate: overlay.creditRate ?? rateProfile?.creditRate,
        creditRateProbation: overlay.creditRateProbation ?? rateProfile?.creditRateProbation,
        hcodeRate: overlay.hcodeRate ?? rateProfile?.hcodeRate,
        hcodeRateProbation: overlay.hcodeRateProbation ?? rateProfile?.hcodeRateProbation,
        indirectRate: overlay.indirectRate ?? rateProfile?.indirectRate,
        supportActivityRate: overlay.supportActivityRate ?? rateProfile?.supportActivityRate,
        autoIndirectMinutesPerHour: overlay.autoIndirectMinutesPerHour ?? rateProfile?.autoIndirectMinutesPerHour ?? 10,
        tierBonus: overlay.tierBonus || rateProfile?.tierBonus,
        spanishBonus: overlay.spanishBonus || rateProfile?.spanishBonus,
        locationBonus: overlay.locationBonus || rateProfile?.locationBonus
      };
    }

    if (!rateProfile) {
      return res.status(400).json({ error: { message: 'No pay-system rates found for that category/level.' } });
    }

    const status = {
      tierLevel: proposedTier,
      currentTierLevel: proposedTier,
      inProbation: false,
      isMinimumWorkload: proposedTier < 1 && req.body?.waiveMinimumWorkload !== true,
      useReducedRates: proposedTier < 1 && req.body?.waiveMinimumWorkload !== true,
      spanishBonusEligible: req.body?.spanishBonusEligible === true || req.body?.assumeSpanish === true,
      locationBonusEligible: req.body?.locationBonusEligible === true || req.body?.assumeDenver === true
    };
    status.useReducedRates = !!(status.inProbation || status.isMinimumWorkload);

    const rulesByCode = new Map(
      (catalog.serviceCodes || []).map((r) => [String(r.serviceCode || '').trim().toUpperCase(), r])
    );
    const result = estimatePay({
      rateProfile,
      status,
      lines: normalizeEstimateLines(req.body?.lines, catalog.eventTypes),
      rulesByCode
    });

    res.json({
      ok: true,
      proposedTier,
      mode: 'scenario',
      category,
      level,
      rateProfile: {
        category: rateProfile.category,
        level: rateProfile.level,
        creditRate: rateProfile.creditRate,
        creditRateProbation: rateProfile.creditRateProbation,
        hcodeRate: rateProfile.hcodeRate,
        hcodeRateProbation: rateProfile.hcodeRateProbation,
        indirectRate: rateProfile.indirectRate,
        supportActivityRate: rateProfile.supportActivityRate,
        autoIndirectMinutesPerHour: rateProfile.autoIndirectMinutesPerHour,
        tierBonus: rateProfile.tierBonus,
        spanishBonus: rateProfile.spanishBonus,
        locationBonus: rateProfile.locationBonus
      },
      ...result
    });
  } catch (e) { next(e); }
};

/** Helper used by listServiceCodeRules enrichment (optional export). */
export { enrichRuleWithPayType, classifyPayType };
