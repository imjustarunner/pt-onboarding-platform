/**
 * Duplicate scoring, test-account heuristics, and field-level merge picks.
 * Pure helpers (no DB) so merge preview stays testable.
 */

export function normalizePersonName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  return false;
}

export function recencyMs(row = {}) {
  const stamps = [row.last_login, row.password_changed_at, row.updated_at, row.created_at]
    .map((v) => {
      if (!v) return 0;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    });
  return Math.max(0, ...stamps);
}

/**
 * Score 0–100. Exact name is strong; email/phone add more.
 */
export function scorePersonPair(a, b) {
  const aFirst = normalizePersonName(a.first_name || a.full_name?.split?.(' ')?.[0]);
  const bFirst = normalizePersonName(b.first_name || b.full_name?.split?.(' ')?.[0]);
  const aLast = normalizePersonName(a.last_name || a.full_name?.split?.(' ')?.slice(-1)?.[0]);
  const bLast = normalizePersonName(b.last_name || b.full_name?.split?.(' ')?.slice(-1)?.[0]);
  const aFull = normalizePersonName(a.full_name || `${a.first_name || ''} ${a.last_name || ''}`);
  const bFull = normalizePersonName(b.full_name || `${b.first_name || ''} ${b.last_name || ''}`);

  let score = 0;
  if (aFull && aFull === bFull) score = 82;
  else if (aLast && aLast === bLast && aFirst && aFirst === bFirst) score = 80;
  else if (aLast && aLast === bLast && aFirst && bFirst && aFirst.slice(0, 3) === bFirst.slice(0, 3)) score = 62;
  else if (aLast && aLast === bLast && (aFirst?.[0] === bFirst?.[0])) score = 48;
  else if (aLast && aLast === bLast) score = 36;

  const emailsA = new Set([a.email, a.work_email, a.personal_email].map(normalizeEmail).filter(Boolean));
  const emailsB = new Set([b.email, b.work_email, b.personal_email].map(normalizeEmail).filter(Boolean));
  for (const e of emailsA) {
    if (emailsB.has(e)) {
      score = Math.min(100, score + 22);
      break;
    }
  }

  const phonesA = [a.phone_number, a.personal_phone, a.work_phone, a.contact_phone]
    .map(normalizePhoneDigits)
    .filter((p) => p.length >= 7);
  const phonesB = [b.phone_number, b.personal_phone, b.work_phone, b.contact_phone]
    .map(normalizePhoneDigits)
    .filter((p) => p.length >= 7);
  if (phonesA.some((p) => phonesB.some((q) => p.slice(-10) === q.slice(-10)))) {
    score = Math.min(100, score + 16);
  }

  const dobA = String(a.date_of_birth || '').slice(0, 10);
  const dobB = String(b.date_of_birth || '').slice(0, 10);
  if (dobA && dobB && dobA === dobB) score = Math.min(100, score + 18);

  return score;
}

export function pickMergeField({ keepValue, otherValue, keepRecency, otherRecency, overrideValue }) {
  if (overrideValue !== undefined) {
    return { value: overrideValue, source: 'manual', reason: 'Manual override' };
  }
  const keepEmpty = isEmptyValue(keepValue);
  const otherEmpty = isEmptyValue(otherValue);
  if (keepEmpty && !otherEmpty) {
    return { value: otherValue, source: 'other', reason: 'Filled data over empty' };
  }
  if (!keepEmpty && otherEmpty) {
    return { value: keepValue, source: 'keep', reason: 'Keep already has data' };
  }
  if (keepEmpty && otherEmpty) {
    return { value: keepValue ?? otherValue ?? null, source: 'keep', reason: 'Both empty' };
  }
  if ((otherRecency || 0) > (keepRecency || 0)) {
    return { value: otherValue, source: 'other', reason: 'Newer data' };
  }
  return { value: keepValue, source: 'keep', reason: 'Keep is newer or equal' };
}

export function groupByConnectedPairs(rows, { minScore = 48, idKey = 'id' } = {}) {
  const n = rows.length;
  const parent = rows.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  };
  const pairScores = new Map();
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const score = scorePersonPair(rows[i], rows[j]);
      if (score >= minScore) {
        union(i, j);
        pairScores.set(`${i}:${j}`, score);
      }
    }
  }
  const buckets = new Map();
  rows.forEach((row, i) => {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(i);
  });
  const groups = [];
  for (const idxs of buckets.values()) {
    if (idxs.length < 2) continue;
    let best = 0;
    for (let a = 0; a < idxs.length; a += 1) {
      for (let b = a + 1; b < idxs.length; b += 1) {
        const key = `${Math.min(idxs[a], idxs[b])}:${Math.max(idxs[a], idxs[b])}`;
        best = Math.max(best, pairScores.get(key) || 0);
      }
    }
    const members = idxs.map((i) => rows[i]);
    members.sort((x, y) => recencyMs(y) - recencyMs(x) || Number(y[idKey]) - Number(x[idKey]));
    groups.push({
      matchPercent: best,
      proposedKeepId: members[0][idKey],
      members
    });
  }
  groups.sort((a, b) => b.matchPercent - a.matchPercent);
  return groups;
}

export const KNOWN_DEMO_FULL_NAMES = new Set([
  'karen kool',
  'sloppy lady',
  'ada lovelace',
  'admin one',
  'qr tester',
  'robin williams',
  'piper finch',
  'harry potter',
  'hermione granger',
  'ron weasley',
  'albus dumbledore',
  'severus snape',
  'minerva mcgonagall',
  'rubeus hagrid',
  'luna lovegood',
  'neville longbottom',
  'draco malfoy',
  'dolores umbridge',
  'remus lupin',
  'alastor moody',
  'kingsley shacklebolt',
  'nymphadora tonks',
  'filius flitwick',
  'pomona sprout',
  'jennifer ablondie',
  'amy carson',
  'jennifer thomas'
]);

export function heuristicTestReasons(row = {}) {
  const reasons = [];
  const full = normalizePersonName(`${row.first_name || ''} ${row.last_name || ''}`)
    || normalizePersonName(row.full_name);
  const hay = [
    row.email,
    row.username,
    row.work_email,
    row.agencies,
    row.agency_names,
    row.organization_name,
    full
  ].map((v) => String(v || '').toLowerCase()).join(' ');

  if (Number(row.is_demo) === 1) reasons.push('Marked as demo');
  if (Number(row.in_test_switcher) === 1) reasons.push('Test account switcher');
  if (KNOWN_DEMO_FULL_NAMES.has(full)) reasons.push('Known demo name');
  if (/\bhogwarts\b|\bdurmstrang\b|@hogwarts\.|@durmstrang\./i.test(hay)) reasons.push('Hogwarts / Durmstrang');
  if (/\bdemo\b|\btest(ing|er)?\b|\+test@/i.test(hay)) reasons.push('Name/email looks like a test');
  if (!row.last_login && /\bhogwarts\b|\bdemo\b|\btest/i.test(hay)) reasons.push('No login activity');
  if (!row.last_login && Number(row.is_demo) === 1) reasons.push('No login activity');
  if (Number(row.include_on_disclosure) === 0 && KNOWN_DEMO_FULL_NAMES.has(full)) {
    reasons.push('Removed from disclosure documents');
  }
  return [...new Set(reasons)];
}

export const USER_MERGE_FIELDS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'preferred_name', label: 'Preferred name' },
  { key: 'email', label: 'Login email' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'work_email', label: 'Work email' },
  { key: 'phone_number', label: 'Phone' },
  { key: 'personal_phone', label: 'Personal phone' },
  { key: 'work_phone', label: 'Work phone' },
  { key: 'title', label: 'Title' },
  { key: 'credential', label: 'Credential' },
  { key: 'department', label: 'Department' }
];

export const CLIENT_MERGE_FIELDS = [
  { key: 'full_name', label: 'Full name' },
  { key: 'initials', label: 'Initials' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'contact_phone', label: 'Phone' },
  { key: 'identifier_code', label: 'Identifier' },
  { key: 'grade', label: 'Grade' },
  { key: 'school_year', label: 'School year' },
  { key: 'status', label: 'Status' },
  { key: 'gender', label: 'Gender' },
  { key: 'address_street', label: 'Street' },
  { key: 'address_city', label: 'City' },
  { key: 'address_state', label: 'State' },
  { key: 'address_zip', label: 'ZIP' }
];

export function buildMergePreview({ keep, others, fields, fieldChoices = {} }) {
  const keepRecency = recencyMs(keep);
  const preview = fields.map((field) => {
    const choice = fieldChoices[field.key];
    let chosen = {
      value: keep[field.key],
      source: 'keep',
      reason: 'Keep default'
    };
    for (const other of others) {
      const override = choice === undefined
        ? undefined
        : (Number(choice) === Number(other.id) ? other[field.key]
          : Number(choice) === Number(keep.id) ? keep[field.key]
            : undefined);
      const pick = pickMergeField({
        keepValue: chosen.value,
        otherValue: other[field.key],
        keepRecency,
        otherRecency: recencyMs(other),
        overrideValue: choice !== undefined
          ? (Number(choice) === Number(keep.id)
            ? keep[field.key]
            : others.find((o) => Number(o.id) === Number(choice))?.[field.key])
          : undefined
      });
      // When looping multiple others without override, apply sequentially so filled/newer wins.
      if (choice === undefined) {
        chosen = pickMergeField({
          keepValue: chosen.value,
          otherValue: other[field.key],
          keepRecency: chosen.source === 'other' ? Math.max(keepRecency, recencyMs(other)) : keepRecency,
          otherRecency: recencyMs(other)
        });
      } else {
        chosen = pick;
        break;
      }
    }
    return {
      key: field.key,
      label: field.label,
      keepValue: keep[field.key] ?? null,
      otherValues: others.map((o) => ({ id: o.id, value: o[field.key] ?? null })),
      chosenValue: chosen.value ?? null,
      source: chosen.source,
      reason: chosen.reason,
      highlighted: chosen.source !== 'keep' || choice !== undefined
    };
  });
  return preview;
}
