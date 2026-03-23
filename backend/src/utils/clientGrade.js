const ORDINALS = ['K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

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
 * Canonical when parseable, else trimmed raw, else null (for DB).
 */
export function normalizeGradeForSave(raw) {
  const g = String(raw ?? '').trim();
  if (!g) return null;
  return normalizeGradeToStandard(g) || g;
}

/**
 * Next grade for school-year rollover (K → 1st … 11th → 12th; 12th stays 12th).
 */
export function bumpGradeCanonical(raw) {
  const canon = normalizeGradeToStandard(raw);
  if (canon) {
    const idx = ORDINALS.indexOf(canon);
    if (idx < 0) return null;
    if (idx >= ORDINALS.length - 1) return ORDINALS[ORDINALS.length - 1];
    return ORDINALS[idx + 1];
  }
  const n = parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const next = Math.min(12, n + 1);
  return ordinalForNum(next);
}
