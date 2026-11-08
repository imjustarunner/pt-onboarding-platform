import { isAuricwellQaAgency } from './auricwellQaPolicy.js';

// Both the public form configuration and session creation use this policy.
// The agency must be resolved from the stored intake link/affiliation, never
// from a caller-supplied agency ID or a browser testing flag.
export function requiresCaptchaForLink(organization, agency, env = process.env) {
  if (isAuricwellQaAgency(agency)) return false;

  if (String(env.RECAPTCHA_REQUIRED_FOR_ALL || '').toLowerCase() === 'true') return true;
  const names = env.RECAPTCHA_REQUIRED_ORG_NAMES;
  if (!names || typeof names !== 'string') return false;
  const list = names.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return false;
  const check = org => {
    if (!org) return false;
    const name = String(org.name || '').trim().toLowerCase();
    const officialName = String(org.official_name || '').trim().toLowerCase();
    return list.some(value => name.includes(value) || officialName.includes(value));
  };
  return check(organization) || check(agency);
}
