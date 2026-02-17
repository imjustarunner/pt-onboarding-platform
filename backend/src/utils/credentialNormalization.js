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

