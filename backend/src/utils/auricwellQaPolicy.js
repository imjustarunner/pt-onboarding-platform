export const AURICWELL_QA_SLUG = 'auricwell-qa-demo';

// The dedicated QA tenant fails closed until its sole exchange recipient is set.
// Other tenants retain their existing policy. Email redirection is not a substitute
// for this check: in-app notifications and SMS must be isolated too.
export function allowQaExchangeRecipient(agency, user) {
  if (agency?.slug !== AURICWELL_QA_SLUG) return true;
  let flags = agency.feature_flags;
  if (typeof flags === 'string') {
    try { flags = JSON.parse(flags); } catch { return false; }
  }
  const id = Number(flags?.qaSandbox?.exchangeProviderUserId);
  return flags?.qaSandbox?.syntheticOnly === true
    && Number.isSafeInteger(id) && id > 0 && Number(user?.id) === id
    && Number(user?.is_demo) === 1
    && String(user?.email || '').toLowerCase() === 'qa.provider.auricwell@example.com';
}
