/**
 * Provider practice categories (agency-scoped) drive public enrollments
 * and staff_service_assignments for matching tenant_services.
 *
 * Resolution (mirrors indirect Log Time duties):
 *   effective = ((audienceDefaults ∪ grants) − revokes) ∩ tenantAllowed
 * When no defaults exist and user has no overrides, fall back to tenantAllowed
 * (legacy behavior for tenants that have not configured defaults yet).
 */

import pool from '../config/database.js';
import AgencyBusinessType from '../models/AgencyBusinessType.model.js';
import AgencyPracticeCategoryDefault, {
  PRACTICE_CATEGORY_AUDIENCE_KEYS,
  PRACTICE_CATEGORY_AUDIENCE_LABELS
} from '../models/AgencyPracticeCategoryDefault.model.js';
import TenantService from '../models/TenantService.model.js';
import User from '../models/User.model.js';
import UserAgencyPracticeCategory, {
  PRACTICE_CATEGORY_CODES
} from '../models/UserAgencyPracticeCategory.model.js';
import { PUBLIC_SERVICE_BY_BUSINESS_TYPE } from './businessTypeCapabilities.service.js';

/** Category → tenant_services.business_type codes they may deliver. */
export const SERVICE_BUSINESS_TYPES_BY_CATEGORY = {
  mental_health: ['mental_health'],
  tutoring: ['tutoring', 'learning'],
  coaching: ['coaching'],
  consulting: ['consulting']
};

/** Category must be enabled on the tenant as this business type (learning does not unlock tutoring category alone). */
export const TENANT_GATE_BY_CATEGORY = {
  mental_health: 'mental_health',
  tutoring: 'tutoring',
  coaching: 'coaching',
  consulting: 'consulting'
};

export { PRACTICE_CATEGORY_AUDIENCE_KEYS, PRACTICE_CATEGORY_AUDIENCE_LABELS };

export function enrollmentServiceTypesForCategories(categories = []) {
  const out = new Set();
  for (const raw of categories || []) {
    const cat = UserAgencyPracticeCategory.normalizeCategory(raw);
    if (!cat) continue;
    for (const st of PUBLIC_SERVICE_BY_BUSINESS_TYPE[cat] || []) out.add(st);
  }
  return Array.from(out);
}

export function serviceBusinessTypesForCategories(categories = []) {
  const out = new Set();
  for (const raw of categories || []) {
    const cat = UserAgencyPracticeCategory.normalizeCategory(raw);
    if (!cat) continue;
    for (const bt of SERVICE_BUSINESS_TYPES_BY_CATEGORY[cat] || []) out.add(bt);
  }
  return Array.from(out);
}

export async function getAllowedPracticeCategoriesForAgency(agencyId) {
  const rows = await AgencyBusinessType.listForAgency(agencyId);
  const enabled = new Set(
    (rows || [])
      .filter((r) => r.isEnabled)
      .map((r) => AgencyBusinessType.normalizeType(r.businessType))
      .filter(Boolean)
  );
  return PRACTICE_CATEGORY_CODES.filter((cat) => {
    const gate = TENANT_GATE_BY_CATEGORY[cat];
    return gate && enabled.has(gate);
  });
}

function userMatchesAudience(user, audienceKey) {
  const role = String(user?.role || '').toLowerCase();
  const isSupervisor =
    user?.has_supervisor_privileges === true
    || user?.has_supervisor_privileges === 1
    || role === 'supervisor';
  switch (audienceKey) {
    case 'provider':
      return role === 'provider';
    case 'provider_plus':
      return role === 'provider_plus';
    case 'providers':
      return role === 'provider' || role === 'provider_plus';
    case 'supervisors':
      return isSupervisor;
    case 'clinical_practice_assistant':
      return role === 'clinical_practice_assistant';
    case 'all_clinical':
      return (
        role === 'provider'
        || role === 'provider_plus'
        || role === 'clinical_practice_assistant'
        || isSupervisor
      );
    default:
      return false;
  }
}

/**
 * Categories that apply to this user from tenant audience defaults (before grants/revokes).
 */
export async function getDefaultPracticeCategoriesForUser(agencyId, user) {
  const aid = Number(agencyId || 0);
  if (!aid || !user) return [];
  const allowed = new Set(await getAllowedPracticeCategoriesForAgency(aid));
  let defaults = [];
  try {
    defaults = await AgencyPracticeCategoryDefault.listForAgency(aid);
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) return [];
    throw e;
  }
  const out = new Set();
  for (const row of defaults || []) {
    if (!row?.isEnabled) continue;
    if (!allowed.has(row.category)) continue;
    if (userMatchesAudience(user, row.audienceKey)) out.add(row.category);
  }
  return Array.from(out);
}

async function loadUserOverrideRows(agencyId, userId) {
  try {
    return await UserAgencyPracticeCategory.listForUserAgency(agencyId, userId);
  } catch (e) {
    const msg = String(e?.message || '');
    // Pre-migration: effect column missing — fall back to legacy select without effect.
    if (msg.includes('Unknown column') && msg.includes('effect')) {
      const [rows] = await pool.execute(
        `SELECT id, agency_id, user_id, category, is_active, 'grant' AS effect
         FROM user_agency_practice_categories
         WHERE agency_id = ? AND user_id = ? AND is_active = 1
         ORDER BY category ASC`,
        [Number(agencyId), Number(userId)]
      );
      return (rows || []).map((r) => UserAgencyPracticeCategory.mapRow(r));
    }
    throw e;
  }
}

/**
 * Resolve effective practice categories for booking / Account Dashboard.
 */
export async function resolveEffectivePracticeCategories(agencyId, userId) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const allowed = await getAllowedPracticeCategoriesForAgency(aid);
  const allowedSet = new Set(allowed);
  const user = await User.findById(uid);

  let defaultRows = [];
  try {
    defaultRows = await AgencyPracticeCategoryDefault.listForAgency(aid);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!(msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE'))) throw e;
  }
  const defaultCategories = [];
  if (user) {
    const seen = new Set();
    for (const row of defaultRows || []) {
      if (!row?.isEnabled) continue;
      if (!allowedSet.has(row.category)) continue;
      if (!userMatchesAudience(user, row.audienceKey)) continue;
      if (seen.has(row.category)) continue;
      seen.add(row.category);
      defaultCategories.push(row.category);
    }
  }

  const overrideRows = await loadUserOverrideRows(aid, uid);
  const grants = overrideRows.filter((r) => r.effect === 'grant').map((r) => r.category);
  const revokes = new Set(
    overrideRows.filter((r) => r.effect === 'revoke').map((r) => r.category)
  );

  const hasAnyDefaults = (defaultRows || []).length > 0;

  let effective;
  if (!hasAnyDefaults && !grants.length && !revokes.size) {
    // Legacy tenants with no defaults configured: keep previous booking fallback.
    effective = allowed.length ? [...allowed] : [];
  } else {
    const base = new Set([...defaultCategories, ...grants]);
    for (const r of revokes) base.delete(r);
    effective = Array.from(base).filter((c) => allowedSet.has(c));
  }

  const sources = {};
  for (const cat of PRACTICE_CATEGORY_CODES) {
    if (!allowedSet.has(cat)) {
      sources[cat] = 'disallowed';
      continue;
    }
    if (revokes.has(cat)) {
      sources[cat] = 'revoked';
      continue;
    }
    if (grants.includes(cat)) {
      sources[cat] = 'grant';
      continue;
    }
    if (defaultCategories.includes(cat)) {
      sources[cat] = 'default';
      continue;
    }
    sources[cat] = 'none';
  }

  return {
    agencyId: aid,
    userId: uid,
    categories: effective,
    assignedCategories: grants,
    revokedCategories: Array.from(revokes),
    defaultCategories,
    allowedCategories: allowed,
    catalog: PRACTICE_CATEGORY_CODES,
    sources
  };
}

async function syncPublicEnrollments(agencyId, userId, categories = []) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  const wanted = new Set(enrollmentServiceTypesForCategories(categories));
  const allManaged = new Set(
    enrollmentServiceTypesForCategories(PRACTICE_CATEGORY_CODES)
  );

  for (const serviceType of allManaged) {
    const active = wanted.has(serviceType) ? 1 : 0;
    if (active) {
      await pool.execute(
        `INSERT INTO provider_public_service_enrollments (agency_id, user_id, service_type, is_active)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = 1, updated_at = CURRENT_TIMESTAMP`,
        [aid, uid, serviceType]
      );
    } else {
      await pool.execute(
        `UPDATE provider_public_service_enrollments
         SET is_active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ? AND user_id = ? AND service_type = ?`,
        [aid, uid, serviceType]
      );
    }
  }
}

async function syncStaffServiceAssignments(agencyId, userId, categories = []) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  const wantedTypes = new Set(serviceBusinessTypesForCategories(categories));
  const managedTypes = new Set(serviceBusinessTypesForCategories(PRACTICE_CATEGORY_CODES));

  const services = await TenantService.listForAgency(aid, { includeInactive: false });
  const managedServices = (services || []).filter((s) =>
    managedTypes.has(AgencyBusinessType.normalizeType(s.businessType) || s.businessType)
  );

  for (const svc of managedServices) {
    const bt = AgencyBusinessType.normalizeType(svc.businessType) || svc.businessType;
    const shouldAssign = wantedTypes.has(bt);
    if (shouldAssign) {
      await pool.execute(
        `INSERT INTO staff_service_assignments (agency_id, tenant_service_id, user_id, is_active)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [aid, svc.id, uid]
      );
    } else {
      await pool.execute(
        `UPDATE staff_service_assignments
         SET is_active = 0
         WHERE agency_id = ? AND tenant_service_id = ? AND user_id = ?`,
        [aid, svc.id, uid]
      );
    }
  }
}

async function syncDerivedFromEffective(agencyId, userId) {
  const resolved = await resolveEffectivePracticeCategories(agencyId, userId);
  await syncPublicEnrollments(agencyId, userId, resolved.categories);
  await syncStaffServiceAssignments(agencyId, userId, resolved.categories);
  return resolved;
}

export async function getPracticeCategoriesForUserAgency(agencyId, userId) {
  return resolveEffectivePracticeCategories(agencyId, userId);
}

/**
 * Replace practice categories for a user+agency (legacy wholesale PUT).
 * Writes grant rows only; clears prior overrides.
 */
export async function setPracticeCategoriesForUserAgency(agencyId, userId, categories = []) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid) {
    const err = new Error('Invalid agencyId or userId');
    err.status = 400;
    throw err;
  }

  const allowed = new Set(await getAllowedPracticeCategoriesForAgency(aid));
  const normalized = [];
  const seen = new Set();
  for (const raw of categories || []) {
    const code = UserAgencyPracticeCategory.normalizeCategory(raw?.category || raw);
    if (!code || seen.has(code)) continue;
    if (!allowed.has(code)) {
      const err = new Error(
        `Practice category "${code}" is not enabled for this tenant’s business types`
      );
      err.status = 400;
      throw err;
    }
    seen.add(code);
    normalized.push(code);
  }

  await UserAgencyPracticeCategory.replaceForUserAgency(aid, uid, normalized);
  return syncDerivedFromEffective(aid, uid);
}

/**
 * Grant a single practice category without touching others.
 */
export async function addPracticeCategoryForUserAgency(agencyId, userId, category) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const code = UserAgencyPracticeCategory.normalizeCategory(category);
  if (!aid || !uid || !code) {
    const err = new Error('Invalid agencyId, userId, or category');
    err.status = 400;
    throw err;
  }
  const allowed = new Set(await getAllowedPracticeCategoriesForAgency(aid));
  if (!allowed.has(code)) {
    const err = new Error(
      `Practice category "${code}" is not enabled for this tenant’s business types`
    );
    err.status = 400;
    throw err;
  }
  await UserAgencyPracticeCategory.upsertSingle({
    agencyId: aid,
    userId: uid,
    category: code,
    effect: 'grant',
    isActive: true
  });
  return syncDerivedFromEffective(aid, uid);
}

/**
 * Remove a practice category for a user.
 * If it came from an audience default, writes a revoke override so the default no longer applies.
 * If it was only an explicit grant, deactivates that grant.
 */
export async function removePracticeCategoryForUserAgency(agencyId, userId, category) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const code = UserAgencyPracticeCategory.normalizeCategory(category);
  if (!aid || !uid || !code) {
    const err = new Error('Invalid agencyId, userId, or category');
    err.status = 400;
    throw err;
  }
  const user = await User.findById(uid);
  const defaults = user ? await getDefaultPracticeCategoriesForUser(aid, user) : [];
  if (defaults.includes(code)) {
    await UserAgencyPracticeCategory.upsertSingle({
      agencyId: aid,
      userId: uid,
      category: code,
      effect: 'revoke',
      isActive: true
    });
  } else {
    await UserAgencyPracticeCategory.removeSingle({
      agencyId: aid,
      userId: uid,
      category: code
    });
  }
  return syncDerivedFromEffective(aid, uid);
}

export async function getPracticeCategoryDefaultsForAgency(agencyId) {
  const aid = Number(agencyId || 0);
  const allowed = await getAllowedPracticeCategoriesForAgency(aid);
  let defaults = [];
  try {
    defaults = await AgencyPracticeCategoryDefault.listForAgency(aid, { includeDisabled: true });
  } catch (e) {
    const msg = String(e?.message || '');
    if (!(msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE'))) throw e;
  }
  return {
    agencyId: aid,
    defaults,
    allowedCategories: allowed,
    catalog: PRACTICE_CATEGORY_CODES,
    audienceKeys: PRACTICE_CATEGORY_AUDIENCE_KEYS,
    audienceLabels: PRACTICE_CATEGORY_AUDIENCE_LABELS
  };
}

/**
 * Replace tenant practice-category audience defaults.
 * Optionally seeds "providers" for each newly allowed category when seedMissing is true.
 */
export async function setPracticeCategoryDefaultsForAgency(agencyId, defaults = [], { seedMissing = false } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('Invalid agencyId');
    err.status = 400;
    throw err;
  }
  const allowed = new Set(await getAllowedPracticeCategoriesForAgency(aid));
  const cleaned = [];
  for (const raw of defaults || []) {
    const category = AgencyPracticeCategoryDefault.normalizeCategory(raw?.category);
    const audienceKey = AgencyPracticeCategoryDefault.normalizeAudience(
      raw?.audienceKey || raw?.audience_key
    );
    if (!category || !audienceKey) continue;
    if (!allowed.has(category)) {
      const err = new Error(
        `Practice category "${category}" is not enabled for this tenant’s business types`
      );
      err.status = 400;
      throw err;
    }
    cleaned.push({
      category,
      audienceKey,
      isEnabled: raw?.isEnabled !== false && Number(raw?.is_enabled) !== 0
    });
  }

  if (seedMissing) {
    const have = new Set(cleaned.filter((d) => d.isEnabled).map((d) => d.category));
    for (const cat of allowed) {
      if (have.has(cat)) continue;
      cleaned.push({ category: cat, audienceKey: 'providers', isEnabled: true });
      have.add(cat);
    }
  }

  const rows = await AgencyPracticeCategoryDefault.replaceForAgency(aid, cleaned);
  return {
    agencyId: aid,
    defaults: rows,
    allowedCategories: Array.from(allowed),
    catalog: PRACTICE_CATEGORY_CODES,
    audienceKeys: PRACTICE_CATEGORY_AUDIENCE_KEYS,
    audienceLabels: PRACTICE_CATEGORY_AUDIENCE_LABELS
  };
}

/**
 * Bulk-grant a practice category to everyone in an audience group (materialize grants).
 */
export async function bulkAssignPracticeCategory(agencyId, category, audienceKey) {
  const aid = Number(agencyId || 0);
  const code = UserAgencyPracticeCategory.normalizeCategory(category);
  const aud = AgencyPracticeCategoryDefault.normalizeAudience(audienceKey);
  if (!aid || !code || !aud) {
    const err = new Error('Invalid agencyId, category, or audienceKey');
    err.status = 400;
    throw err;
  }
  const allowed = new Set(await getAllowedPracticeCategoriesForAgency(aid));
  if (!allowed.has(code)) {
    const err = new Error(
      `Practice category "${code}" is not enabled for this tenant’s business types`
    );
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.role, u.has_supervisor_privileges
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ? AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
    [aid]
  );
  const userIds = (rows || [])
    .filter((r) => userMatchesAudience(r, aud))
    .map((r) => Number(r.id))
    .filter((n) => n > 0);

  let added = 0;
  for (const uid of userIds) {
    await UserAgencyPracticeCategory.upsertSingle({
      agencyId: aid,
      userId: uid,
      category: code,
      effect: 'grant',
      isActive: true
    });
    await syncDerivedFromEffective(aid, uid);
    added += 1;
  }
  return { agencyId: aid, category: code, audienceKey: aud, added, userIds };
}

/**
 * When a business type is newly enabled, ensure a providers default exists for its category.
 */
export async function ensureDefaultsForEnabledBusinessTypes(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const allowed = await getAllowedPracticeCategoriesForAgency(aid);
  let existing = [];
  try {
    existing = await AgencyPracticeCategoryDefault.listForAgency(aid, { includeDisabled: true });
  } catch {
    return null;
  }
  const haveEnabled = new Set(
    (existing || []).filter((d) => d.isEnabled).map((d) => `${d.category}::${d.audienceKey}`)
  );
  for (const cat of allowed) {
    const key = `${cat}::providers`;
    if (haveEnabled.has(key)) continue;
    // Only auto-seed if this agency has never configured any defaults for this category.
    const anyForCat = (existing || []).some((d) => d.category === cat);
    if (anyForCat) continue;
    await AgencyPracticeCategoryDefault.upsertOne(aid, {
      category: cat,
      audienceKey: 'providers',
      isEnabled: true
    });
  }
  return getPracticeCategoryDefaultsForAgency(aid);
}
