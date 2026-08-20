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
 */
export const DISTRICT_CANONICAL_GROUPS = [
  {
    canonicalName: 'Colorado Springs School District 11',
    canonicalSlug: 'colorado-springs-school-district-11',
    aliases: ['d11', 'district 11', 'colorado springs school district 11', 'csd 11', 'csd11']
  },
  {
    canonicalName: 'District 12',
    canonicalSlug: 'd12',
    aliases: ['d12', 'district 12']
  },
  {
    canonicalName: 'Denver Public Schools',
    canonicalSlug: 'dps',
    aliases: ['dps', 'denver', 'denver public schools']
  }
];

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
    aliases: [aliasKey(name)]
  };
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
