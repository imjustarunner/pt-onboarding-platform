// Owner-authorized delivery copies for two recipients of the October ITSCO update.
// Keep this scoped to the original draft and the actual staff-send campaign: not personal notices or future pushes.
export function providerUpdateAuditBcc({agencyId,pushId,providerUserId}={}) {
 return Number(agencyId)===2 && [2,5].includes(Number(pushId)) && [485,494].includes(Number(providerUserId))
  ? ['michael@plottwistco.com'] : null;
}
