import { PLAN_FEATURES, PLAN_TIERS } from '../constants/productPlanCatalog.js';

const ranks = new Map(PLAN_TIERS.map((tier, index) => [tier.id, index]));
const features = new Map(PLAN_FEATURES.map(feature => [feature.key, feature]));

// Plan inclusion is not authorization: existing role, agency, consent, and
// separate-feature controls must still be checked at each operation.
export function planIncludesFeature({ agencyTier, individualTier } = {}, key) {
  const feature = features.get(key);
  if (!feature || feature.minimumTier === 'separate') return false;
  const tier = feature.scope === 'agency' ? agencyTier : individualTier;
  if (!ranks.has(tier)) return false;
  return ranks.get(tier) >= ranks.get(feature.minimumTier);
}

export function describePlanFeatures(context) {
  return Object.fromEntries(PLAN_FEATURES.map(feature => [feature.key, {
    minimumTier: feature.minimumTier,
    scope: feature.scope,
    included: planIncludesFeature(context, feature.key),
    separate: feature.minimumTier === 'separate'
  }]));
}
