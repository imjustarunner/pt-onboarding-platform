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
