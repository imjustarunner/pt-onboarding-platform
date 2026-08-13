export function classifyAssignmentBucket({ hasProvider, hasDay }) {
  if (hasProvider && hasDay) return 'provider_and_day';
  if (hasProvider) return 'provider_no_day';
  return 'no_provider';
}
