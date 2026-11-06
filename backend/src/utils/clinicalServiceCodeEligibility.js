import { deriveCredentialTierFromText } from './credentialNormalization.js';

const QBHA_CODES = new Set([
  'H0023',
  'H0025',
  'H2011',
  'H2014',
  'H2015',
  'H2016',
  'H2017',
  'H2018',
  'H2021',
  'H2022',
  'S9454',
  '97535'
]);

const BACHELORS_EXTRA_CODES = new Set(['H0004', 'H0031', 'H0032', 'H2033', 'T1017']);

export function deriveCredentialTier({ userRole, providerCredentialText }) {
  return deriveCredentialTierFromText({ userRole, providerCredentialText });
}

// Bachelor's-level providers cannot use 9-series codes. Base H2011 requires
// an explicitly recognized provider tier; an unknown credential is not a QBHA.
export function isServiceCodeDeniedForTier(tier, code) {
  const normalizedTier=String(tier || '').trim().toLowerCase();
  const normalizedCode=String(code || '').trim().toUpperCase();
  return (normalizedTier === 'bachelors' && /^9/.test(normalizedCode))
    || (normalizedCode === 'H2011' && !['qbha','bachelors','intern_plus'].includes(normalizedTier));
}

export function eligibleServiceCodesForTier(tier) {
  const t = String(tier || '').trim().toLowerCase();
  if (t === 'qbha') return Array.from(QBHA_CODES);
  if (t === 'bachelors') return Array.from(new Set([...QBHA_CODES, ...BACHELORS_EXTRA_CODES])).filter(code => !isServiceCodeDeniedForTier(t, code));
  if (t === 'intern_plus') return null; // null means "all codes allowed"
  return Array.from(QBHA_CODES).filter(code => !isServiceCodeDeniedForTier(t,code)); // preserve legacy fallback, but never grant new crisis authority to an unknown credential
}

export function assertServiceCodeAllowed({ tier, serviceCode, allowedCodes = null }) {
  const code = String(serviceCode || '').trim().toUpperCase();
  if (!code) {
    const err = new Error('serviceCode is required');
    err.status = 400;
    throw err;
  }

  const t = String(tier || '').trim().toLowerCase();
  if (t === 'intern_plus') return true;

  const allowedList = Array.isArray(allowedCodes) ? allowedCodes : eligibleServiceCodesForTier(tier);
  if (allowedList === null && !isServiceCodeDeniedForTier(t, code)) return true;
  const allowed = new Set(allowedList || []);
  if (isServiceCodeDeniedForTier(t, code) || !allowed.has(code)) {
    const err = new Error(`You are not permitted to submit service code ${code}`);
    err.status = 403;
    err.code = 'SERVICE_CODE_NOT_ALLOWED';
    throw err;
  }
  return true;
}

