import pool from '../config/database.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';
import PayrollHolidayBonusClaim from '../models/PayrollHolidayBonusClaim.model.js';
import { payrollDefaultsForCode } from './payrollServiceCodeDefaults.js';
import { getAgencyHolidayPayPolicy } from './payrollHolidayPolicy.service.js';

function codeKey(v) {
  return String(v || '').trim().toUpperCase();
}

function baseBucketFromCategory(category) {
  const c = String(category || 'direct').trim().toLowerCase();
  return (c === 'indirect' || c === 'admin' || c === 'meeting') ? 'indirect'
    : (c === 'other' || c === 'tutoring') ? 'other'
      : (c === 'mileage' || c === 'bonus' || c === 'reimbursement' || c === 'other_pay') ? 'flat'
        : 'direct';
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function latestImportIdForPeriod(payrollPeriodId) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM payroll_imports
     WHERE payroll_period_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [payrollPeriodId]
  );
  return rows?.[0]?.id || null;
}

async function listHolidayPayableAggregates({ agencyId, payrollPeriodId, payrollImportId }) {
  // Payable = FINALIZED or DRAFT marked payable
  const [rows] = await pool.execute(
    `SELECT
       pir.user_id AS user_id,
       pir.service_code AS service_code,
       SUM(COALESCE(pir.unit_count, 0)) AS units_total,
       GROUP_CONCAT(DISTINCT DATE_FORMAT(pir.service_date, '%Y-%m-%d') ORDER BY pir.service_date ASC SEPARATOR ',') AS holiday_dates_csv
     FROM payroll_import_rows pir
     JOIN agency_holidays ah
       ON ah.agency_id = ?
      AND ah.holiday_date = pir.service_date
     WHERE pir.agency_id = ?
       AND pir.payroll_period_id = ?
       AND pir.payroll_import_id = ?
       AND pir.user_id IS NOT NULL
       AND (
         pir.note_status = 'FINALIZED'
         OR (pir.note_status = 'DRAFT' AND pir.draft_payable = 1)
       )
     GROUP BY pir.user_id, pir.service_code
     ORDER BY pir.user_id ASC, pir.service_code ASC`,
    [agencyId, agencyId, payrollPeriodId, payrollImportId]
  );
  return rows || [];
}

async function computeHolidayBaseServicePayForUser({
  agencyId,
  userId,
  periodStart,
  ruleByCode,
  unitsByCode
}) {
  const rateCard = await PayrollRateCard.findForUser(agencyId, userId);
  const userPerCodeRates = await PayrollRate.listForUser(agencyId, userId);
  const ratesByCode = new Map();
  for (const rr of userPerCodeRates || []) {
    const k = codeKey(rr.service_code);
    if (!k) continue;
    if (!ratesByCode.has(k)) ratesByCode.set(k, []);
    ratesByCode.get(k).push(rr);
  }
  const bestPerCodeRate = (k) => {
    const arr = ratesByCode.get(k) || [];
    for (const r of arr) {
      if (periodStart) {
        const start = r.effective_start ? String(r.effective_start).slice(0, 10) : null;
        const end = r.effective_end ? String(r.effective_end).slice(0, 10) : null;
        const ps = String(periodStart).slice(0, 10);
        if (start && start > ps) continue;
        if (end && end < ps) continue;
      }
      return r;
    }
    return null;
  };

  let baseAmount = 0;
  for (const [rawCode, rawUnits] of unitsByCode.entries()) {
    const k = codeKey(rawCode);
    const units = safeNumber(rawUnits, 0);
    if (!k || units <= 1e-9) continue;

    const rule = ruleByCode.get(k) || null;
    const defaults = payrollDefaultsForCode(k);
    const category = String(rule?.category ?? defaults?.category ?? 'direct').trim().toLowerCase();
    const baseBucket = baseBucketFromCategory(category);
    if (baseBucket === 'flat') continue; // holiday bonus base is service pay, not flat categories

    const payDivisorRaw = (rule?.pay_divisor === null || rule?.pay_divisor === undefined)
      ? (defaults?.payDivisor ?? 1)
      : rule.pay_divisor;
    const d = safeNumber(payDivisorRaw, 1);
    const safeDivisor = (!Number.isFinite(d) || d <= 0) ? 1 : d;
    const payHours = units / safeDivisor;

    // Rate resolution
    const perCode = bestPerCodeRate(k);
    const rulePayUnitRaw = String(rule?.pay_rate_unit || '').trim().toLowerCase();
    const rulePayUnit = (rulePayUnitRaw === 'per_hour') ? 'per_hour' : 'per_unit';
    const legacyPerCodeUnit = perCode ? String(perCode.rate_unit || 'per_unit').trim().toLowerCase() : null;
    const perCodePayUnit =
      rulePayUnitRaw
        ? rulePayUnit
        : (legacyPerCodeUnit === 'per_hour' ? 'per_hour' : 'per_unit');

    let rateAmount = 0;
    if (perCode) {
      rateAmount = safeNumber(perCode.rate_amount, 0);
      baseAmount += (perCodePayUnit === 'per_hour') ? (payHours * rateAmount) : (units * rateAmount);
      continue;
    }

    // Rate card fallback (hourly) for non-flat buckets
    if (rateCard) {
      if (baseBucket === 'indirect') rateAmount = safeNumber(rateCard.indirect_rate, 0);
      else if (baseBucket === 'other') rateAmount = safeNumber(rateCard.other_rate_1, 0);
      else rateAmount = safeNumber(rateCard.direct_rate, 0);
      baseAmount += payHours * rateAmount;
    }
  }

  return Math.round(baseAmount * 100) / 100;
}

export async function syncHolidayBonusClaimsForPeriod({ agencyId, payrollPeriodId, periodStart }) {
  // If tables aren't present yet (local dev without migrations), do nothing gracefully.
  try {
    const { policy } = await getAgencyHolidayPayPolicy({ agencyId });
    const pct = safeNumber(policy?.percentage, 0);
    if (!(pct > 1e-9)) {
      await PayrollHolidayBonusClaim.deleteAllSubmittedForPeriod({ agencyId, payrollPeriodId });
      return { ok: true, computed: 0 };
    }

    const payrollImportId = await latestImportIdForPeriod(payrollPeriodId);
    if (!payrollImportId) {
      await PayrollHolidayBonusClaim.deleteAllSubmittedForPeriod({ agencyId, payrollPeriodId });
      return { ok: true, computed: 0 };
    }

    const rows = await listHolidayPayableAggregates({ agencyId, payrollPeriodId, payrollImportId });
    if (!rows.length) {
      await PayrollHolidayBonusClaim.deleteAllSubmittedForPeriod({ agencyId, payrollPeriodId });
      return { ok: true, computed: 0 };
    }

    const rules = await PayrollServiceCodeRule.listForAgency(agencyId);
    const ruleByCode = new Map((rules || []).map((r) => [codeKey(r.service_code), r]));

    // Group by user
    const unitsByUser = new Map(); // userId -> Map(code -> units)
    const datesByUser = new Map(); // userId -> Set(ymd)
    for (const r of rows) {
      const uid = Number(r.user_id || 0);
      if (!uid) continue;
      const sc = codeKey(r.service_code);
      const units = safeNumber(r.units_total, 0);
      if (!sc || units <= 1e-9) continue;
      if (!unitsByUser.has(uid)) unitsByUser.set(uid, new Map());
      unitsByUser.get(uid).set(sc, (unitsByUser.get(uid).get(sc) || 0) + units);
      const csv = String(r.holiday_dates_csv || '').trim();
      if (csv) {
        if (!datesByUser.has(uid)) datesByUser.set(uid, new Set());
        for (const part of csv.split(',')) {
          const ymd = String(part || '').trim().slice(0, 10);
          if (/^\\d{4}-\\d{2}-\\d{2}$/.test(ymd)) datesByUser.get(uid).add(ymd);
        }
      }
    }

    const userIds = Array.from(unitsByUser.keys());
    if (!userIds.length) {
      await PayrollHolidayBonusClaim.deleteAllSubmittedForPeriod({ agencyId, payrollPeriodId });
      return { ok: true, computed: 0 };
    }

    const keptUserIds = [];
    let computed = 0;
    for (const uid of userIds) {
      const base = await computeHolidayBaseServicePayForUser({
        agencyId,
        userId: uid,
        periodStart,
        ruleByCode,
        unitsByCode: unitsByUser.get(uid)
      });
      const bonus = Math.round((base * (pct / 100)) * 100) / 100;
      const holidayDates = Array.from(datesByUser.get(uid) || []).sort();

      if (!(bonus > 1e-9)) {
        await PayrollHolidayBonusClaim.deleteSubmittedForPeriodUser({ agencyId, userId: uid, payrollPeriodId });
        continue;
      }

      await PayrollHolidayBonusClaim.upsertSubmittedComputed({
        agencyId,
        userId: uid,
        payrollPeriodId,
        holidayBonusPercent: pct,
        baseServicePayAmount: base,
        appliedAmount: bonus,
        holidayDatesJson: holidayDates
      });
      keptUserIds.push(uid);
      computed += 1;
    }

    // Remove any now-stale submitted claims for users not present in current computation.
    try {
      if (keptUserIds.length) {
        const placeholders = keptUserIds.map(() => '?').join(',');
        await pool.execute(
          `DELETE FROM payroll_holiday_bonus_claims
           WHERE agency_id = ?
             AND payroll_period_id = ?
             AND status = 'submitted'
             AND user_id NOT IN (${placeholders})`,
          [agencyId, payrollPeriodId, ...keptUserIds]
        );
      } else {
        await PayrollHolidayBonusClaim.deleteAllSubmittedForPeriod({ agencyId, payrollPeriodId });
      }
    } catch { /* best-effort */ }

    return { ok: true, computed };
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: true, computed: 0, skipped: true };
    throw e;
  }
}

