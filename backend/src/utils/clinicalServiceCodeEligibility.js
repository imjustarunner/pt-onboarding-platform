const QBHA_CODES = new Set([
  'H0023',
  'H0025',
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

function normalizeCredentialText(raw) {
  return String(raw ?? '')
    .replace(/\u0000/g, '')
    .trim();
}

function isBachelorsCredentialText(raw) {
  const s = String(raw ?? '').trim();
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
  const upper = String(raw ?? '').toUpperCase();
  return tokens.some((t) => upper.includes(String(t).toUpperCase()));
}

export function deriveCredentialTier({ userRole, providerCredentialText }) {
  const role = String(userRole || '').trim().toLowerCase();
  const cred = normalizeCredentialText(providerCredentialText);
  const upper = cred.toUpperCase();

  // Explicit intern role is always intern+.
  if (role === 'intern') return 'intern_plus';

  // QBHA detection: require explicit token.
  if (upper.includes('QBHA') || upper.includes('QUALIFIED BEHAVIORAL HEALTH ASSISTANT')) return 'qbha';

  // Bachelors detection.
  if (isBachelorsCredentialText(cred)) return 'bachelors';

  // Intern or higher credential text.
  const internPlusTokens = [
    'INTERN',
    // pre-licensed / unlicensed masters
    'LPCC',
    'LSW',
    'SWC',
    'MFTC',
    // licensed
    'LAC',
    'EDD',
    'PHD',
    'PSYD',
    'LMFT',
    'LPC',
    'LCSW',
    'MFT',
    'LICENSED',
    'PRE-LICENSED',
    'PRELICENSED'
  ];
  if (containsAnyToken(cred, internPlusTokens)) return 'intern_plus';

  return 'unknown';
}

export function eligibleServiceCodesForTier(tier) {
  const t = String(tier || '').trim().toLowerCase();
  if (t === 'qbha') return Array.from(QBHA_CODES);
  if (t === 'bachelors') return Array.from(new Set([...QBHA_CODES, ...BACHELORS_EXTRA_CODES]));
  if (t === 'intern_plus') return null; // null means "all codes allowed"
  return Array.from(QBHA_CODES); // safest default
}

export function assertServiceCodeAllowed({ tier, serviceCode }) {
  const code = String(serviceCode || '').trim().toUpperCase();
  if (!code) {
    const err = new Error('serviceCode is required');
    err.status = 400;
    throw err;
  }

  const t = String(tier || '').trim().toLowerCase();
  if (t === 'intern_plus') return true;

  const allowed = new Set(eligibleServiceCodesForTier(tier) || []);
  if (!allowed.has(code)) {
    const err = new Error(`You are not permitted to submit service code ${code}`);
    err.status = 403;
    err.code = 'SERVICE_CODE_NOT_ALLOWED';
    throw err;
  }
  return true;
}

