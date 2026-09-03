/** @typedef {import('../../backend/src/utils/credentialNormalization.js')} */

/** Licensed / pre-licensed credentials for PYU license section. */
export const PROVIDER_YEAR_UPDATE_LICENSE_TOKENS = [
  'LMFTC',
  'LPCC',
  'MFTC',
  'LCSW',
  'LMFT',
  'LSW',
  'SWC',
  'LPC',
  'MFT',
  'LAC',
];

export const LICENSE_UPLOAD_ACCEPT =
  '.pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';

function safeText(raw) {
  return String(raw ?? '').trim();
}

function isBachelorsCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.includes('bachelor')) return true;
  if (/\bba\b/i.test(s)) return true;
  if (/\bbs\b/i.test(s)) return true;
  if (/\bb\.a\.\b/i.test(lower)) return true;
  if (/\bb\.s\.\b/i.test(lower)) return true;
  return false;
}

function isPrelicensedOrUnderSupervisionCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  const upper = s.toUpperCase();

  if (/\bINTERN\b/.test(upper)) return true;
  if (/\bUNLICENSED\b/.test(upper)) return true;
  if (/\bPRE[- ]?LICENSED\b/.test(upper) || /\bPRELICENSED\b/.test(upper)) return true;
  if (/\bLPCC\b/.test(upper)) return true;
  if (/\bLMFTC\b/.test(upper)) return true;
  if (/\bSWC\b/.test(upper)) return true;
  if (/\bMFTC\b/.test(upper)) return true;
  if (/\bCANDIDATE\b/.test(upper)) return true;
  if (/\bASSOCIATE\b/.test(upper)) return true;
  if (/\bLPC-A\b/.test(upper) || /\bLPC-ASSOCIATE\b/.test(upper)) return true;
  if (/\bLSW\b/.test(upper) && !/\bLCSW\b/.test(upper)) return true;
  if (isBachelorsCredentialText(s)) return true;
  return false;
}

/**
 * True when credential text indicates a fully licensed clinician eligible for
 * insurance credentialing (LPC, LCSW, LMFT/MFT, LAC, Licensed Psychologist).
 * Pre-licensed / candidate credentials (LPCC, MFTC, SWC, etc.) are excluded.
 */
export function isFullyLicensedCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  if (isPrelicensedOrUnderSupervisionCredentialText(s)) return false;
  const upper = s.toUpperCase();

  if (/\bLCSW\b/.test(upper)) return true;
  // Colorado DORA Clinical Social Worker prefix (CSW.09931054) — not SWC candidate
  if (/\bCSW\b/.test(upper) && !/\bSWC\b/.test(upper)) return true;
  if (/^(LPC|CSW|MFT|LCSW|LMFT|LAC)\.\d+/i.test(s.trim())) return true;
  if (/\bLPC\b/.test(upper)) return true;
  if (/\bLMFT\b/.test(upper) || /\bLMFC\b/.test(upper)) return true;
  if (/\bMFT\b/.test(upper)) return true;
  if (/\bLAC\b/.test(upper)) return true;
  if (/\bLICENSED\s+PSYCHOLOGIST\b/i.test(s)) return true;
  if (/\bLPSY\b/.test(upper)) return true;
  if (/\bPSYD\b/.test(upper) || /\bPSY\.?\s*D\.?\b/i.test(s)) return true;
  if (/\bPH\.?\s*D\.?\b/i.test(s) && /PSYCH/.test(upper)) return true;
  if (/\bLP\b/.test(upper) && !/\bLPC/.test(upper)) return true;

  return false;
}

/**
 * Clinical / billing supervisors must hold a fully licensed credential:
 * LPC, LCSW, LMFT/MFT, LAC, PsyD, or PhD (or licensed psychologist).
 * Pre-licensed, candidate, associate, and bachelor's credentials are excluded.
 */
export function isClinicalOrBillingSupervisorCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  if (isPrelicensedOrUnderSupervisionCredentialText(s)) return false;
  if (isFullyLicensedCredentialText(s)) return true;
  if (/\bPH\.?\s*D\.?\b/i.test(s) || /\bPHD\b/i.test(s)) return true;
  return false;
}

export const CLINICAL_BILLING_SUPERVISOR_LICENSE_HINT =
  'LPC, LCSW, LMFT, LAC, PsyD, or PhD';

export function supervisorCredentialText(user) {
  return safeText(user?.credential || user?.provider_credential || '');
}
