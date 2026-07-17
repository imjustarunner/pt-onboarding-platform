/** School mileage: policy is % of $0.70/mile by tier. */
export const SCHOOL_MILEAGE_BASE_RATE = 0.7;
export const SCHOOL_MILEAGE_TIER_RATES = {
  1: 0,
  2: SCHOOL_MILEAGE_BASE_RATE * 0.5, // $0.35
  3: SCHOOL_MILEAGE_BASE_RATE // $0.70
};

/** Health employer share of employee plan premium by tier. */
export const HEALTH_EMPLOYER_SHARE_BY_TIER = {
  1: 0,
  2: 0.25,
  3: 0.5
};

/** Assumed biweekly pay periods per year for employer contribution estimates. */
export const PAY_PERIODS_PER_YEAR = 26;

export function parseBenefitsEnrollment(raw) {
  if (!raw) return emptyEnrollment();
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return emptyEnrollment();
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return emptyEnrollment();
  const health = obj.health_insurance && typeof obj.health_insurance === 'object'
    ? obj.health_insurance
    : {};
  const k401 = obj['401k'] && typeof obj['401k'] === 'object' ? obj['401k'] : {};
  const schoolMileage = obj.school_mileage && typeof obj.school_mileage === 'object'
    ? obj.school_mileage
    : {};
  return {
    health_insurance: {
      enrolled: !!health.enrolled,
      premiumMonthly: Number.isFinite(Number(health.premiumMonthly))
        ? Number(health.premiumMonthly)
        : (Number.isFinite(Number(health.premium)) ? Number(health.premium) : null),
      enrolledAt: health.enrolledAt ? String(health.enrolledAt) : null
    },
    '401k': {
      enrolled: !!k401.enrolled,
      enrolledAt: k401.enrolledAt ? String(k401.enrolledAt) : null
    },
    school_mileage: {
      // Contract flag — only employees with school mileage in their contract
      inContract: schoolMileage.inContract === true || schoolMileage.eligible === true
    },
    healthEmployerContributionYtd: Number.isFinite(Number(obj.healthEmployerContributionYtd))
      ? Number(obj.healthEmployerContributionYtd)
      : null
  };
}

export function emptyEnrollment() {
  return {
    health_insurance: { enrolled: false, premiumMonthly: null, enrolledAt: null },
    '401k': { enrolled: false, enrolledAt: null },
    school_mileage: { inContract: false },
    healthEmployerContributionYtd: null
  };
}

export function healthEmployerSharePct(tierLevel) {
  const n = Number(tierLevel) || 0;
  return HEALTH_EMPLOYER_SHARE_BY_TIER[n] ?? 0;
}

/** Monthly employer contribution = premium × share%. */
export function healthEmployerMonthly(premiumMonthly, tierLevel) {
  const premium = Number(premiumMonthly);
  if (!Number.isFinite(premium) || premium < 0) return null;
  const pct = healthEmployerSharePct(tierLevel);
  if (!(pct > 0)) return 0;
  return Math.round(premium * pct * 100) / 100;
}

/** Per pay period (biweekly) employer contribution from monthly premium. */
export function healthEmployerPerPayPeriod(premiumMonthly, tierLevel) {
  const monthly = healthEmployerMonthly(premiumMonthly, tierLevel);
  if (monthly == null) return null;
  return Math.round(((monthly * 12) / PAY_PERIODS_PER_YEAR) * 100) / 100;
}

/**
 * Estimated YTD employer contribution from enrolled date (or year start) through today.
 * Uses biweekly periods.
 */
export function estimateHealthEmployerYtd(premiumMonthly, tierLevel, enrolledAtIso) {
  const perPeriod = healthEmployerPerPayPeriod(premiumMonthly, tierLevel);
  if (perPeriod == null || !(perPeriod > 0)) return 0;
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  let start = yearStart;
  if (enrolledAtIso) {
    const enrolled = new Date(enrolledAtIso);
    if (!Number.isNaN(enrolled.getTime()) && enrolled > yearStart) start = enrolled;
  }
  if (start > now) return 0;
  const ms = now.getTime() - start.getTime();
  const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  const periods = Math.max(1, Math.floor(days / 14) + 1);
  return Math.round(perPeriod * periods * 100) / 100;
}

export function schoolMileageRateForTier(tierLevel) {
  const n = Number(tierLevel) || 0;
  if (SCHOOL_MILEAGE_TIER_RATES[n] != null) return SCHOOL_MILEAGE_TIER_RATES[n];
  return null;
}
