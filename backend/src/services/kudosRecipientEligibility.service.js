import pool from '../config/database.js';

const DEFAULT_TIER_THRESHOLDS = {
  tier1MinWeekly: 6,
  tier2MinWeekly: 13,
  tier3MinWeekly: 25
};

function normalizeTierThresholds(raw) {
  let obj = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  const t1 = Number(obj?.tier1MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier1MinWeekly);
  const t2 = Number(obj?.tier2MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier2MinWeekly);
  const t3 = Number(obj?.tier3MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier3MinWeekly);
  if (![t1, t2, t3].every((n) => Number.isFinite(n) && n >= 0)) {
    return { ...DEFAULT_TIER_THRESHOLDS };
  }
  const a = Math.min(t1, t2, t3);
  const b = Math.max(a, Math.min(t2, t3));
  const c = Math.max(b, t3);
  return { tier1MinWeekly: a, tier2MinWeekly: b, tier3MinWeekly: c };
}

export function tierLevelFromWeeklyAvg(weeklyAvg, thresholds = DEFAULT_TIER_THRESHOLDS) {
  const w = Number(weeklyAvg || 0);
  if (!Number.isFinite(w) || w <= 0) return 0;
  const t1 = Number(thresholds?.tier1MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier1MinWeekly);
  const t2 = Number(thresholds?.tier2MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier2MinWeekly);
  const t3 = Number(thresholds?.tier3MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier3MinWeekly);
  if (w >= t3) return 3;
  if (w >= t2) return 2;
  if (w >= t1) return 1;
  return 0;
}

export async function loadAgencyTierThresholds(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return { ...DEFAULT_TIER_THRESHOLDS };
  const [rows] = await pool.execute(
    `SELECT tier_thresholds_json FROM agencies WHERE id = ? LIMIT 1`,
    [aid]
  );
  return normalizeTierThresholds(rows?.[0]?.tier_thresholds_json);
}

/**
 * Latest posted/finalized payroll period for an agency + newest import for that period.
 */
export async function resolveLatestPostedPayrollContext(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const [rows] = await pool.execute(
    `SELECT id AS payroll_period_id
     FROM payroll_periods
     WHERE agency_id = ?
       AND LOWER(COALESCE(status, '')) IN ('posted', 'finalized')
     ORDER BY period_start DESC
     LIMIT 1`,
    [aid]
  );
  const payrollPeriodId = rows?.[0]?.payroll_period_id;
  if (!payrollPeriodId) return null;
  const [impRows] = await pool.execute(
    `SELECT id FROM payroll_imports
     WHERE payroll_period_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [payrollPeriodId]
  );
  const payrollImportId = impRows?.[0]?.id != null ? Number(impRows[0].id) : null;
  return { payrollPeriodId: Number(payrollPeriodId), payrollImportId };
}

const REASON_MESSAGES = {
  no_payroll_period: 'There is no posted payroll period for this agency yet, so benefit tier and notes cannot be verified.',
  no_payroll_import: 'The latest posted period has no payroll import, so clinical notes cannot be verified.',
  no_payroll_summary: 'No payroll summary exists for this person on the latest posted period.',
  benefit_tier_below_2: 'Benefit tier is below Tier 2 for the latest posted pay period (rolling direct-credits average).',
  unpaid_notes: 'This person has unpaid or incomplete notes (NO_NOTE or non-payable DRAFT) in the latest payroll import.'
};

export function formatKudosIneligibleReason(code) {
  const key = String(code || '').trim();
  return REASON_MESSAGES[key] || key || 'Not eligible to receive kudos under current payroll rules.';
}

/**
 * Benefit Tier 2+ (agency-configured weekly thresholds) and no unpaid notes in latest import
 * for the latest posted period — same note definition as POST /kudos/notes-complete.
 */
export async function computeKudosRecipientEligibility({ agencyId, userIds }) {
  const thresholds = await loadAgencyTierThresholds(agencyId);
  const ctx = await resolveLatestPostedPayrollContext(agencyId);
  const ids = [...new Set((userIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
  const out = new Map();

  const baseIneligible = (uid, reason, extra = {}) => {
    out.set(uid, {
      eligible: false,
      reason,
      reasonMessage: formatKudosIneligibleReason(reason),
      benefitTierLevel: 0,
      unpaidNotesCount: 0,
      payrollPeriodId: ctx?.payrollPeriodId ?? null,
      ...extra
    });
  };

  for (const uid of ids) {
    baseIneligible(uid, 'no_payroll_period');
  }

  if (!ids.length) return out;

  if (!ctx?.payrollPeriodId) {
    return out;
  }

  if (!ctx.payrollImportId) {
    for (const uid of ids) {
      baseIneligible(uid, 'no_payroll_import', { payrollPeriodId: ctx.payrollPeriodId });
    }
    return out;
  }

  const placeholders = ids.map(() => '?').join(',');
  const [sumRows] = await pool.execute(
    `SELECT user_id, tier_credits_final, tier_credits_current
     FROM payroll_summaries
     WHERE agency_id = ?
       AND payroll_period_id = ?
       AND user_id IN (${placeholders})`,
    [Number(agencyId), ctx.payrollPeriodId, ...ids]
  );
  const summaryByUser = new Map((sumRows || []).map((r) => [Number(r.user_id), r]));

  const [unpaidRows] = await pool.execute(
    `SELECT user_id,
       SUM(
         CASE WHEN UPPER(TRIM(note_status)) = 'NO_NOTE' THEN 1 ELSE 0 END
         + CASE WHEN UPPER(TRIM(note_status)) = 'DRAFT' AND COALESCE(draft_payable, 1) = 0 THEN 1 ELSE 0 END
       ) AS unpaid_notes
     FROM payroll_import_rows
     WHERE payroll_period_id = ?
       AND payroll_import_id = ?
       AND agency_id = ?
       AND user_id IN (${placeholders})
       AND (
         UPPER(TRIM(note_status)) = 'NO_NOTE'
         OR (UPPER(TRIM(note_status)) = 'DRAFT' AND COALESCE(draft_payable, 1) = 0)
       )
     GROUP BY user_id`,
    [ctx.payrollPeriodId, ctx.payrollImportId, Number(agencyId), ...ids]
  );
  const unpaidByUser = new Map((unpaidRows || []).map((r) => [Number(r.user_id), Number(r.unpaid_notes || 0)]));

  for (const uid of ids) {
    const summary = summaryByUser.get(uid);
    if (!summary) {
      out.set(uid, {
        eligible: false,
        reason: 'no_payroll_summary',
        reasonMessage: formatKudosIneligibleReason('no_payroll_summary'),
        benefitTierLevel: 0,
        unpaidNotesCount: 0,
        payrollPeriodId: ctx.payrollPeriodId
      });
      continue;
    }
    const biWeekly =
      Number(summary.tier_credits_final ?? summary.tier_credits_current ?? 0) || 0;
    const weeklyAvg = biWeekly / 2;
    const benefitTierLevel = tierLevelFromWeeklyAvg(weeklyAvg, thresholds);
    const unpaidNotesCount = Number(unpaidByUser.get(uid) || 0);

    if (benefitTierLevel < 2) {
      out.set(uid, {
        eligible: false,
        reason: 'benefit_tier_below_2',
        reasonMessage: formatKudosIneligibleReason('benefit_tier_below_2'),
        benefitTierLevel,
        unpaidNotesCount,
        payrollPeriodId: ctx.payrollPeriodId
      });
      continue;
    }
    if (unpaidNotesCount > 0) {
      out.set(uid, {
        eligible: false,
        reason: 'unpaid_notes',
        reasonMessage: formatKudosIneligibleReason('unpaid_notes'),
        benefitTierLevel,
        unpaidNotesCount,
        payrollPeriodId: ctx.payrollPeriodId
      });
      continue;
    }
    out.set(uid, {
      eligible: true,
      reason: null,
      reasonMessage: null,
      benefitTierLevel,
      unpaidNotesCount: 0,
      payrollPeriodId: ctx.payrollPeriodId
    });
  }

  return out;
}
