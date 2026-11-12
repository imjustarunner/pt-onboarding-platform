export function supervisionCoFacilitatorIds(session = {}) {
  const supervisorId = Number(session.supervisorUserId);
  return [...new Set([session.coFacilitatorUserId, ...(session.coFacilitatorUserIds || [])]
    .map(Number).filter(id => Number.isSafeInteger(id) && id > 0 && id !== supervisorId))];
}
export function isSupervisionFacilitator(session = {}, userId) {
  return Number(session.supervisorUserId) === Number(userId) || supervisionCoFacilitatorIds(session).includes(Number(userId));
}
