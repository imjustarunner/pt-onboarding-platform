import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';
import PayrollPaySystemRate from '../models/PayrollPaySystemRate.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';
import { classifyPayType, computeLineAmount } from './paySystem.service.js';

export async function contractCompensationLevels(agencyId) {
  const [levels, profiles, serviceRates] = await Promise.all([PayrollCompensationLevel.listForAgency(agencyId), PayrollPaySystemRate.listForAgency(agencyId), PayrollCompensationLevel.getLevelRatesForAgency(agencyId)]);
  return levels.map(row => {
    const profile = profiles.find(p => Number(p.category) === Number(row.category) && Number(p.level) === Number(row.level) && p.id);
    return { ...row, paySystem: profile || null, serviceRates: serviceRates[`${row.category}:${row.level}`] || [],
      direct_rate: profile?.creditRate ?? row.direct_rate ?? null,
      indirect_rate: profile?.indirectRate ?? row.indirect_rate ?? null,
      ffs_rate: profile?.creditRate ?? row.ffs_rate ?? null };
  });
}

export function contractServiceRates(row, rules) {
  return rules.filter(rule => Number(rule.show_in_rate_sheet ?? 1) !== 0 && classifyPayType(rule.service_code, rule) !== 'skip').map(rule => {
    const payType = classifyPayType(rule.service_code, rule);
    if (rule.pay_method === 'percent_of_charge') {
      if (rule.pay_percent == null) throw Object.assign(new Error(`Configure the percentage for service ${rule.service_code}.`), { status: 400 });
      return { code: rule.service_code, rate: `${Number(rule.pay_percent)}% of charge`, unit: 'per service' };
    }
    if (row.paySystem && row.paySystem.creditRate != null) {
      const profile = row.paySystem;
      const requiredRate = payType === 'indirect' ? profile.indirectRate : payType === 'support_activity' ? profile.supportActivityRate : payType === 'hcode' ? (profile.hcodeRate ?? profile.creditRate) : profile.creditRate;
      if (requiredRate == null) throw Object.assign(new Error(`Configure the ${payType} rate for service ${rule.service_code}, Category ${row.category}, Level ${row.level}.`), { status: 400 });
      const normal = computeLineAmount({ rateProfile: profile, status: { useReducedRates: false }, serviceCode: rule.service_code, quantity: 1, rule });
      const reduced = computeLineAmount({ rateProfile: profile, status: { useReducedRates: true }, serviceCode: rule.service_code, quantity: 1, rule });
      return { code: rule.service_code, rate: `$${normal.amount.toFixed(2)}`, unit: 'per entered unit',
        reduced: `$${reduced.amount.toFixed(2)}`, additionalIndirect: normal.autoIndirectAmount ? `$${normal.autoIndirectAmount.toFixed(2)} additional indirect pay` : '' };
    }
    const base = payType === 'indirect' || payType === 'support_activity' ? row.indirect_rate : row.ffs_rate;
    if (base == null) throw Object.assign(new Error(`Configure compensation for service ${rule.service_code}, Category ${row.category}, Level ${row.level}.`), { status: 400 });
    const divisor = rule.pay_rate_unit === 'per_hour' ? 1 : (Number(rule.pay_divisor) > 0 ? Number(rule.pay_divisor) : 1);
    return { code: rule.service_code, rate: `$${(Number(base) / divisor).toFixed(2)}`, unit: rule.pay_rate_unit === 'per_hour' ? 'per hour' : 'per unit' };
  });
}

export async function selectedContractCompensation(agencyId, category, level, payMode) {
  if (![1,2,3].includes(Number(category)) || ![1,2,3,4,5].includes(Number(level))) throw Object.assign(new Error('Choose a valid pay category and level.'), { status: 400 });
  if (payMode === 'none') return { row: { category, level }, rates: [] };
  const levels = await contractCompensationLevels(agencyId);
  const row = levels.find(r => Number(r.category) === Number(category) && Number(r.level) === Number(level));
  // Preserve the agency's explicit per-service rates already supported on main.
  const codeRates = payMode === 'ffs' ? row?.serviceRates || [] : [];
  if (codeRates.length) {
    if (codeRates.some(rate => rate.rateAmount == null || !Number.isFinite(Number(rate.rateAmount)) || Number(rate.rateAmount) <= 0)) throw Object.assign(new Error('Configure a positive rate for every selected compensation service before preparing the agreement.'), { status: 400 });
    return { row: row || { category, level }, rates: codeRates.map(rate => ({ code: rate.serviceCode, rate: `$${Number(rate.rateAmount).toFixed(2)}`, unit: rate.rateUnit === 'per_hour' ? 'per hour' : 'per unit' })) };
  }
  const needed = payMode === 'ffs' ? ['ffs_rate'] : payMode === 'hourly' ? ['direct_rate', 'indirect_rate'] : [];
  for (const key of needed) if (row?.[key] == null || !Number.isFinite(Number(row[key])) || Number(row[key]) <= 0) throw Object.assign(new Error(`Category ${category}, Level ${level} has no configured ${key.replaceAll('_', ' ')}. Configure compensation or choose another configured level.`), { status: 400 });
  const rates = payMode === 'ffs' ? contractServiceRates(row, await PayrollServiceCodeRule.listForAgency(agencyId)) : [];
  if (payMode === 'ffs' && !rates.length) throw Object.assign(new Error('No service codes are configured for the compensation table. Configure agency service-code rules before preparing this agreement.'), { status: 400 });
  return { row, rates };
}
