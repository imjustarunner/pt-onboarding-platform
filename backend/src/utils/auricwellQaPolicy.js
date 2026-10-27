export const AURICWELL_QA_SLUG = 'auricwell-qa-demo';

export function isAuricwellQaAgency(agency) {
  let flags = agency?.feature_flags;
  if (typeof flags === 'string') {
    try { flags = JSON.parse(flags); } catch { return false; }
  }
  return Number(agency?.id) === 450 && agency?.slug === AURICWELL_QA_SLUG
    && flags?.qaSandbox?.syntheticOnly === true;
}

// The owner explicitly authorized staff, care and appointment tests to this phone.
// Registration, purpose consent, preferences and STOP are still enforced by the sender.
export function allowQaSmsDelivery(agency, {to,purpose,clientId}={}) {
  if (![450,451,452].includes(Number(agency?.id)) && !String(agency?.slug||'').startsWith(AURICWELL_QA_SLUG)) return true;
  return isAuricwellQaAgency(agency) && ['workforce','care','reminders'].includes(purpose)
    && String(to||'').replace(/\D/g,'')==='16189107000';
}

// The dedicated QA tenant fails closed until its explicit provider roster is set.
// Other tenants retain their existing policy. Email redirection is not a substitute
// for this check: in-app notifications and SMS must be isolated too.
export function allowQaExchangeRecipient(agency, user) {
  if (agency?.slug !== AURICWELL_QA_SLUG) return true;
  let flags = agency.feature_flags;
  if (typeof flags === 'string') {
    try { flags = JSON.parse(flags); } catch { return false; }
  }
  const sandbox = flags?.qaSandbox;
  if (sandbox?.syntheticOnly !== true || Number(user?.is_demo) !== 1) return false;
  const email = String(user?.email || '').toLowerCase();
  // Backward compatibility for the already-provisioned sole demo provider.
  if (!Object.hasOwn(sandbox, 'exchangeProviders')) {
    const id = Number(sandbox.exchangeProviderUserId);
    return Number.isSafeInteger(id) && id > 0 && Number(user?.id) === id
      && email === 'qa.provider.auricwell@example.com';
  }
  const roster = sandbox.exchangeProviders;
  if (!Array.isArray(roster) || !roster.length || roster.length > 10) return false;
  const ids = new Set(), emails = new Set();
  for (const entry of roster) {
    const id = Number(entry?.id), address = String(entry?.email || '').toLowerCase();
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id) || emails.has(address)
      || !/^qa\.provider(?:\.[a-z0-9-]+)*@example\.com$/.test(address)) return false;
    ids.add(id); emails.add(address);
  }
  return ['provider','provider_plus','supervisor','intern','intern_plus'].includes(String(user?.role || '').toLowerCase())
    && roster.some(entry => Number(entry.id) === Number(user?.id) && String(entry.email).toLowerCase() === email);
}
