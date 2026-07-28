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

/**
 * True when credential text indicates a fully licensed clinician eligible for
 * insurance credentialing (LPC, LCSW, LMFT/MFT, LAC, Licensed Psychologist).
 * Pre-licensed / candidate credentials (LPCC, MFTC, SWC, etc.) are excluded.
 */
export function isFullyLicensedCredentialText(raw) {
  const s = safeText(raw);
  if (!s) return false;
  const upper = s.toUpperCase();

  if (/\bINTERN\b/.test(upper)) return false;
  if (/\bUNLICENSED\b/.test(upper)) return false;
  if (/\bPRE[- ]?LICENSED\b/.test(upper) || /\bPRELICENSED\b/.test(upper)) return false;
  if (/\bLPCC\b/.test(upper)) return false;
  if (/\bSWC\b/.test(upper)) return false;
  if (/\bMFTC\b/.test(upper)) return false;
  if (/\bCANDIDATE\b/.test(upper)) return false;
  if (/\bASSOCIATE\b/.test(upper)) return false;
  if (/\bLPC-A\b/.test(upper) || /\bLPC-ASSOCIATE\b/.test(upper)) return false;
  if (/\bLSW\b/.test(upper) && !/\bLCSW\b/.test(upper)) return false;

  if (/\bLCSW\b/.test(upper)) return true;
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
