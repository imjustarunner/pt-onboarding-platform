import { PLAN_FEATURES, PLAN_TIERS } from '../constants/productPlanCatalog.js';

const ranks = new Map(PLAN_TIERS.map((tier, index) => [tier.id, index]));
const features = new Map(PLAN_FEATURES.map(feature => [feature.key, feature]));

// Plan inclusion is not authorization: existing role, agency, consent, and
// separate-feature controls must still be checked at each operation.
export function planIncludesFeature({ agencyTier, individualTier, product = 'platform', addons = [] } = {}, key) {
  const feature = features.get(key);
  if (!feature) return false;
  if (product === 'auricwell' && feature.auricwellAddon) return Array.isArray(addons) && addons.includes(feature.auricwellAddon);
  if (feature.minimumTier === 'separate') return false;
  const tier = feature.scope === 'agency' ? agencyTier : individualTier;
  if (!ranks.has(tier)) return false;
  return ranks.get(tier) >= ranks.get(feature.minimumTier);
}

export function describePlanFeatures(context) {
  return Object.fromEntries(PLAN_FEATURES.map(feature => [feature.key, {
    minimumTier: feature.minimumTier,
    scope: feature.scope,
    included: planIncludesFeature(context, feature.key),
    separate: feature.minimumTier === 'separate' || (context?.product === 'auricwell' && !!feature.auricwellAddon),
    ...(feature.auricwellAddon ? { auricwellAddon: feature.auricwellAddon } : {})
  }]));
}
