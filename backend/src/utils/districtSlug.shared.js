/**
 * Stable URL slug for a district display name (per agency).
 */
export function slugifyDistrictName(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'district';
}

export function normalizeDistrictName(name) {
  const trimmed = String(name || '').trim();
  return trimmed || 'Other';
}

/**
 * Same real-world district often has several stored labels
 * (D11 vs District 11 vs Colorado Springs School District 11).
 * Public/UI canonical display uses short codes (D11, D12, DPS).
 */
export const DISTRICT_CANONICAL_GROUPS = [
  {
    canonicalName: 'D11',
    canonicalSlug: 'd11',
    shortCode: 'D11',
    aliases: [
      'd11',
      'district 11',
      'colorado springs school district 11',
      'csd 11',
      'csd11',
      'coloradosprings d11',
      'colorado springs d11'
    ]
  },
  {
    canonicalName: 'D12',
    canonicalSlug: 'd12',
    shortCode: 'D12',
    aliases: ['d12', 'district 12', 'colorado springs school district 12']
  },
  {
    canonicalName: 'DPS',
    canonicalSlug: 'dps',
    shortCode: 'DPS',
    aliases: ['dps', 'denver', 'denver public schools', 'denver public school']
  }
];

/** Preferred short labels for school create/edit pickers. */
export const DISTRICT_SHORT_CODE_OPTIONS = [
  { value: 'D11', label: 'D11' },
  { value: 'D12', label: 'D12' },
  { value: 'DPS', label: 'DPS' },
  { value: 'D13', label: 'D13' },
  { value: 'Other', label: 'Other' }
];

export function toPublicDistrictDisplayName(nameOrSlug) {
  const group = resolveCanonicalDistrict(nameOrSlug);
  return group.shortCode || group.canonicalName || normalizeDistrictName(nameOrSlug);
}

function aliasKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCanonicalDistrict(nameOrSlug) {
  const key = aliasKey(nameOrSlug);
  const slugKey = slugifyDistrictName(nameOrSlug).replace(/-/g, ' ');
  for (const group of DISTRICT_CANONICAL_GROUPS) {
    const aliasKeys = new Set(group.aliases.map(aliasKey));
    aliasKeys.add(aliasKey(group.canonicalName));
    aliasKeys.add(aliasKey(group.canonicalSlug));
    if (aliasKeys.has(key) || aliasKeys.has(slugKey)) return group;
  }
  const name = normalizeDistrictName(nameOrSlug);
  return {
    canonicalName: name,
    canonicalSlug: slugifyDistrictName(name),
    shortCode: name,
    aliases: [aliasKey(name)]
  };
}

export function districtNameMatchKeys(nameOrSlug) {
  const group = resolveCanonicalDistrict(nameOrSlug);
  const keys = new Set();
  keys.add(aliasKey(group.canonicalName));
  keys.add(aliasKey(group.canonicalSlug));
  for (const alias of group.aliases || []) keys.add(aliasKey(alias));
  return [...keys];
}

export function mergeDistrictRows(rows) {
  const bySlug = new Map();
  for (const row of rows || []) {
    const group = resolveCanonicalDistrict(row.slug || row.name);
    const existing = bySlug.get(group.canonicalSlug);
    const schoolCount = Number(row.schoolCount || row.school_count || 0);
    if (!existing) {
      bySlug.set(group.canonicalSlug, {
        id: Number(row.id || 0) || null,
        name: group.canonicalName,
        slug: group.canonicalSlug,
        schoolCount,
        memberSlugs: new Set([String(row.slug || '').trim().toLowerCase()].filter(Boolean)),
        memberIds: new Set(Number(row.id || 0) ? [Number(row.id)] : [])
      });
      continue;
    }
    existing.schoolCount += schoolCount;
    if (row.slug) existing.memberSlugs.add(String(row.slug).trim().toLowerCase());
    if (Number(row.id || 0)) existing.memberIds.add(Number(row.id));
  }
  return [...bySlug.values()]
    .map((row) => ({
      ...row,
      memberSlugs: [...row.memberSlugs],
      memberIds: [...row.memberIds]
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
