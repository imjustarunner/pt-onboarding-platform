/** Preset interview round keys for multi-round hiring. */
export const HIRING_INTERVIEW_ROUNDS = [
  { key: 'initial', label: 'Initial interview' },
  { key: 'second', label: 'Second interview' },
  { key: 'third', label: 'Third interview' },
  { key: 'panel', label: 'Panel interview' },
  { key: 'final', label: 'Final interview' },
  { key: 'reference', label: 'Reference check' },
  { key: 'other', label: 'Other' }
];

const ROUND_BY_KEY = new Map(HIRING_INTERVIEW_ROUNDS.map((r) => [r.key, r]));

export function roundLabelForKey(key, customLabel = '') {
  const k = String(key || '').trim().toLowerCase();
  if (k === 'other') {
    const custom = String(customLabel || '').trim();
    return custom || 'Interview';
  }
  return ROUND_BY_KEY.get(k)?.label || null;
}

export function isValidInterviewRoundKey(key) {
  const k = String(key || '').trim().toLowerCase();
  return !k || ROUND_BY_KEY.has(k);
}

/** Suggest the next round from prior scheduled/completed interviews for this candidate. */
export function suggestInterviewRound(existingInterviews = []) {
  const active = (existingInterviews || []).filter(
    (iv) => String(iv?.status || '').toLowerCase() !== 'cancelled'
  );
  const order = ['initial', 'second', 'third', 'panel'];
  const idx = Math.min(active.length, order.length - 1);
  return order[idx];
}
