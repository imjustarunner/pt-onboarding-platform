export function preparedGuardianLink(link) {
  let permissions = link?.permissions_json;
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch { return false; }
  }
  return Number(link?.access_enabled) !== 1 && permissions?.pendingGuardianVerification === true
    && ['saved_guardian_contact','paper_packet_entry'].includes(permissions.accountPreparationSource);
}
