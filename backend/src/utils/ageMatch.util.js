/**
 * Map free-text client descriptions to provider age_specialty bucket labels.
 * Buckets align with psych_today_age_specialty in formOptionSources.js.
 */

export const AGE_SPECIALTY_BUCKETS = Object.freeze([
  'Toddler (0-5)',
  'Children (6-10)',
  'Preteen (11-13)',
  'Teen (14-18)',
  'Adults (18+)',
  'Seniors (65+)'
]);

export function detectAgeBucketFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  if (/\btoddler\b|\binfant\b|\bbaby\b|\bbabies\b/i.test(text)) return 'Toddler (0-5)';
  if (/\bpreteen\b|\btween\b/i.test(text)) return 'Preteen (11-13)';
  if (/\bteen\b|\badolescen(t|ce)\b|\bhigh\s*school\b/i.test(text)) return 'Teen (14-18)';
  if (/\bsenior\b|\belder(ly)?\b|\bgeriatric\b/i.test(text)) return 'Seniors (65+)';
  if (/\badult\b/i.test(text)) return 'Adults (18+)';
  if (/\bchild(ren)?\b|\bpediatric\b|\bkid(s)?\b|\bboy(s)?\b|\bgirl(s)?\b|\bson\b|\bdaughter\b/i.test(text)) {
    // If numeric age below resolves more specifically, prefer that; default child band.
  }

  const m =
    text.match(/\b(\d{1,2})\s*(?:yo|y\/o|yr|yrs|year|years)\s*old?\b/i) ||
    text.match(/\b(?:age|aged)\s*(\d{1,2})\b/i) ||
    text.match(/\b(\d{1,2})\s*year\s*old\b/i);
  const n = m?.[1] ? parseInt(m[1], 10) : NaN;
  if (Number.isFinite(n)) {
    if (n <= 5) return 'Toddler (0-5)';
    if (n <= 10) return 'Children (6-10)';
    if (n <= 13) return 'Preteen (11-13)';
    if (n <= 18) return 'Teen (14-18)';
    if (n >= 65) return 'Seniors (65+)';
    return 'Adults (18+)';
  }

  if (/\bchild(ren)?\b|\bpediatric\b|\bkid(s)?\b|\bboy(s)?\b|\bgirl(s)?\b/i.test(text)) {
    return 'Children (6-10)';
  }

  return null;
}

export function normalizeAgeFilterValue(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  const exact = AGE_SPECIALTY_BUCKETS.find((b) => b.toLowerCase() === s);
  if (exact) return exact.toLowerCase();
  const partial = AGE_SPECIALTY_BUCKETS.find((b) => b.toLowerCase().includes(s) || s.includes(b.toLowerCase()));
  return partial ? partial.toLowerCase() : s;
}

export function providerServesAgeBucket(ageGroups, bucketOrFilter) {
  const groups = (ageGroups || []).map((g) => String(g).trim()).filter(Boolean);
  // No ages listed → provider is open to all age searches (still requires availability elsewhere).
  if (!groups.length) return true;

  const target = normalizeAgeFilterValue(bucketOrFilter || detectAgeBucketFromText(bucketOrFilter));
  if (!target) return true;
  const lower = groups.map((g) => g.toLowerCase());
  return lower.some((g) => g.includes(target) || target.includes(g));
}

export function providerHasDemographicRestrictions(ageGroups, focus = []) {
  const ages = (ageGroups || []).filter(Boolean);
  const pops = (focus || []).filter(Boolean);
  return ages.length + pops.length > 0;
}

export function textMatchesClinicalProfile({ text, specialties, modalities, ageGroups, focus }) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return true;

  const ageBucket = detectAgeBucketFromText(q);
  if (ageBucket && providerServesAgeBucket(ageGroups, ageBucket)) return true;

  const all = [...(specialties || []), ...(modalities || []), ...(ageGroups || []), ...(focus || [])]
    .map((s) => String(s).toLowerCase());
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.some((t) => all.some((v) => v.includes(t)))) return true;

  return false;
}
