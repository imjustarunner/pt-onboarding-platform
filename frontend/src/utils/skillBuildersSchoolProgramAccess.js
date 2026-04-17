import { isFeatureKeyAvailableAfterMerge } from './mergeAvailableAgencyFeatures.js';

export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

export function isTruthyFeatureFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * School-scoped Skill Builders (skills groups, school portal Skills area, coordinator/provider hub APIs).
 * Super admins bypass tenant flags for QA.
 */
export function canAccessSkillBuildersSchoolProgramSurfaces(opts = {}) {
  const role = String(opts.userRole || '').trim().toLowerCase();
  if (role === 'super_admin') return true;

  const globalJson = opts.platformAvailableAgencyFeaturesJson ?? null;
  const tenantMatrixJson =
    opts.tenantAvailableAgencyFeaturesOverrideJson ??
    opts.tenant_available_agency_features_json ??
    null;
  if (!isFeatureKeyAvailableAfterMerge(globalJson, tenantMatrixJson, 'skillBuildersSchoolProgramEnabled')) {
    return false;
  }

  const flags = parseFeatureFlags(opts.agencyFeatureFlags);
  return isTruthyFeatureFlag(flags.skillBuildersSchoolProgramEnabled);
}
