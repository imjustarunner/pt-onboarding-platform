export const canViewDemoExchange = role => ['support','admin','super_admin'].includes(String(role || '').trim().toLowerCase());

export function isExampleEmail(value) {
  const address = String(value || '').trim().replace(/^.*<([^<>]+)>$/, '$1').toLowerCase();
  return /^[^\s@]+@(?:[a-z0-9-]+\.)*example(?:\.com)?$/.test(address);
}

// Inspect email fields, not arbitrary clinical notes mentioning an example.
export function hasDemoExchangeEmail(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => /email/i.test(key)
    ? (Array.isArray(child) ? child.some(isExampleEmail) : isExampleEmail(child))
    : child && typeof child === 'object' && hasDemoExchangeEmail(child));
}

export const DEMO_EXCHANGE_REASON = 'Demo referral: provider visibility, email, text and push notifications are suppressed.';

// Client.findById also carries organization settings and provider metadata.
// Only client/family identity sections may determine this client's demo status.
export function hasClientDemoIdentity(value) {
  if (!value || typeof value !== 'object') return false;
  const identity = Object.fromEntries(Object.entries(value).filter(([key]) =>
    /^(?:(?:client|contact|parent|guardian|personal|work)?_?email|guardians?|contacts?|parents?|self|adult|primaryContact|contactDetails|registration|enrollment|exchangeReferral|demographics)$/i.test(key)));
  return hasDemoExchangeEmail(identity);
}
