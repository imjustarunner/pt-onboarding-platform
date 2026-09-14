export const DEFAULT_RENEWAL_POLICY = { flagEnabled: true, forceUpdate: true, flagAfterDays: 75, renewAfterDays: 90, renewByDate: null };
export function treatmentPlanRenewalStatus(plan, settings = {}, today = new Date().toISOString().slice(0, 10)) {
  const policy = { ...DEFAULT_RENEWAL_POLICY, ...settings };
  const rawDate = plan?.effective_date || plan?.effectiveDate || plan?.created_at || '';
  const date = (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)).slice(0, 10);
  const ageDays = Math.floor((Date.parse(today) - Date.parse(date)) / 86400000);
  const expired = Number.isFinite(ageDays) && (ageDays >= policy.renewAfterDays || !!(policy.renewByDate && date < policy.renewByDate && today >= policy.renewByDate));
  return { ageDays: Number.isFinite(ageDays) ? ageDays : null, expired, flagged: !!policy.flagEnabled && (expired || ageDays >= policy.flagAfterDays), required: !!policy.forceUpdate && expired };
}
