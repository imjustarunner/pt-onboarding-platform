/**
 * Colorado disclosure regulatory board resolution by license type.
 * Tenant overrides live in agency_disclosure_settings.regulatory_boards_json.
 */

export const DEFAULT_DISCLOSURE_STATE = 'CO';

/** License-type keys used for tenant regulatory board settings. */
export const DISCLOSURE_LICENSE_TYPES = Object.freeze([
  { key: 'LPC', label: 'Licensed Professional Counselor (LPC)' },
  { key: 'LPCC', label: 'Licensed Professional Counselor Candidate (LPCC)' },
  { key: 'LCSW', label: 'Licensed Clinical Social Worker (LCSW)' },
  { key: 'CSW', label: 'Licensed Clinical Social Worker (CSW)' },
  { key: 'LSW', label: 'Licensed Social Worker (LSW)' },
  { key: 'SWC', label: 'Social Worker Candidate (SWC)' },
  { key: 'LMFT', label: 'Licensed Marriage and Family Therapist (LMFT)' },
  { key: 'MFT', label: 'Marriage and Family Therapist (MFT)' },
  { key: 'MFTC', label: 'Marriage and Family Therapist Candidate (MFTC)' },
  { key: 'LAC', label: 'Licensed Addiction Counselor (LAC)' },
  { key: 'PSYCHOLOGIST', label: 'Licensed Psychologist' }
]);

/** Default Colorado DORA boards by license type (ITSCO examples). */
export const DEFAULT_COLORADO_REGULATORY_BOARDS = Object.freeze({
  LPC: 'State Board of Licensed Professional Counselor Examiners',
  LPCC: 'State Board of Licensed Professional Counselor Examiners',
  LCSW: 'State Board of Social Work Examiners',
  CSW: 'State Board of Social Work Examiners',
  LSW: 'State Board of Social Work Examiners',
  SWC: 'State Board of Social Work Examiners',
  LMFT: 'State Board of Marriage and Family Therapist Examiners',
  MFT: 'State Board of Marriage and Family Therapist Examiners',
  MFTC: 'State Board of Marriage and Family Therapist Examiners',
  LAC: 'State Board of Licensed Professional Counselor Examiners',
  PSYCHOLOGIST: 'State Board of Psychologist Examiners'
});

const LICENSE_TYPE_PATTERNS = Object.freeze([
  ['LPCC', /\bLPCC\b/i],
  ['LMFTC', /\bLMFTC\b/i],
  ['MFTC', /\bMFTC\b/i],
  ['LCSW', /\bLCSW\b/i],
  ['LPC-A', /\bLPC[- ]?A(?:SSOCIATE)?\b/i],
  ['LPC', /\bLPC\b/i],
  ['CSW', /\bCSW\b/i],
  ['LSW', /\bLSW\b/i],
  ['SWC', /\bSWC\b/i],
  ['LMFT', /\bLMFT\b/i],
  ['MFT', /\bMFT\b/i],
  ['LAC', /\bLAC\b/i],
  ['PSYCHOLOGIST', /\bLICENSED\s+PSYCHOLOGIST\b/i],
  ['PSYCHOLOGIST', /\bLPSY\b/i],
  ['PSYCHOLOGIST', /\bPSY\.?\s*D\.?\b/i],
  ['PSYCHOLOGIST', /\bPH\.?\s*D\.?\b.*PSYCH/i],
  ['PSYCHOLOGIST', /\bLP\b(?!C)/i]
]);

function safeText(raw) {
  return String(raw ?? '').trim();
}

/**
 * Extract a canonical license-type key from credential and/or license number text.
 */
export function extractLicenseTypeKey({ credential = '', licenseNumber = '' } = {}) {
  const blob = `${credential} ${licenseNumber}`.trim();
  if (!blob) return null;

  for (const [key, pattern] of LICENSE_TYPE_PATTERNS) {
    if (pattern.test(blob)) {
      if (key === 'LPC-A') return 'LPCC';
      return key;
    }
  }

  // "Licensed Professional Counselor: LPC.0014518" style labels
  const labeled = blob.match(/:\s*([A-Za-z][A-Za-z.\-]{1,10})\./);
  if (labeled?.[1]) {
    const token = labeled[1].toUpperCase().replace(/\./g, '');
    const fromToken = extractLicenseTypeKey({ credential: token, licenseNumber: '' });
    if (fromToken) return fromToken;
  }

  return null;
}

export function getDefaultRegulatoryBoards(state = DEFAULT_DISCLOSURE_STATE) {
  if (String(state || '').toUpperCase() !== 'CO') {
    return { ...DEFAULT_COLORADO_REGULATORY_BOARDS };
  }
  return { ...DEFAULT_COLORADO_REGULATORY_BOARDS };
}

/**
 * Merge tenant overrides onto state defaults.
 */
export function mergeRegulatoryBoardSettings(overrides = {}, state = DEFAULT_DISCLOSURE_STATE) {
  const defaults = getDefaultRegulatoryBoards(state);
  const out = { ...defaults };
  for (const [key, value] of Object.entries(overrides || {})) {
    const k = String(key || '').trim().toUpperCase();
    const v = safeText(value);
    if (!k) continue;
    if (v) out[k] = v;
    else delete out[k];
  }
  return out;
}

/**
 * Resolve regulatory board for licensed / pre-licensed providers only.
 */
export function resolveRegulatoryBoard({
  licenseTypeKey = null,
  credential = '',
  licenseNumber = '',
  tenantBoards = {},
  state = DEFAULT_DISCLOSURE_STATE,
  category = null
} = {}) {
  const cat = String(category || '').toUpperCase();
  if (cat === 'UNLICENSED') return null;

  const key = licenseTypeKey || extractLicenseTypeKey({ credential, licenseNumber });
  if (!key) return null;

  const boards = mergeRegulatoryBoardSettings(tenantBoards, state);
  return boards[key] || null;
}

export function listEditableRegulatoryBoards(tenantOverrides = {}, state = DEFAULT_DISCLOSURE_STATE) {
  const merged = mergeRegulatoryBoardSettings(tenantOverrides, state);
  return DISCLOSURE_LICENSE_TYPES.map((row) => ({
    ...row,
    defaultBoard: DEFAULT_COLORADO_REGULATORY_BOARDS[row.key] || '',
    board: merged[row.key] || DEFAULT_COLORADO_REGULATORY_BOARDS[row.key] || ''
  }));
}
