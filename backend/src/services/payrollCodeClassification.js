import { payrollDefaultsForCode } from './payrollServiceCodeDefaults.js';
export const PAY_SYSTEM_BUCKETS = ['credit', 'hcode', 'indirect', 'support_activity', 'skip', 'flat'];
export const isPayrollCodeVisible = r => Number(r?.show_in_rate_sheet ?? r?.showInRateSheet ?? 1) !== 0;
export function classifyPayType(serviceCode, ruleOrDefaults = null) {
  const code = String(serviceCode || '').trim().toUpperCase();
  if (!code) return 'skip';

  const configured = ruleOrDefaults?.pay_system_bucket ?? ruleOrDefaults?.paySystemBucket;
  if (PAY_SYSTEM_BUCKETS.includes(configured)) return configured;
  const defaults = payrollDefaultsForCode(code) || {};
  // Rule rows use snake_case category; defaults use camelCase category.
  const cat = String(ruleOrDefaults?.category ?? defaults.category ?? 'direct').trim().toLowerCase();

  if (cat === 'mileage' || cat === 'bonus' || cat === 'reimbursement' || cat === 'other_pay') return 'skip';
  if (code === 'SALARY' || code === 'BONUS' || code === 'HOLIDAY BONUS' || code === 'MILEAGE' || code === 'REIMBURSEMENT' || code === 'MEDCANCEL' || code === 'MISSED APPT' || code === 'COMMISSION') {
    return 'skip';
  }
  if (cat === 'meeting' || code === 'MEETING' || code === 'INDIVIDUAL MEETING' || code === 'MENTOR/CPA MEETING') {
    return 'support_activity';
  }
  if (cat === 'indirect' || cat === 'admin' || code === 'INDIRECT TIME' || code === 'INDIRECT HOURS' || code === 'ADMIN TIME') {
    return 'indirect';
  }
  // H-prefixed direct codes → hcode rate
  if (/^H\d/i.test(code)) {
    return 'hcode';
  }
  // Remaining direct / tutoring / other clinical → credit rate
  if (cat === 'direct' || cat === 'tutoring' || cat === 'other' || !cat) {
    return 'credit';
  }
  return 'skip';
}

