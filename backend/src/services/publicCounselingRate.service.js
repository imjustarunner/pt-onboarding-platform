import { getSelfPayRates } from './selfPayRates.service.js';

// Public prices and actual booking quotes share the canonical practice/category/
// provider schedule. Different service rates require a service-specific quote.
export async function getPublicCounselingHourlyRate({ agencyId, providerUserId, serviceType = 'counseling' }) {
  if (serviceType !== 'counseling') return null;
  const { services } = await getSelfPayRates(Number(agencyId), Number(providerUserId));
  const counseling = services.filter(s => s.businessType === 'mental_health' && s.allowsIndividual && !s.allowsGroup);
  if (!counseling.length || counseling.some(s => s.effectiveRate?.rateCents == null || s.effectiveRate.rateUnit !== 'hour')) return null;
  const rates = new Set(counseling.map(s => Number(s.effectiveRate.rateCents)));
  return rates.size === 1 ? [...rates][0] : null;
}
