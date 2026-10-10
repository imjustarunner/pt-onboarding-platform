// Owner-authorized delivery copies for two recipients of the October ITSCO update.
// Keep this scoped to the specific campaign: not personal notices or future pushes.
export function providerUpdateAuditBcc({agencyId,pushId,providerUserId}={}) {
 return Number(agencyId)===2 && Number(pushId)===2 && [485,494].includes(Number(providerUserId))
  ? ['michael@plottwistco.com'] : null;
}
