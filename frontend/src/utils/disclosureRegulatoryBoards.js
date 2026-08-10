/**
 * Frontend mirror of disclosure regulatory board constants for tenant settings UI.
 */

export const DEFAULT_DISCLOSURE_STATE = 'CO';

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

export function buildRegulatoryBoardDraft(overrides = {}) {
  return DISCLOSURE_LICENSE_TYPES.map((row) => ({
    key: row.key,
    label: row.label,
    defaultBoard: DEFAULT_COLORADO_REGULATORY_BOARDS[row.key] || '',
    board: String(overrides?.[row.key] ?? DEFAULT_COLORADO_REGULATORY_BOARDS[row.key] ?? '').trim()
  }));
}

export function regulatoryBoardsFromDraft(draftRows = []) {
  const out = {};
  for (const row of draftRows || []) {
    const key = String(row?.key || '').trim().toUpperCase();
    const board = String(row?.board ?? '').trim();
    if (!key || !board) continue;
    out[key] = board;
  }
  return out;
}
