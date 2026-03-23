/** Canonical grade values shown in UI and stored after normalization. */
export const STANDARD_GRADE_VALUES = [
  'K',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th'
];

export const STANDARD_GRADE_VALUE_SET = new Set(STANDARD_GRADE_VALUES);

/** First option empty, then K … 12th (for `<select>`). */
export const STANDARD_GRADE_SELECT_OPTIONS = [
  { value: '', label: '—' },
  ...STANDARD_GRADE_VALUES.map((v) => ({ value: v, label: v }))
];

function ordinalForNum(n) {
  if (n < 1 || n > 12) return null;
  const suf = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suf}`;
}

/**
 * Map free-text / legacy grade to K or 1st … 12th, or null if unknown.
 */
export function normalizeGradeToStandard(raw) {
  if (raw == null) return null;
  let t = String(raw).trim();
  if (!t) return null;

  const tl = t.toLowerCase().replace(/\s+/g, ' ');
  if (/^(k|kindergarten|kg|kindergarden)$/.test(tl)) return 'K';
  if (/^pre[-\s]?k$|^pk$|^prek$/.test(tl)) return 'K';

  t = tl.replace(/\bgrade\b/gi, ' ').replace(/\s+/g, ' ').trim();

  const ordMatch = t.match(/^(\d{1,2})\s*(st|nd|rd|th)?$/i);
  if (ordMatch) {
    const n = parseInt(ordMatch[1], 10);
    return ordinalForNum(n);
  }

  const onlyNum = t.match(/^(\d{1,2})$/);
  if (onlyNum) {
    const n = parseInt(onlyNum[1], 10);
    return ordinalForNum(n);
  }

  const wordMap = {
    first: '1st',
    second: '2nd',
    third: '3rd',
    fourth: '4th',
    fifth: '5th',
    sixth: '6th',
    seventh: '7th',
    eighth: '8th',
    ninth: '9th',
    tenth: '10th',
    eleventh: '11th',
    twelfth: '12th'
  };
  if (wordMap[t]) return wordMap[t];

  return null;
}

/**
 * Prefer canonical label; otherwise show trimmed raw, or em dash.
 */
export function formatGradeDisplay(raw) {
  const c = normalizeGradeToStandard(raw);
  if (c) return c;
  const s = String(raw ?? '').trim();
  return s || '—';
}

/**
 * For `<select>` v-model: standard options plus one row if the current value is non-standard (legacy).
 */
export function gradeSelectOptionsForModel(currentModelValue) {
  const base = STANDARD_GRADE_VALUES.map((v) => ({ value: v, label: v }));
  const v = String(currentModelValue ?? '').trim();
  if (v && !STANDARD_GRADE_VALUE_SET.has(v)) {
    return [
      { value: v, label: `${v} (non-standard — pick a standard grade)` },
      ...base
    ];
  }
  return base;
}

/** Value to send on save: canonical when parseable, else trimmed raw, else null. */
export function normalizeGradeForSave(raw) {
  const g = String(raw ?? '').trim();
  if (!g) return null;
  return normalizeGradeToStandard(g) || g;
}
