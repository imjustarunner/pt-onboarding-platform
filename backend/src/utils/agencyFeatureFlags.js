// Settings forms expose different subsets of flags. Omitted keys are unchanged,
// while an explicit false still disables a feature.
export function mergeAgencyFeatureFlags(existing, patch) {
  const current = typeof existing === 'string' ? JSON.parse(existing || '{}') : existing;
  return { ...(current || {}), ...patch };
}
