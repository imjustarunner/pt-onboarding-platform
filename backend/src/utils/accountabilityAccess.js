// Verified work-account IDs. Personal/duplicate accounts with the same names
// must not inherit access. Grants and organization membership are still required.
const WORK_ACCOUNTS = new Set([501, 507, 538]); // Michael, Rachel, Melissa
const COMPANY_PARTICIPANTS = new Map([
  [2, WORK_ACCOUNTS], // ITSCO
  [1, new Set([538])] // PlotTwistCo: Melissa only
]);

export function canAccessAccountability(userId, agencyId) {
  return WORK_ACCOUNTS.has(Number(userId)) && COMPANY_PARTICIPANTS.has(Number(agencyId));
}

export function isAccountabilityParticipant(userId, agencyId) {
  return COMPANY_PARTICIPANTS.get(Number(agencyId))?.has(Number(userId)) === true;
}
