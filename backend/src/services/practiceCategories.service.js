/**
 * Provider practice categories (agency-scoped) drive public enrollments
 * and staff_service_assignments for matching tenant_services.
 */

import pool from '../config/database.js';
import AgencyBusinessType from '../models/AgencyBusinessType.model.js';
import TenantService from '../models/TenantService.model.js';
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

export async function getPracticeCategoriesForUserAgency(agencyId, userId) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  const [categories, allowedCategories] = await Promise.all([
    UserAgencyPracticeCategory.listForUserAgency(aid, uid),
    getAllowedPracticeCategoriesForAgency(aid)
  ]);
  return {
    agencyId: aid,
    userId: uid,
    categories: categories.map((c) => c.category),
    allowedCategories,
    catalog: PRACTICE_CATEGORY_CODES
  };
}

/**
 * Replace practice categories for a user+agency and sync enrollments + staff assignments.
 * Rejects categories not enabled on the tenant.
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

  const rows = await UserAgencyPracticeCategory.replaceForUserAgency(aid, uid, normalized);
  await syncPublicEnrollments(aid, uid, normalized);
  await syncStaffServiceAssignments(aid, uid, normalized);

  return {
    agencyId: aid,
    userId: uid,
    categories: rows.map((c) => c.category),
    allowedCategories: Array.from(allowed),
    catalog: PRACTICE_CATEGORY_CODES
  };
}
