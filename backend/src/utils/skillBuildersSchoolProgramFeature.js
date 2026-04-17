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

/**
 * Parent billing agency has Skill Builders school program (platform offer + tenant toggle).
 * Super admin bypass is handled at call sites that receive `req`.
 */
export async function isSkillBuildersSchoolProgramActiveForParentAgencyId(parentAgencyId) {
  const aid = parseInt(String(parentAgencyId || ''), 10);
  if (!Number.isFinite(aid) || aid < 1) return false;

  const agency = await Agency.findById(aid);
  if (!agency) return false;

  let pb = null;
  try {
    pb = await PlatformBranding.get();
  } catch {
    pb = null;
  }
  const globalJson = pb?.available_agency_features_json ?? pb?.availableAgencyFeaturesJson ?? null;
  const tenantJson =
    agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson ?? null;
  const offered = isSkillBuildersSchoolProgramOfferedAfterMerge(globalJson, tenantJson);
  const flags = parseJsonMaybe(agency.feature_flags) || {};
  const tenantOn = isTruthyFeatureFlag(flags[FEATURE_KEY]);
  return offered && tenantOn;
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
