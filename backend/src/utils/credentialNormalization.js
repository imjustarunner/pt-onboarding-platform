function safeText(raw) {
  return String(raw ?? '')
    .replace(/\u0000/g, '')
    .trim();
}

export function normalizeCredentialText(raw) {
  return safeText(raw);
}

export function normalizeCredentialToken(raw) {
  return safeText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isBachelorsCredentialText(raw) {
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

function containsAnyToken(raw, tokens) {
  const upper = safeText(raw).toUpperCase();
  return (tokens || []).some((t) => upper.includes(String(t || '').toUpperCase()));
}

export function deriveCredentialTierFromText({ userRole, providerCredentialText }) {
  const role = String(userRole || '').trim().toLowerCase();
  const cred = safeText(providerCredentialText);

  if (role === 'intern') return 'intern_plus';
  if (role === 'qbha' || role === 'clinical_practice_assistant') return 'qbha';

  if (containsAnyToken(cred, ['QBHA', 'QUALIFIED BEHAVIORAL HEALTH ASSISTANT'])) return 'qbha';

  const internPlusTokens = [
    'INTERN',
    'UNLICENSED',
    'PRE-LICENSED',
    'PRELICENSED',
    'LPCC',
    'LSW',
    'SWC',
    'MFTC',
    'LAC',
    'EDD',
    'PHD',
    'PSYD',
    'LMFT',
    'LPC',
    'LCSW',
    'MFT',
    'LICENSED'
  ];
  if (containsAnyToken(cred, internPlusTokens)) return 'intern_plus';
  if (isBachelorsCredentialText(cred)) return 'bachelors';
  return 'unknown';
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

  // Pre-licensed / associate-level — not insurance-credentialing eligible
  if (/\bINTERN\b/.test(upper)) return false;
  if (/\bUNLICENSED\b/.test(upper)) return false;
  if (/\bPRE[- ]?LICENSED\b/.test(upper) || /\bPRELICENSED\b/.test(upper)) return false;
  if (/\bLPCC\b/.test(upper)) return false;
  if (/\bSWC\b/.test(upper)) return false;
  if (/\bMFTC\b/.test(upper)) return false;
  if (/\bCANDIDATE\b/.test(upper)) return false;
  if (/\bASSOCIATE\b/.test(upper)) return false;
  if (/\bLPC-A\b/.test(upper) || /\bLPC-ASSOCIATE\b/.test(upper)) return false;
  // LSW alone is not fully licensed; LCSW is
  if (/\bLSW\b/.test(upper) && !/\bLCSW\b/.test(upper)) return false;

  if (/\bLCSW\b/.test(upper)) return true;
  if (/\bLPC\b/.test(upper)) return true;
  if (/\bLMFT\b/.test(upper) || /\bLMFC\b/.test(upper)) return true;
  // Bare MFT only after MFTC excluded above
  if (/\bMFT\b/.test(upper)) return true;
  // Licensed Addiction Counselor (fully licensed in CO)
  if (/\bLAC\b/.test(upper)) return true;
  if (/\bLICENSED\s+PSYCHOLOGIST\b/i.test(s)) return true;
  if (/\bLPSY\b/.test(upper)) return true;
  if (/\bPSYD\b/.test(upper) || /\bPSY\.?\s*D\.?\b/i.test(s)) return true;
  if (/\bPH\.?\s*D\.?\b/i.test(s) && /PSYCH/.test(upper)) return true;
  // Standalone LP (Licensed Psychologist) — exclude LPC/LPCC already handled above
  if (/\bLP\b/.test(upper) && !/\bLPC/.test(upper)) return true;

  return false;
}

