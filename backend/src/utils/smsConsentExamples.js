import { buildSmsConsentDisclosure } from './smsConsentDisclosure.js';

// Public review copies only: no patient data, real signatures, enrollment or sends.
// Legal identities must match the approved sender registration before enrollment.
const practices = {
  itsco: { brandName: 'ITSCO', legalName: 'ITSCO, LLC', origin: 'https://www.itsco.health', supportContact: 'support@itsco.health' },
  nlu: { brandName: 'Next Level Up', legalName: 'NEXTLEVELUP, LLC', origin: 'https://nextleveluplcc.com', supportContact: '719-377-6577' },
  tisi: { brandName: 'The Inner Strength Institute', legalName: 'The Inner Strength Institute', origin: 'https://theinnerstrengthinstitute.com', supportContact: 'support@innerstrengthin.com' },
  auricwell: { brandName: 'AuricWell', legalName: 'Plot Twist Co', origin: 'https://auricwell.com', supportContact: 'support@plottwistco.com' }
};
const aliases = { nextlevelup: 'nlu', nextleveluplcc: 'nlu', innerstrength: 'tisi', theinnerstrengthinstitute: 'tisi' };
const fail = (status, message) => Object.assign(new Error(message), { status });
export function smsConsentExample(slug, query = {}) {
  const key = String(slug || '').toLowerCase();
  const canonical = aliases[key] || key;
  if (!Object.hasOwn(practices, canonical)) throw fail(404, 'Unknown messaging brand');
  const profile = practices[canonical];
  const program = query.program || (canonical === 'auricwell' ? 'account' : 'operations');
  const audience = query.audience || 'client';
  if (!['client', 'guardian', 'staff'].includes(audience)) throw fail(400, 'Choose client, guardian or staff audience');
  const allowed = canonical === 'auricwell' ? ['account'] : ['operations', 'marketing'];
  if (!allowed.includes(program)) throw fail(400, 'This messaging program is not available for this brand');
  const includeBilling = query.billing === '1';
  if (query.billing !== undefined && !['0', '1'].includes(query.billing)) throw fail(400, 'Choose billing=0 or billing=1');
  if (includeBilling && program !== 'operations') throw fail(400, 'Billing is only available in the operations program');
  const purposes = program === 'account' ? ['account_security'] : program === 'marketing' ? ['marketing'] : ['care', 'reminders', 'workforce', ...(includeBilling ? ['billing'] : [])];
  return {
    example: true,
    signerRole: audience,
    disclosure: buildSmsConsentDisclosure({ ...profile,
      privacyUrl: `${profile.origin}/${canonical}/privacypolicy`,
      termsUrl: `${profile.origin}/${canonical}/terms`, purposes
    }, { signerRole: audience })
  };
}
