import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';

const DEFAULT_PERCENTAGE_PAY_POLICY = {
  defaultPercent: 0
};

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
}

export function normalizePayPercent(v, fallback = DEFAULT_PERCENTAGE_PAY_POLICY.defaultPercent) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.max(0, Math.min(100, n));
  return Math.round(clamped * 100) / 100;
}

export function isPercentOfChargePayEnabled(featureFlagsRaw) {
  const flags = parseFeatureFlags(featureFlagsRaw);
  const v = flags.percentOfChargePayEnabled;
  return v === true || v === 1 || String(v).trim().toLowerCase() === '1' || String(v).trim().toLowerCase() === 'true';
}

export async function getAgencyPercentagePayPolicy({ agencyId }) {
  const agency = await Agency.findById(agencyId);
  const parsed = parseJson(agency?.percentage_pay_policy_json) || {};
  const defaultPercent = normalizePayPercent(
    parsed.defaultPercent ?? parsed.default_percent ?? parsed.percent ?? DEFAULT_PERCENTAGE_PAY_POLICY.defaultPercent
  );
  const enabled = isPercentOfChargePayEnabled(agency?.feature_flags);
  return {
    enabled,
    policy: { defaultPercent }
  };
}

export async function upsertAgencyPercentagePayPolicy({ agencyId, policy }) {
  const raw = policy && typeof policy === 'object' ? policy : {};
  const next = {
    defaultPercent: normalizePayPercent(raw.defaultPercent ?? raw.default_percent ?? raw.percent)
  };

  await pool.execute(
    `UPDATE agencies
     SET percentage_pay_policy_json = ?
     WHERE id = ?
     LIMIT 1`,
    [JSON.stringify(next), agencyId]
  );

  return getAgencyPercentagePayPolicy({ agencyId });
}

export function resolvePercentOfChargePay({ policy, rule, perCodeRate, userPercentPayEnabled = false }) {
  // An explicit employee/code agreement takes priority; it never changes agency-wide methods.
  if (['percent_collected','percent_billed'].includes(perCodeRate?.pay_method)) {
    const raw = perCodeRate.pay_percent;
    const percent = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Percentage pay requires an explicit percentage between 0 and 100.');
    return { usesPercentPay: true, percent, basis: perCodeRate.pay_method === 'percent_billed' ? 'billed' : 'collected' };
  }
  if (perCodeRate?.pay_method === 'fixed_rate') return { usesPercentPay: false, percent: null };
  if (!policy?.enabled) {
    return { usesPercentPay: false, percent: null };
  }

  const method = String(rule?.pay_method || 'fixed_rate').trim().toLowerCase();
  if (method !== 'percent_of_charge') {
    return { usesPercentPay: false, percent: null };
  }

  // Service code is percent-of-charge, but only employees with the rate-card toggle
  // use percent pay; everyone else on this code falls back to fixed $ rates.
  const userEnabled = userPercentPayEnabled === true
    || userPercentPayEnabled === 1
    || String(userPercentPayEnabled || '').trim().toLowerCase() === '1'
    || String(userPercentPayEnabled || '').trim().toLowerCase() === 'true';
  if (!userEnabled) {
    return { usesPercentPay: false, percent: null };
  }

  let percent = perCodeRate?.pay_percent;
  if (percent === null || percent === undefined || percent === '') {
    percent = rule?.pay_percent;
  }
  if (percent === null || percent === undefined || percent === '') {
    percent = policy?.policy?.defaultPercent ?? policy?.defaultPercent ?? 0;
  }

  return {
    usesPercentPay: true,
    percent: normalizePayPercent(percent, 0)
  };
}

export function collectedRevenuePay(amountCollected, percent) {
  const amount = Number(amountCollected);
  // Missing collections do not fall back to hourly or billed revenue pay.
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * percent) / 100 : 0;
}
