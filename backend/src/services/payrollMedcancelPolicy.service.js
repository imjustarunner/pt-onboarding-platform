import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';

const DEFAULT_MEDCANCEL_POLICY = {
  displayName: 'Med Cancel',
  serviceCode: 'MEDCANCEL',
  schedules: {
    low: { '90832': 5, '90834': 7.5, '90837': 10 },
    high: { '90832': 10, '90834': 15, '90837': 20 }
  }
};

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function normalizeServiceCode(v) {
  const s = String(v || '').trim().toUpperCase();
  return s || DEFAULT_MEDCANCEL_POLICY.serviceCode;
}

function normalizeDisplayName(v) {
  const s = String(v || '').trim();
  // Keep this conservative for UI use (not for filenames/URLs).
  const out = s.slice(0, 48);
  return out || DEFAULT_MEDCANCEL_POLICY.displayName;
}

function normalizeRateMap(mapLike) {
  const raw = mapLike && typeof mapLike === 'object' ? mapLike : {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const code = String(k || '').trim();
    if (!code) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    out[code] = Math.round(n * 10000) / 10000;
  }
  return out;
}

export async function getAgencyMedcancelPolicy({ agencyId }) {
  const agency = await Agency.findById(agencyId);
  const parsed = parseJson(agency?.medcancel_policy_json) || {};

  const next = {
    displayName: normalizeDisplayName(parsed.displayName ?? parsed.display_name ?? DEFAULT_MEDCANCEL_POLICY.displayName),
    serviceCode: normalizeServiceCode(parsed.serviceCode ?? parsed.service_code ?? DEFAULT_MEDCANCEL_POLICY.serviceCode),
    schedules: {
      low: {
        ...DEFAULT_MEDCANCEL_POLICY.schedules.low,
        ...normalizeRateMap(parsed?.schedules?.low || parsed?.lowRates || parsed?.low_rates)
      },
      high: {
        ...DEFAULT_MEDCANCEL_POLICY.schedules.high,
        ...normalizeRateMap(parsed?.schedules?.high || parsed?.highRates || parsed?.high_rates)
      }
    }
  };

  return { policy: next };
}

export async function upsertAgencyMedcancelPolicy({ agencyId, policy }) {
  // Backward compatible payload shapes.
  const raw = policy && typeof policy === 'object' ? policy : {};
  const displayName = normalizeDisplayName(raw.displayName ?? raw.display_name);
  const serviceCode = normalizeServiceCode(raw.serviceCode ?? raw.service_code);
  const schedulesRaw = raw.schedules && typeof raw.schedules === 'object' ? raw.schedules : {};
  const next = {
    displayName,
    serviceCode,
    schedules: {
      low: normalizeRateMap(schedulesRaw.low ?? raw.lowRates ?? raw.low_rates),
      high: normalizeRateMap(schedulesRaw.high ?? raw.highRates ?? raw.high_rates)
    }
  };

  await pool.execute(
    `UPDATE agencies
     SET medcancel_policy_json = ?
     WHERE id = ?
     LIMIT 1`,
    [JSON.stringify(next), agencyId]
  );

  return getAgencyMedcancelPolicy({ agencyId });
}

