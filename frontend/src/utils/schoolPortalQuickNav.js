import { canAccessSchoolPortalsSurfaces } from './schoolPortalsAccess.js';

function normRole(role) {
  return String(role || '').trim().toLowerCase();
}

/** Admin, super admin, and support with the school portals feature enabled. */
export function canUseSchoolPortalQuickNav(opts = {}) {
  const role = normRole(opts.role);
  if (!['admin', 'super_admin', 'superadmin', 'support'].includes(role)) return false;
  return canAccessSchoolPortalsSurfaces({
    userRole: opts.role,
    agencyFeatureFlags: opts.agencyFeatureFlags,
    platformAvailableAgencyFeaturesJson: opts.platformAvailableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson: opts.tenantAvailableAgencyFeaturesOverrideJson
  });
}

export function schoolPortalDashboardPath(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return s ? `/${s}/dashboard` : null;
}

/** Public URL segment for a school portal (portal_url when set, else slug). */
export function resolveSchoolPortalSlug(row) {
  return String(
    row?.school_portal_url ||
    row?.portal_url ||
    row?.school_slug ||
    row?.slug ||
    ''
  )
    .trim()
    .toLowerCase();
}

export function mapSchoolOverviewToQuickNavEntry(row) {
  const slug = resolveSchoolPortalSlug(row);
  const name = String(row?.school_name || row?.name || '').trim();
  const district = String(row?.district_name || '').trim();
  if (!slug || !name) return null;
  return {
    id: slug,
    schoolId: row?.school_id ?? row?.id ?? null,
    name,
    slug,
    district,
    path: schoolPortalDashboardPath(slug)
  };
}

function subsequenceScore(haystack, query) {
  let hi = 0;
  let matched = 0;
  for (let qi = 0; qi < query.length; qi += 1) {
    const ch = query[qi];
    let found = false;
    while (hi < haystack.length) {
      if (haystack[hi] === ch) {
        matched += 1;
        hi += 1;
        found = true;
        break;
      }
      hi += 1;
    }
    if (!found) return 0;
  }
  return matched;
}

/**
 * Fuzzy score for a school name / district / slug against a query. Higher is better; 0 = no match.
 */
export function scoreSchoolPortalQuickNavEntry(query, entry) {
  const q = String(query || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  if (!q || !entry) return 0;

  const name = String(entry.name || '').toLowerCase();
  const district = String(entry.district || '').toLowerCase();
  const slug = String(entry.slug || '').toLowerCase();

  if (name === q) return 220;
  if (slug === q) return 210;
  if (name.startsWith(q)) return 180;
  if (slug.startsWith(q)) return 170;
  if (name.includes(q)) return 130;
  if (district.includes(q)) return 110;
  if (slug.includes(q.replace(/\s+/g, '-'))) return 100;

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => name.includes(t) || district.includes(t))) {
    return 95;
  }

  const sub = subsequenceScore(name.replace(/\s+/g, ''), q.replace(/\s+/g, ''));
  if (sub >= q.replace(/\s+/g, '').length && q.length >= 2) {
    return 50 + Math.min(25, sub);
  }

  return 0;
}

/**
 * Search cached school overview rows for quick nav.
 * @returns {Array<{ id, label, description, groupLabel, kind, path, score }>}
 */
export function searchSchoolPortalQuickNav(query, schools, { limit = 6 } = {}) {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return [];

  const entries = (schools || [])
    .map((row) => mapSchoolOverviewToQuickNavEntry(row))
    .filter(Boolean);

  return entries
    .map((entry) => {
      const score = scoreSchoolPortalQuickNavEntry(q, entry);
      if (!score) return null;
      const district = entry.district ? ` · ${entry.district}` : '';
      return {
        id: `school-portal-${entry.id}`,
        label: entry.name,
        description: `School portal${district}`,
        groupLabel: 'School Portal',
        kind: 'path',
        path: entry.path,
        score
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.label).localeCompare(String(b.label));
    })
    .slice(0, limit);
}
