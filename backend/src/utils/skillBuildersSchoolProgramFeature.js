import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import PlatformBranding from '../models/PlatformBranding.model.js';

const FEATURE_KEY = 'skillBuildersSchoolProgramEnabled';

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function isTruthyFeatureFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function isExplicitlyFalseFeature(v) {
  if (v === false || v === 0) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'false' || s === '0' || s === 'off' || s === 'no';
}

/** Mirrors frontend merge: opt-in when absent from platform + tenant matrices. */
export function isSkillBuildersSchoolProgramOfferedAfterMerge(globalJson, tenantOverrideJson) {
  const tenant = parseJsonMaybe(tenantOverrideJson) || {};
  if (Object.prototype.hasOwnProperty.call(tenant, FEATURE_KEY)) {
    return tenant[FEATURE_KEY] !== false;
  }
  const global = parseJsonMaybe(globalJson) || {};
  if (Object.prototype.hasOwnProperty.call(global, FEATURE_KEY)) {
    return global[FEATURE_KEY] !== false;
  }
  return false;
}

async function loadParentSkillBuildersContext(parentAgencyId) {
  const aid = parseInt(String(parentAgencyId || ''), 10);
  if (!Number.isFinite(aid) || aid < 1) return null;

  const agency = await Agency.findById(aid);
  if (!agency) return null;

  let pb = null;
  try {
    pb = await PlatformBranding.get();
  } catch {
    pb = null;
  }
  const globalJson = pb?.available_agency_features_json ?? pb?.availableAgencyFeaturesJson ?? null;
  const tenantJson =
    agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson ?? null;
  const tenant = parseJsonMaybe(tenantJson) || {};
  const flags = parseJsonMaybe(agency.feature_flags) || {};
  const parentOn = isTruthyFeatureFlag(flags[FEATURE_KEY]);

  if (Object.prototype.hasOwnProperty.call(tenant, FEATURE_KEY) && tenant[FEATURE_KEY] === false) {
    return { offered: false, parentOn };
  }

  const mergeOffered = isSkillBuildersSchoolProgramOfferedAfterMerge(globalJson, tenantJson);
  const offered = mergeOffered || parentOn;
  return { offered, parentOn };
}

/**
 * Parent billing agency has Skill Builders school program (platform offer + tenant toggle).
 * When `schoolOrganizationId` is a school/program/learning org, that row's `feature_flags` may
 * explicitly enable the module without the parent toggle, or explicitly disable it even when the parent is on.
 * Super admin bypass is handled at call sites that receive `req`.
 */
export async function isSkillBuildersSchoolProgramActiveForParentAgencyId(
  parentAgencyId,
  schoolOrganizationId = null
) {
  const ctx = await loadParentSkillBuildersContext(parentAgencyId);
  if (!ctx) return false;
  let active = ctx.offered && ctx.parentOn;

  const sidRaw = schoolOrganizationId != null ? parseInt(String(schoolOrganizationId), 10) : NaN;
  if (!Number.isFinite(sidRaw) || sidRaw < 1) return active;

  const orgRow = await Agency.findById(sidRaw);
  const orgType = String(orgRow?.organization_type || '').toLowerCase();
  if (!orgRow || !['school', 'program', 'learning'].includes(orgType)) {
    return active;
  }

  const orgFlags = parseJsonMaybe(orgRow.feature_flags) || {};
  if (!Object.prototype.hasOwnProperty.call(orgFlags, FEATURE_KEY)) {
    return active;
  }
  const ex = orgFlags[FEATURE_KEY];
  if (isExplicitlyFalseFeature(ex)) {
    return false;
  }
  if (isTruthyFeatureFlag(ex)) {
    return ctx.offered;
  }
  return active;
}

/**
 * Batch resolve Skill Builders school-program activation for many school org ids (one DB round-trip for org rows).
 * @param {number} parentAgencyId
 * @param {number[]} schoolOrganizationIds
 * @returns {Promise<Map<number, boolean>>}
 */
export async function mapSkillBuildersSchoolProgramActiveForOrganizations(parentAgencyId, schoolOrganizationIds) {
  const map = new Map();
  const ctx = await loadParentSkillBuildersContext(parentAgencyId);
  const base = ctx ? ctx.offered && ctx.parentOn : false;
  const offered = ctx?.offered ?? false;

  const ids = [
    ...new Set(
      (schoolOrganizationIds || [])
        .map((x) => parseInt(String(x), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
  for (const id of ids) {
    map.set(id, base);
  }
  if (!ids.length || !ctx) return map;

  const ph = ids.map(() => '?').join(', ');
  try {
    const [rows] = await pool.execute(
      `SELECT id, organization_type, feature_flags FROM agencies WHERE id IN (${ph})`,
      ids
    );
    for (const row of rows || []) {
      const sid = Number(row.id);
      const orgType = String(row.organization_type || '').toLowerCase();
      if (!['school', 'program', 'learning'].includes(orgType)) continue;
      const orgFlags = parseJsonMaybe(row.feature_flags) || {};
      if (!Object.prototype.hasOwnProperty.call(orgFlags, FEATURE_KEY)) continue;
      const ex = orgFlags[FEATURE_KEY];
      if (isExplicitlyFalseFeature(ex)) {
        map.set(sid, false);
        continue;
      }
      if (isTruthyFeatureFlag(ex)) {
        map.set(sid, offered);
      }
    }
  } catch {
    /* keep base map */
  }
  return map;
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
export async function assertSkillBuildersSchoolProgramForRequest(req, parentAgencyId) {
  const role = String(req?.user?.role || '').trim().toLowerCase();
  if (role === 'super_admin') return { ok: true };

  const active = await isSkillBuildersSchoolProgramActiveForParentAgencyId(parentAgencyId);
  if (!active) {
    return {
      ok: false,
      status: 403,
      message: 'Skill Builders school program is not enabled for this agency'
    };
  }
  return { ok: true };
}
