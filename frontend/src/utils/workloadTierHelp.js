// Calendar-day differences avoid daylight-saving time changing the countdown.
export function workloadTierHelp(info = {}) {
  const level = Number(info.tierLevel || info.tier?.tierLevel || 0);
  const prefix = level >= 1 ? `Your latest posted payroll shows Tier ${level}.` : 'Your latest posted payroll does not show an earned workload tier.';
  const pay = info.paySystem;
  if (!pay) return `${prefix} A minimum-workload start date is not confirmed here. People Operations can confirm your applicable waiver and rates.`;
  if (pay.waiveMinimumWorkload) return `${prefix} Your minimum-workload rate requirement is currently waived.`;
  if (pay.inInitiationProtection && pay.initiationProtectionEnd && pay.asOfDate) {
    const end = Date.parse(`${String(pay.initiationProtectionEnd).slice(0, 10)}T00:00:00Z`);
    const today = Date.parse(`${String(pay.asOfDate).slice(0, 10)}T00:00:00Z`);
    const days = Math.round((end - today) / 86400000);
    if (Number.isFinite(days) && days > 0) return `${prefix} You have ${days} ${days === 1 ? 'day' : 'days'} remaining in your minimum-workload rate waiver. Starting ${pay.initiationProtectionEnd}, Minimum Workload rates may apply if you remain below Tier 1 and no other waiver or grace period applies.`;
  }
  if (info.graceActive) return `${prefix} Your workload grace period is active. Your applicable rates remain subject to that protection.`;
  if (pay.isMinimumWorkload) return `${prefix} Your waiver has ended, and Minimum Workload rates currently apply. See My Compensation for your applicable rates.`;
  return `${prefix} Minimum Workload rates do not currently apply. See My Compensation for your applicable rates.`;
}
