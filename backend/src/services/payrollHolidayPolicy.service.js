import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';

const DEFAULT_HOLIDAY_PAY_POLICY = {
  percentage: 0,
  notifyMissingApproval: false,
  notifyStrictMessage: false
};

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function normalizePercentage(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_HOLIDAY_PAY_POLICY.percentage;
  const clamped = Math.max(0, Math.min(100, n));
  return Math.round(clamped * 100) / 100; // keep 2 decimals
}

function normalizeBool(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

export async function getAgencyHolidayPayPolicy({ agencyId }) {
  const agency = await Agency.findById(agencyId);
  const parsed = parseJson(agency?.holiday_pay_policy_json) || {};

  const percentage = normalizePercentage(
    parsed.percentage ?? parsed.percent ?? parsed.holidayBonusPercent ?? DEFAULT_HOLIDAY_PAY_POLICY.percentage
  );
  const notifyMissingApproval = normalizeBool(
    parsed.notifyMissingApproval ?? parsed.notify_missing_approval,
    DEFAULT_HOLIDAY_PAY_POLICY.notifyMissingApproval
  );
  const notifyStrictMessage = normalizeBool(
    parsed.notifyStrictMessage ?? parsed.notify_strict_message,
    DEFAULT_HOLIDAY_PAY_POLICY.notifyStrictMessage
  );

  const policy = { percentage, notifyMissingApproval, notifyStrictMessage };
  return { policy };
}

export async function upsertAgencyHolidayPayPolicy({ agencyId, policy }) {
  const raw = policy && typeof policy === 'object' ? policy : {};
  const next = {
    percentage: normalizePercentage(raw.percentage ?? raw.percent),
    notifyMissingApproval: normalizeBool(raw.notifyMissingApproval ?? raw.notify_missing_approval, DEFAULT_HOLIDAY_PAY_POLICY.notifyMissingApproval),
    notifyStrictMessage: normalizeBool(raw.notifyStrictMessage ?? raw.notify_strict_message, DEFAULT_HOLIDAY_PAY_POLICY.notifyStrictMessage)
  };

  await pool.execute(
    `UPDATE agencies
     SET holiday_pay_policy_json = ?
     WHERE id = ?
     LIMIT 1`,
    [JSON.stringify(next), agencyId]
  );

  return getAgencyHolidayPayPolicy({ agencyId });
}

