import pool from '../config/database.js';

export function normalizeRenewalPolicy(agency = {}) {
  let flags = agency.feature_flags || {};
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { flags = {}; } }
  const saved = flags.treatmentPlanRenewal || {};
  const healthcare = ['agency', 'clinical'].includes(String(agency.organization_type || 'agency'));
  const days = Number(saved.renewAfterDays || agency.treatment_plan_max_age_days || 90);
  return {
    flagEnabled: saved.flagEnabled ?? healthcare,
    forceUpdate: saved.forceUpdate ?? healthcare,
    flagAfterDays: Number(saved.flagAfterDays || 75),
    renewAfterDays: days > 0 ? days : 90,
    renewByDate: /^\d{4}-\d{2}-\d{2}$/.test(saved.renewByDate || '') ? saved.renewByDate : null
  };
}
export function renewalStatus(plan, policy, today = new Date().toISOString().slice(0, 10)) {
  const rawDate = plan?.effective_date || plan?.effectiveDate || plan?.created_at || '';
  const date = (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)).slice(0, 10);
  const ageDays = Math.floor((Date.parse(today) - Date.parse(date)) / 86400000);
  const expired = Number.isFinite(ageDays) && (ageDays >= policy.renewAfterDays || !!(policy.renewByDate && date < policy.renewByDate && today >= policy.renewByDate));
  return { ageDays: Number.isFinite(ageDays) ? ageDays : null, expired, flagged: !!policy.flagEnabled && (expired || ageDays >= policy.flagAfterDays), required: !!policy.forceUpdate && expired };
}
export async function loadRenewalPolicy(agencyId) {
  const [rows] = await pool.execute('SELECT * FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
  return normalizeRenewalPolicy(rows?.[0]);
}
