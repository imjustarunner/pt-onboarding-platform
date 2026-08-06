/**
 * Shared search helpers for intake queue and client exchange lists.
 * Supports age bands (14-17), numeric ages, and terms like teen / adult.
 */

const TEEN_MIN = 13;
const TEEN_MAX = 19;
const ADULT_MIN = 18;

const TEEN_TERMS = new Set(['teen', 'teens', 'teenager', 'teenagers', 'adolescent', 'adolescents']);
const ADULT_TERMS = new Set(['adult', 'adults', 'grown']);
const CHILD_TERMS = new Set(['child', 'children', 'kid', 'kids', 'youth']);

function parseAgeBand(ageBand) {
  const raw = String(ageBand || '').trim();
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === 'adult' || s === 'adults') {
    return { min: ADULT_MIN, max: 120, raw, terms: ['adult', 'adults'] };
  }
  const range = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]), raw, terms: [] };
  }
  const single = s.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n, raw, terms: [] };
  }
  return { min: null, max: null, raw, terms: [s] };
}

function numericAgeFromBirthdate(value) {
  if (!value) return null;
  const str = String(value).trim().slice(0, 10);
  const d = new Date(`${str}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDelta = now.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

function ageBandOverlaps(min, max, low, high) {
  if (min == null || max == null) return false;
  return min <= high && max >= low;
}

function tokenMatchesAgeBand(token, ageBand) {
  const band = parseAgeBand(ageBand);
  if (!band) return false;
  const t = String(token || '').trim().toLowerCase();
  if (!t) return false;

  if (band.raw.toLowerCase().includes(t)) return true;
  for (const term of band.terms) {
    if (term.includes(t) || t.includes(term)) return true;
  }

  const asNum = Number(t);
  if (Number.isFinite(asNum) && band.min != null && band.max != null) {
    if (asNum >= band.min && asNum <= band.max) return true;
  }

  if (TEEN_TERMS.has(t)) {
    if (ageBandOverlaps(band.min, band.max, TEEN_MIN, TEEN_MAX)) return true;
  }
  if (ADULT_TERMS.has(t)) {
    if (band.min != null && band.min >= ADULT_MIN) return true;
    if (band.terms.some((x) => ADULT_TERMS.has(x))) return true;
  }
  if (CHILD_TERMS.has(t)) {
    if (ageBandOverlaps(band.min, band.max, 0, 17)) return true;
  }

  return false;
}

function tokenMatchesNumericAge(token, age) {
  if (age == null) return false;
  const t = String(token || '').trim().toLowerCase();
  if (!t) return false;

  const asNum = Number(t);
  if (Number.isFinite(asNum) && asNum === age) return true;
  if (String(age).includes(t)) return true;

  if (TEEN_TERMS.has(t) && age >= TEEN_MIN && age <= TEEN_MAX) return true;
  if (ADULT_TERMS.has(t) && age >= ADULT_MIN) return true;
  if (CHILD_TERMS.has(t) && age < ADULT_MIN) return true;

  return false;
}

/**
 * @param {string} haystack - lowercased text blob
 * @param {string[]} tokens - search tokens (any case)
 * @param {{ ageBands?: string[], numericAges?: number[] }} ageContext
 */
export function matchesQueueSearch(haystack, tokens, ageContext = {}) {
  const hay = String(haystack || '').toLowerCase();
  const list = (tokens || []).map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;

  const ageBands = ageContext.ageBands || [];
  const numericAges = ageContext.numericAges || [];

  return list.every((token) => {
    if (hay.includes(token)) return true;

    for (const band of ageBands) {
      if (tokenMatchesAgeBand(token, band)) return true;
    }
    for (const age of numericAges) {
      if (tokenMatchesNumericAge(token, age)) return true;
    }

    return false;
  });
}

export function buildExchangeListingSearchContext(listing) {
  const demo = listing?.demographics || {};
  const prefs = listing?.preferences || {};
  const problems = listing?.presentingProblems;
  const problemList = Array.isArray(problems)
    ? problems
    : problems && typeof problems === 'object'
      ? Object.values(problems).filter(Boolean)
      : [];

  const ageBands = [];
  if (demo.ageBand) ageBands.push(demo.ageBand);

  const parts = [
    listing?.clientType,
    listing?.notes,
    listing?.currentProviderName,
    listing?.clientInitials,
    listing?.clientIdentifierCode,
    listing?.clientIdentifier,
    demo.ageBand,
    demo.gender,
    ...problemList,
    prefs.modality,
    prefs.insurance,
    listing?.status
  ];

  return {
    haystack: parts.filter(Boolean).join(' '),
    ageBands,
    numericAges: []
  };
}

export function buildIntakeClientSearchContext(client) {
  const c = client || {};
  const meta = c.adaptiveMeta || {};
  const prefs = c.intakePreferences || {};
  const dob = meta.birthdate || c.dateOfBirth;
  const numericAge = numericAgeFromBirthdate(dob);

  const parts = [
    c.fullName,
    c.initials,
    c.identifierCode,
    c.contactPhone,
    meta.respondent?.email,
    meta.respondent?.relationship,
    meta.accomplishGoal,
    meta.homeAddress,
    meta.notes,
    ...(meta.concerns || []),
    prefs.presentingConcern,
    prefs.preferredModality,
    prefs.insuranceOrPayment,
    prefs.preferredTimeOfDay,
    ...(prefs.preferredDays || []),
    c.source,
    c.clientType
  ];

  if (numericAge != null) {
    parts.push(String(numericAge), `age ${numericAge}`);
  }

  return {
    haystack: parts.filter(Boolean).join(' '),
    ageBands: [],
    numericAges: numericAge != null ? [numericAge] : []
  };
}

export function intakeClientAge(client) {
  const c = client || {};
  return numericAgeFromBirthdate(c.adaptiveMeta?.birthdate || c.dateOfBirth);
}

export { numericAgeFromBirthdate, parseAgeBand };
