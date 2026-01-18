import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';

export async function getUserCompensationForAgency({ agencyId, userId }) {
  const [rateCard, perCodeRates, serviceCodeRules] = await Promise.all([
    PayrollRateCard.findForUser(agencyId, userId),
    PayrollRate.listForUser(agencyId, userId),
    PayrollServiceCodeRule.listForAgency(agencyId)
  ]);

  return {
    agencyId,
    userId,
    rateCard: rateCard || null,
    perCodeRates: perCodeRates || [],
    serviceCodeRules: serviceCodeRules || []
  };
}

