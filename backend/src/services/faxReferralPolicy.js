const defaultReferralLines = {
  '+17194318895': 'itsco',
  '+17197500350': 'nlu',
  '+17193022551': 'tisi'
};

export function faxReferralRoutes(env = process.env) {
  if (!env.NOTIFYRE_API_TOKEN || !env.NOTIFYRE_WEBHOOK_SECRET || !env.NOTIFYRE_BAA_REFERENCE ||
      !(env.REFERRAL_KMS_KEY || env.DOCUMENTS_KMS_KEY)) return new Map();
  try {
    const raw = env.NOTIFYRE_REFERRAL_FAX_ROUTES_JSON;
    const parsed = raw == null ? defaultReferralLines : JSON.parse(raw);
    const routes = Object.entries(parsed);
    if (routes.some(([number, slug]) => !/^\+1[2-9]\d{9}$/.test(number) ||
        typeof slug !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(slug))) return new Map();
    if (new Set(routes.map(([,slug]) => slug)).size !== routes.length) return new Map();
    return new Map(routes);
  } catch {
    return new Map();
  }
}

export function classifyFaxReferral(pages) {
  const text = pages.map(page => page.text).join('\n').toLowerCase().replace(/[^\S\r\n]+/g, ' ');
  const referral = /\b(?:referral (?:form|request|order|reason)|(?:patient|clinical|medical|behavioral health|mental health|counseling) referral|reason for referral|please refer (?:this|the|our) patient|referred (?:to|for) (?:counseling|therapy|behavioral health|mental health))\b/.test(text);
  const patient = /\b(?:patient(?:'s)? name|client(?:'s)? name|student(?:'s)? name|date of birth|birth date|d\.?o\.?b\.?)\b/.test(text);
  const nonReferral = /\b(?:invoice number|statement of account|payment due|remittance advice|special offer|unsubscribe from (?:our|this)|request for (?:medical )?records)\b/.test(text);
  if (referral && patient && !nonReferral) return 'referral';
  if (!referral && nonReferral) return 'filtered';
  return 'review';
}
